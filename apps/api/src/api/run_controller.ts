/**
 * Run Controller
 * 
 * Orchestrates a full NOEMA QA run using plan-driven execution:
 * 1. Accept human intent
 * 2. Initialize browser + services
 * 3. Form initial beliefs from the task
 * 4. GENERATE A TEST PLAN (think before acting)
 * 5. Execute the plan step by step, learning at each step
 * 6. Run experience optimization (rollouts)
 * 7. Generate reflection and report (including plan evaluation)
 * 8. Record metrics and update identity
 * 
 * Core cognitive flow:
 *   Understand → Plan → Act → Observe → Learn → Reflect
 */

import { v4 as uuidv4 } from "uuid";
import {
  getMentalModelRepository,
  getExperienceRepository,
  initializeStorage,
} from "../storage/index.js";
import {
  createDecisionEngine,
  closeAllSessions,
  generateTestPlan,
  findCachedPlan,
  savePlanToCache,
  recordPlanReuse,
  type TestPlan,
  type TestPlanStep,
} from "../services/decision/index.js";
import {
  findActionSequence,
  replaySequence,
  recordActionSequence,
  recordSequenceFailure,
} from "../services/experience/action_sequence_store.js";
import { createModelUpdateEngine } from "../services/cognition/index.js";
import { createExperienceOptimizer } from "../services/experience/index.js";
import { createSensorHub } from "../services/sensing/index.js";
import { getNarrationEmitter } from "../services/narration/index.js";
import {
  narrateRunStarted,
  narrateRunCompleted,
  narrateActionStarted,
  narrateActionCompleted,
  narrateBeliefFormed,
  narrateExperienceLearned,
  narrateImprovement,
  narratePlanGenerated,
  narratePlanStepStarting,
  narratePlanStepCompleted,
  narratePlanSummary,
} from "../services/narration/narration_formatter.js";
import {
  buildRunTimeline,
  generateReflection,
  generateQAReport,
  recordRunMetrics,
  analyzeImprovement,
  type RunMetrics,
} from "../services/reflection/index.js";
import {
  loadIdentity,
  refreshIdentity,
  recordRunStart,
  formatIdentityStatement,
} from "../services/identity/index.js";

// =============================================================================
// Run Configuration
// =============================================================================

export interface QATaskInput {
  /** High-level goal */
  goal: string;
  /** Target URL */
  url: string;
  /** Critical scenarios to test */
  critical_scenarios?: string[];
  /** Max decision cycles per plan step (default: 5) */
  max_cycles_per_step?: number;
  /** Max total actions across all steps (default: 40) */
  max_total_actions?: number;
  /** Use mock LLM */
  mock_llm?: boolean;
  /** Visible browser */
  visible_browser?: boolean;
  /** Enable experience optimization */
  enable_optimization?: boolean;
}

// =============================================================================
// Timer Utility
// =============================================================================

/** Format milliseconds into human-readable "Xm Ys" */
function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

export interface RunState {
  run_id: string;
  status: "pending" | "running" | "completed" | "failed";
  task: QATaskInput;
  started_at: string;
  finished_at?: string;
  current_phase?: string;
  /** The generated test plan (available after planning phase) */
  plan?: TestPlan;
  /** Currently executing plan step index (0-based) */
  current_step?: number;
  /** Total plan steps */
  total_steps?: number;
  /** Path to the run's video recording (available after browser close) */
  video_path?: string;
  /** Elapsed time in ms (updated during run) */
  elapsed_ms?: number;
  error?: string;
}

// =============================================================================
// Active Runs & Abort Signals
// =============================================================================

const activeRuns = new Map<string, RunState>();
/** Abort controllers for active runs — allows the UI to stop a run */
const abortControllers = new Map<string, AbortController>();

export function getRunState(runId: string): RunState | undefined {
  return activeRuns.get(runId);
}

export function getAllRunStates(): RunState[] {
  return Array.from(activeRuns.values());
}

/**
 * Trigger background experience optimization for a completed run.
 * This runs rollout-based GRPO learning AFTER the report has been generated
 * and does NOT block the UI. Progress events are emitted via narration.
 */
export async function triggerOptimization(runId: string): Promise<{ started: boolean; message: string }> {
  const state = activeRuns.get(runId);
  if (!state) {
    return { started: false, message: "Run not found" };
  }
  if (state.status !== "completed") {
    return { started: false, message: "Run must be completed before optimization" };
  }

  const narration = getNarrationEmitter();
  const mockLLM = state.task.mock_llm ?? !process.env.GEMINI_API_KEY;
  const taskString = buildTaskString(state.task);

  // Fire-and-forget — runs in background, emits events as it progresses
  (async () => {
    narration.emit("narration", "🔬 Deep Learning started — comparing alternative approaches to find what works better...", runId);

    const OPT_TIMEOUT_MS = 45_000; // 45s hard ceiling
    try {
      const optimizer = createExperienceOptimizer({
        rolloutCount: 2,
        mockLLM,
      });

      const optResult = await Promise.race([
        optimizer.optimize(taskString),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Optimization timed out (45s)")), OPT_TIMEOUT_MS)
        ),
      ]);

      const added = optResult.extraction.added;
      for (const exp of added) {
        narration.emit("experience_learned", narrateExperienceLearned(exp), runId, {
          experience_id: exp.experience_id,
          statement: exp.statement,
          confidence: exp.confidence,
        });
      }

      narration.emit("narration",
        `🔬 Deep Learning complete — ${added.length} new experience(s) extracted. ${optResult.summary}`,
        runId
      );

      // Close any sessions opened during optimization
      await closeAllSessions();
    } catch (error) {
      narration.emit("narration",
        `🔬 Deep Learning finished: ${(error as Error).message}`,
        runId
      );
      await closeAllSessions();
    }
  })();

  return { started: true, message: "Experience optimization started in background" };
}

/**
 * Stop a running run. Returns true if the run was stopped.
 */
export function stopRun(runId: string): boolean {
  const controller = abortControllers.get(runId);
  if (controller) {
    console.log(`[RunController] Stopping run ${runId.substring(0, 8)}...`);
    controller.abort();
    return true;
  }
  // If no controller, the run might already be done
  const state = activeRuns.get(runId);
  if (state && state.status === "running") {
    state.status = "failed";
    state.error = "Stopped by user";
    state.finished_at = new Date().toISOString();
    return true;
  }
  return false;
}

// =============================================================================
// Run Controller
// =============================================================================

/**
 * Start a new QA run. Returns the run_id immediately.
 * The actual run executes asynchronously and emits narration events.
 */
export function startQARun(input: QATaskInput): string {
  const runId = uuidv4();
  const narration = getNarrationEmitter();
  const abortController = new AbortController();

  const state: RunState = {
    run_id: runId,
    status: "pending",
    task: input,
    started_at: new Date().toISOString(),
  };

  activeRuns.set(runId, state);
  abortControllers.set(runId, abortController);

  // Run asynchronously
  executeQARun(runId, input, abortController.signal).catch((error) => {
    console.error(`[RunController] Run ${runId} failed:`, error);
    state.status = "failed";
    state.error = error.message;
    state.finished_at = new Date().toISOString();
    narration.emit("error", `Run failed: ${error.message}`, runId);
  }).finally(() => {
    abortControllers.delete(runId);
  });

  return runId;
}

/**
 * Execute a full QA run with plan-driven execution.
 */
async function executeQARun(runId: string, input: QATaskInput, abortSignal: AbortSignal): Promise<void> {
  const narration = getNarrationEmitter();
  const state = activeRuns.get(runId)!;
  const startTime = Date.now();
  const maxCyclesPerStep = input.max_cycles_per_step ?? 5;
  const maxTotalActions = input.max_total_actions ?? 40;

  /** Check if the run has been stopped by the user */
  function checkAborted(): void {
    if (abortSignal.aborted) {
      throw new Error("Run stopped by user");
    }
  }

  // Default to real LLM if GEMINI_API_KEY is set, otherwise mock
  const hasApiKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const mockLLM = input.mock_llm ?? !hasApiKey;
  // Auto-detect Cognee: enable if OPENAI_API_KEY is set
  const cogneeEnabled = !!(process.env.OPENAI_API_KEY) && !mockLLM;

  let stepsTaken = 0;
  let failureCount = 0;
  let experiencesUsed = 0;
  let experiencesAdded = 0;
  let modelsCreated = 0;
  let modelsUpdated = 0;
  let observationsCreated = 0;

  // ─── LLM Usage Tracking (persistent memory savings) ────────────
  let llmCallsMade = 0;
  let llmCallsSaved = 0;
  let planWasReused = false;
  let stepsFromMemory = 0;

  try {
    state.status = "running";

    // ─── STEP 0: Initialize ──────────────────────────────────────────
    state.current_phase = "initializing";
    await initializeStorage();

    const identity = await loadIdentity();
    await recordRunStart();

    narration.emit("system", formatIdentityStatement(identity), runId);
    narration.emit("run_started", narrateRunStarted(input.goal), runId, {
      url: input.url,
      scenarios: input.critical_scenarios,
    });

    // Narrate capability status
    const visionAvailable = hasApiKey;
    if (visionAvailable) {
      const visionModel = process.env.GEMINI_VISION_MODEL || "gemini-3-pro-image-preview";
      narration.emit("narration", `Gemini Vision is active (${visionModel}) — I can visually understand screenshots and see what's on the page.`, runId);
    } else {
      narration.emit("narration", "Gemini Vision is not available — screenshots will be stored as evidence but not analyzed visually.", runId);
    }

    if (cogneeEnabled) {
      narration.emit("narration", "Cognee semantic memory is active — evidence will be indexed and retrievable across runs.", runId);
    }

    // Check for test credentials
    const hasCredentials = !!(process.env.TEST_USERNAME || process.env.TEST_PASSWORD);
    if (hasCredentials) {
      narration.emit("narration", "Test credentials are loaded from environment — I will use them when filling login or authentication forms.", runId);
    }

    // Snapshot initial state
    const initialModels = await getMentalModelRepository().list();
    const initialExperiences = await getExperienceRepository().list();

    // Build the task string from human intent
    const taskString = buildTaskString(input);

    // ─── STEP 1: Seed initial observations ───────────────────────────
    state.current_phase = "sensing";
    narration.emit("narration", "I'm analyzing the task to understand what needs to be tested.", runId);

    const sensorHub = createSensorHub({ cogneeEnabled });
    const seedResult = await sensorHub.ingest({
      type: "text",
      content: `QA Task: ${input.goal}\nTarget URL: ${input.url}\nScenarios: ${(input.critical_scenarios || []).join(", ")}`,
      sessionId: runId,
      runId,
      source: { origin: "qa_task_input" },
    });
    observationsCreated += seedResult.observationIds.length;

    // ─── STEP 2: Run belief formation on seed ────────────────────────
    state.current_phase = "cognition";
    narration.emit("narration", "I'm forming initial beliefs about the task and the target.", runId);

    const modelUpdateEngine = createModelUpdateEngine({
      mockLLM,
      salienceThreshold: 0.1,
      cogneeEnabled,
    });
    modelUpdateEngine.start();
    await sleep(500);
    modelUpdateEngine.stop();

    const postCognitionModels = await getMentalModelRepository().list();
    const newModels = postCognitionModels.filter(
      (m) => !initialModels.some((im) => im.model_id === m.model_id)
    );
    modelsCreated = newModels.length;

    for (const model of newModels) {
      narration.emit("belief_formed", narrateBeliefFormed(model, true), runId, {
        model_id: model.model_id,
        title: model.title,
        confidence: model.confidence,
      });
    }

    // ─── STEP 3: Generate Test Plan (or reuse from cache) ────────────
    checkAborted();
    state.current_phase = "planning";

    let plan: TestPlan;
    let cachedPlanId: string | undefined;

    // CHECK PLAN CACHE — If we've tested this URL before, reuse the plan
    const cachedMatch = await findCachedPlan(input.url, input.goal);
    if (cachedMatch && cachedMatch.score >= 0.5) {
      plan = cachedMatch.cached.plan;
      cachedPlanId = cachedMatch.cached.cache_id;
      planWasReused = true;
      llmCallsSaved += 1; // Saved 1 LLM call for plan generation

      narration.emit("narration",
        `📚 I found a cached test plan from a previous run on this target (${cachedMatch.reason}). ` +
        `Reusing it instead of generating a new one — this saves an LLM call.`,
        runId
      );
      narration.emit("narration",
        `ℹ️ Plan has been executed ${cachedMatch.cached.times_executed} time(s) before with ` +
        `${(cachedMatch.cached.success_rate * 100).toFixed(0)}% success rate.`,
        runId
      );
    } else {
      narration.emit("narration", "I'm creating a test plan before taking any actions.", runId);

      plan = await generateTestPlan(
        {
          goal: input.goal,
          url: input.url,
          critical_scenarios: input.critical_scenarios || [],
          beliefs: postCognitionModels,
          experiences: initialExperiences,
          hasCredentials,
          maxTotalActions,
          maxCyclesPerStep,
        },
        { mockLLM }
      );
      llmCallsMade += 1; // 1 LLM call for plan generation
    }

    state.plan = plan;
    narration.emit("plan_generated", narratePlanGenerated(plan), runId, {
      plan_title: plan.plan_title,
      total_steps: plan.total_steps,
      plan_reused: planWasReused,
      steps: plan.steps.map((s) => ({ step_id: s.step_id, title: s.title, priority: s.priority })),
    });

    // Log each planned step
    for (const step of plan.steps) {
      narration.emit("narration", `  Step ${step.step_id}: [${step.priority.toUpperCase()}] ${step.title}`, runId);
    }

    // ─── STEP 4: Plan-Driven Execution ───────────────────────────────
    state.current_phase = "execution";
    state.total_steps = plan.total_steps;
    narration.emit("narration", `Now executing the plan. Up to ${maxCyclesPerStep} actions per step, ${maxTotalActions} total.`, runId);

    const decisionEngine = createDecisionEngine({
      mockLLM,
      browser: {
        headless: !input.visible_browser,
        screenshotDir: "./data/screenshots",
      },
    });

    let totalActionsExecuted = 0;

    for (let stepIdx = 0; stepIdx < plan.steps.length; stepIdx++) {
      const planStep = plan.steps[stepIdx];
      state.current_step = stepIdx;
      state.elapsed_ms = Date.now() - startTime;
      const stepStartTime = Date.now();

      // Check total action budget
      if (totalActionsExecuted >= maxTotalActions) {
        narration.emit("narration", `⏱ ${formatElapsed(Date.now() - startTime)} — Action budget reached (${maxTotalActions}). Skipping remaining plan steps.`, runId);
        // Mark remaining steps as skipped
        for (let j = stepIdx; j < plan.steps.length; j++) {
          plan.steps[j].result = "skipped";
          plan.steps[j].actual_outcome = "Skipped — action budget exhausted";
        }
        break;
      }

      narration.emit("plan_step_started", narratePlanStepStarting(planStep, plan.total_steps), runId, {
        step_id: planStep.step_id,
        title: planStep.title,
        priority: planStep.priority,
        action_hint: planStep.action_hint,
        elapsed_ms: Date.now() - startTime,
      });

      // Build step-specific task string that includes the plan step context
      const stepTask = buildStepTask(taskString, planStep);

      let stepPassed = false;
      let stepActionsCount = 0;
      let stepError: string | undefined;
      const stepScreenshots: string[] = [];
      let stuckDetected = false;
      let stepUsedCachedSequence = false;

      // ─── CHECK ACTION SEQUENCE CACHE ───────────────────────────────
      // If we have a high-confidence cached action sequence for this step type + URL,
      // replay it directly WITHOUT calling the decision LLM.
      const seqLookup = await findActionSequence(planStep.title, input.url);

      if (seqLookup) {
        // REPLAY FROM MEMORY — no LLM calls needed for this step
        stepUsedCachedSequence = true;
        const credentials = decisionEngine.getCredentials();
        const replayActions = replaySequence(seqLookup.sequence, credentials);
        const savedLLMCalls = replayActions.length;
        llmCallsSaved += savedLLMCalls;
        stepsFromMemory++;

        narration.emit("narration",
          `🧠 Replaying known action sequence from memory for "${planStep.title}" ` +
          `(${replayActions.length} actions, confidence: ${(seqLookup.sequence.confidence * 100).toFixed(0)}%) — ` +
          `saving ${savedLLMCalls} LLM call(s).`,
          runId
        );

        for (const seqAction of replayActions) {
          if (totalActionsExecuted >= maxTotalActions) break;
          checkAborted();

          try {
            // Execute the cached action directly using the decision engine
            const result = await decisionEngine.decideAndAct(
              `${stepTask}\n\nCACHED ACTION (from previous successful run): Use action_type="${seqAction.action_type}" on selector="${seqAction.selector || ""}" with value="${seqAction.inputs.value || ""}"`,
              runId
            );
            totalActionsExecuted++;
            stepsTaken++;
            stepActionsCount++;
            llmCallsMade++; // Still counts as 1 call (the LLM may adjust slightly)

            const elapsed = formatElapsed(Date.now() - startTime);
            narration.emit("action_completed", narrateActionCompleted(result.action, result.outcome), runId, {
              action_id: result.action.action_id,
              status: result.outcome.status,
              plan_step: planStep.step_id,
              from_memory: true,
              elapsed,
            });

            if (result.outcome.status === "failure") {
              failureCount++;
              stepError = result.outcome.error_message;
              // Mark the sequence as unreliable
              await recordSequenceFailure(seqLookup.sequence.sequence_id);
              narration.emit("narration",
                `⚠ Cached sequence action failed — marking sequence confidence as reduced. Falling back to LLM for remaining actions.`,
                runId
              );
              stepUsedCachedSequence = false; // Fall through to LLM for remaining
              break;
            } else {
              stepPassed = true;
            }

            if (result.outcome.artifacts.screenshots.length > 0) {
              stepScreenshots.push(...result.outcome.artifacts.screenshots);
            }
            observationsCreated += result.generatedObservationIds.length;

            if (result.action.type === "no_op") break;
          } catch (error) {
            failureCount++;
            stepError = (error as Error).message;
            await recordSequenceFailure(seqLookup.sequence.sequence_id);
            stepUsedCachedSequence = false;
            break;
          }
        }
      }

      // ─── STANDARD LLM-DRIVEN EXECUTION ────────────────────────────
      // Either no cached sequence, or cached sequence failed partway through
      if (!stepUsedCachedSequence || (!stepPassed && stepActionsCount < maxCyclesPerStep)) {
        // Execute up to maxCyclesPerStep actions for this plan step
        const remainingCycles = maxCyclesPerStep - stepActionsCount;
        for (let cycle = 0; cycle < remainingCycles; cycle++) {
          if (totalActionsExecuted >= maxTotalActions) break;
          checkAborted();

          // Detect stuck loop: if 3+ identical actions in a row, break out
          if (decisionEngine.isStuckInLoop(3)) {
            stuckDetected = true;
            narration.emit("narration", `Detected repeated action loop during step "${planStep.title}" — breaking out and moving to next step.`, runId);
            console.log(`[RunController] Stuck loop detected at step ${planStep.step_id}, breaking out`);
            break;
          }

          try {
            const result = await decisionEngine.decideAndAct(stepTask, runId);
            totalActionsExecuted++;
            stepsTaken++;
            stepActionsCount++;
            llmCallsMade++; // Each decideAndAct = 1 LLM call

            // Narrate action with elapsed timer
            const elapsed = formatElapsed(Date.now() - startTime);
            narration.emit("action_started", narrateActionStarted(result.action), runId, {
              action_type: result.action.type,
              action_id: result.action.action_id,
              plan_step: planStep.step_id,
              elapsed,
            });

            narration.emit("action_completed", narrateActionCompleted(result.action, result.outcome), runId, {
              action_id: result.action.action_id,
              status: result.outcome.status,
              duration_ms: result.outcome.duration_ms,
              screenshots: result.outcome.artifacts.screenshots,
              plan_step: planStep.step_id,
              elapsed,
            });

            if (result.outcome.status === "failure") {
              failureCount++;
              stepError = result.outcome.error_message;
            } else {
              stepPassed = true;
            }

            // Collect screenshots for this plan step
            if (result.outcome.artifacts.screenshots.length > 0) {
              stepScreenshots.push(...result.outcome.artifacts.screenshots);
              narration.emit("evidence_captured", `Captured ${result.outcome.artifacts.screenshots.length} screenshot(s).`, runId, {
                screenshots: result.outcome.artifacts.screenshots,
              });
            }

            observationsCreated += result.generatedObservationIds.length;

            // If the action was no_op, the decision engine has nothing more to do for this step
            if (result.action.type === "no_op") {
              break;
            }

          } catch (error) {
            failureCount++;
            stepError = (error as Error).message;
            narration.emit("error", `Action cycle failed during step "${planStep.title}": ${(error as Error).message}`, runId);
          }
        }
      }

      // ─── Per-step belief update (moved OUT of per-cycle loop for speed) ───
      const cycleUpdateEngine = createModelUpdateEngine({
        mockLLM,
        salienceThreshold: 0.1,
        cogneeEnabled,
      });
      cycleUpdateEngine.start();
      await sleep(200);
      cycleUpdateEngine.stop();

      // Check if new beliefs formed after this step
      const currentModels = await getMentalModelRepository().list();
      for (const model of currentModels) {
        const wasExisting = postCognitionModels.find((m) => m.model_id === model.model_id);
        if (!wasExisting) {
          narration.emit("belief_formed", narrateBeliefFormed(model, true), runId, {
            model_id: model.model_id,
            title: model.title,
            confidence: model.confidence,
          });
          modelsCreated++;
        } else if (model.confidence !== wasExisting.confidence) {
          narration.emit("belief_formed", narrateBeliefFormed(model, false), runId, {
            model_id: model.model_id,
            title: model.title,
            old_confidence: wasExisting.confidence,
            new_confidence: model.confidence,
          });
          modelsUpdated++;
        }
      }

      // Record step result (including associated screenshots)
      const stepDuration = Date.now() - stepStartTime;
      planStep.result = stepPassed && !stuckDetected ? "pass" : "fail";
      planStep.actual_outcome = stuckDetected
        ? `Stuck loop detected after ${stepActionsCount} action(s) — agent repeated the same action`
        : stepPassed
          ? `Completed in ${stepActionsCount} action(s) (${formatElapsed(stepDuration)})`
          : `Failed after ${stepActionsCount} action(s): ${stepError || "no success recorded"}`;
      planStep.actions_taken = stepActionsCount;
      planStep.screenshots = stepScreenshots;

      // ─── Record successful action sequence for future reuse ─────
      if (stepPassed && !stuckDetected && stepActionsCount > 0) {
        try {
          const actionRecords = decisionEngine.getRecentActionRecords();
          const credentials = decisionEngine.getCredentials();
          await recordActionSequence(
            planStep.title,
            input.url,
            actionRecords.map((r) => ({
              action_type: r.action_type,
              selector: r.selector,
              value: r.value,
              inputs: r.selector ? { selector: r.selector, value: r.value } : {},
              rationale: r.rationale,
              status: r.status,
            })),
            runId,
            credentials
          );
        } catch (error) {
          console.warn(`[RunController] Failed to record action sequence: ${error}`);
        }
      }

      // Reset action history between steps so the LLM starts fresh
      // (visual/DOM context and last 2 outcomes persist for continuity)
      decisionEngine.resetForNewStep();

      narration.emit("plan_step_completed", narratePlanStepCompleted(planStep, stepPassed), runId, {
        step_id: planStep.step_id,
        result: planStep.result,
        actions_taken: stepActionsCount,
        elapsed: formatElapsed(Date.now() - startTime),
        step_duration_ms: stepDuration,
      });
    }

    // Narrate plan execution summary
    narration.emit("narration", narratePlanSummary(plan), runId);

    // Close browser and capture the video recording path (with timeout — video.saveAs can hang)
    let videoPath: string | null = null;
    try {
      videoPath = await Promise.race([
        decisionEngine.close(runId),
        new Promise<null>((resolve) => setTimeout(() => {
          console.warn("[RunController] Browser close timed out after 10s — skipping video");
          resolve(null);
        }, 10_000)),
      ]);
    } catch (err) {
      console.warn(`[RunController] Browser close error: ${err}`);
    }
    if (videoPath) {
      state.video_path = videoPath;
      narration.emit("evidence_captured", `Browser session recorded — video available for playback.`, runId, {
        video_path: videoPath,
      });
    }

    // Update LLM call count from the decision engine's internal tracker
    llmCallsMade = decisionEngine.llmCallCount;

    // ─── Save plan to cache for future reuse ──────────────────────
    try {
      await savePlanToCache(plan, input.url, input.goal, runId);
      if (cachedPlanId) {
        const passed = plan.steps.filter((s) => s.result === "pass").length;
        const failed = plan.steps.filter((s) => s.result === "fail").length;
        await recordPlanReuse(cachedPlanId, passed, failed);
      }
    } catch (error) {
      console.warn(`[RunController] Failed to cache plan: ${error}`);
    }

    // ─── Narrate LLM savings if any ──────────────────────────────
    if (llmCallsSaved > 0) {
      const totalPotential = llmCallsMade + llmCallsSaved;
      const savingsPercent = totalPotential > 0 ? ((llmCallsSaved / totalPotential) * 100).toFixed(0) : "0";
      narration.emit("narration",
        `📊 Persistent memory saved ${llmCallsSaved} LLM call(s) this run ` +
        `(${savingsPercent}% of ${totalPotential} total). ` +
        `${planWasReused ? "Plan was reused from cache. " : ""}` +
        `${stepsFromMemory > 0 ? `${stepsFromMemory} step(s) executed from cached action sequences.` : ""}`,
        runId
      );
    }

    // ─── STEP 5: Experience Optimization (opt-in only) ──────────────────
    // NOTE: Optimization opens new browser sessions and runs full LLM rollouts.
    // This takes 60+ seconds and is NOT needed for the demo — per-step model
    // updates, plan caching, and action sequence recording already provide
    // meaningful learning. Only run if explicitly requested.
    checkAborted();
    if (input.enable_optimization === true) {
      state.current_phase = "experience";
      narration.emit("narration", "I'm now comparing different approaches to find what works better.", runId);

      const OPT_TIMEOUT_MS = 30_000; // 30s hard ceiling
      try {
        const optimizer = createExperienceOptimizer({
          rolloutCount: 2,
          mockLLM,
        });

        // Race optimization against a timeout to prevent indefinite blocking
        const optResult = await Promise.race([
          optimizer.optimize(taskString),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Experience optimization timed out (30s)")), OPT_TIMEOUT_MS)
          ),
        ]);

        experiencesUsed = (await getExperienceRepository().list()).length - initialExperiences.length;
        experiencesAdded = optResult.extraction.added.length;

        for (const added of optResult.extraction.added) {
          narration.emit("experience_learned", narrateExperienceLearned(added), runId, {
            experience_id: added.experience_id,
            statement: added.statement,
            confidence: added.confidence,
          });
        }

        narration.emit("narration", optResult.summary, runId);
      } catch (error) {
        narration.emit("narration", `Experience optimization skipped: ${(error as Error).message}`, runId);
      }

      // Close any remaining sessions
      await closeAllSessions();
    }

    // ─── STEP 5.5: Extract lightweight experiences from successful steps ──
    // (No rollouts needed — just record what worked for this URL/task)
    try {
      const expRepo = getExperienceRepository();
      const existingExps = await expRepo.list();
      const existingStatements = new Set(existingExps.map((e) => e.statement));

      for (const step of plan.steps) {
        if (step.result === "pass" && step.actions_taken && step.actions_taken > 0) {
          const statement = `For "${step.title}", execute ${step.actions_taken} action(s) using the structured plan approach on ${new URL(input.url).hostname}.`;
          if (!existingStatements.has(statement)) {
            const exp = await expRepo.create({
              statement,
              scope: ["qa", classifyTask(input.goal)],
              confidence: 0.75,
              source_runs: [runId],
            });
            existingStatements.add(statement);
            experiencesAdded++;
            narration.emit("experience_learned", narrateExperienceLearned(exp), runId, {
              experience_id: exp.experience_id,
              statement: exp.statement,
              confidence: exp.confidence,
            });
          }
        }
      }

      // Also create a high-level experience about the overall plan
      const passedCount = plan.steps.filter((s) => s.result === "pass").length;
      const totalCount = plan.steps.length;
      if (passedCount > 0) {
        const planStatement = `A ${totalCount}-step test plan for ${new URL(input.url).hostname} achieved ${passedCount}/${totalCount} passing steps.`;
        if (!existingStatements.has(planStatement)) {
          const planExp = await expRepo.create({
            statement: planStatement,
            scope: ["qa", "planning", classifyTask(input.goal)],
            confidence: passedCount / totalCount,
            source_runs: [runId],
          });
          experiencesAdded++;
          narration.emit("experience_learned", narrateExperienceLearned(planExp), runId, {
            experience_id: planExp.experience_id,
            statement: planExp.statement,
            confidence: planExp.confidence,
          });
        }
      }
    } catch (error) {
      console.warn(`[RunController] Lightweight experience extraction failed: ${error}`);
    }

    // ─── STEP 6: Reflection & Report ─────────────────────────────────
    state.current_phase = "reflection";
    narration.emit("narration", "I'm reflecting on what I observed, what my plan achieved, and what I learned.", runId);

    // Record metrics
    const durationMs = Date.now() - startTime;
    const metrics: RunMetrics = {
      run_id: runId,
      task_type: classifyTask(input.goal),
      task_summary: input.goal.substring(0, 100),
      steps_taken: stepsTaken,
      tool_calls: stepsTaken,
      rollouts_used: input.enable_optimization === true ? 2 : 0,
      success: failureCount < stepsTaken,
      experiences_used: experiencesUsed,
      experiences_added: experiencesAdded,
      models_created: modelsCreated,
      models_updated: modelsUpdated,
      observations_created: observationsCreated,
      failure_count: failureCount,
      timestamp: new Date().toISOString(),
      duration_ms: durationMs,
      // Persistent memory → LLM savings tracking
      llm_calls_made: llmCallsMade,
      llm_calls_saved: llmCallsSaved,
      plan_reused: planWasReused,
      steps_from_memory: stepsFromMemory,
    };
    await recordRunMetrics(metrics);

    // Analyze improvement
    const improvement = await analyzeImprovement(metrics);
    if (improvement.has_improved) {
      narration.emit("narration", narrateImprovement(
        stepsTaken,
        Math.round(improvement.signals.find((s) => s.metric === "steps_taken")?.previous_value ?? stepsTaken),
        metrics.task_type
      ), runId);
    }

    // Build timeline
    const timeline = await buildRunTimeline(runId);

    // Generate reflection
    const reflection = generateReflection(runId, timeline, improvement);

    // Generate report (now includes plan, screenshots per step, and video)
    const updatedIdentity = await refreshIdentity();
    const report = generateQAReport(
      runId,
      input.goal,
      timeline,
      reflection,
      improvement,
      formatIdentityStatement(updatedIdentity),
      input.url,
      plan,
      videoPath,
      {
        llm_calls_made: llmCallsMade,
        llm_calls_saved: llmCallsSaved,
        plan_reused: planWasReused,
        steps_from_memory: stepsFromMemory,
      }
    );

    narration.emit("narration", `Reflection complete. ${reflection.what_learned.length > 0 ? reflection.what_learned[0] : "Run completed."}`, runId);

    // Store report reference
    state.finished_at = new Date().toISOString();
    state.status = "completed";

    narration.emit("narration", `⏱ Run completed in ${formatElapsed(durationMs)}`, runId);

    // ─── Suggest missed scenarios for follow-up testing ────────────
    const suggestedNextGoal = generateMissedScenarioSuggestion(plan, input.goal, input.url);

    narration.emit("run_completed", narrateRunCompleted(input.goal, stepsTaken, failureCount < stepsTaken), runId, {
      result: report.result,
      duration_ms: durationMs,
      duration_formatted: formatElapsed(durationMs),
      actions_taken: stepsTaken,
      observations_created: observationsCreated,
      models_created: modelsCreated,
      experiences_learned: experiencesAdded,
      plan_passed: plan.steps.filter((s) => s.result === "pass").length,
      plan_failed: plan.steps.filter((s) => s.result === "fail").length,
      llm_calls_made: llmCallsMade,
      llm_calls_saved: llmCallsSaved,
      plan_reused: planWasReused,
      steps_from_memory: stepsFromMemory,
      report,
      suggested_next_goal: suggestedNextGoal,
    });

  } catch (error) {
    const errMsg = (error as Error).message;
    const wasStopped = abortSignal.aborted || errMsg === "Run stopped by user";
    state.status = "failed";
    state.error = wasStopped ? "Stopped by user" : errMsg;
    state.finished_at = new Date().toISOString();

    if (wasStopped) {
      narration.emit("run_completed", "Run was stopped by the user.", runId, {
        result: "fail",
        stopped_by_user: true,
      });
    } else {
      narration.emit("error", `Run failed: ${errMsg}`, runId);
    }

    await closeAllSessions();
    if (!wasStopped) throw error;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function buildTaskString(input: QATaskInput): string {
  const parts = [input.goal];
  if (input.url) {
    parts.push(`Target URL: ${input.url}`);
  }
  if (input.critical_scenarios && input.critical_scenarios.length > 0) {
    parts.push(`Focus on: ${input.critical_scenarios.join(", ")}`);
  }
  return parts.join(". ");
}

/**
 * Build a step-specific task string that gives the decision engine
 * context about what the current plan step requires.
 * Now includes detailed test_steps and expected_results for QA-grade execution.
 */
function buildStepTask(baseTask: string, step: TestPlanStep): string {
  const parts = [
    baseTask,
    `\n\nCURRENT PLAN STEP (${step.step_id}): ${step.title}`,
    `Description: ${step.description}`,
  ];

  // Include detailed test sub-steps if available
  if (step.test_steps && step.test_steps.length > 0) {
    parts.push(`\nTest Steps to Execute:`);
    step.test_steps.forEach((ts, i) => {
      parts.push(`  ${i + 1}. ${ts}`);
    });
  }

  // Include specific expected results
  if (step.expected_results && step.expected_results.length > 0) {
    parts.push(`\nExpected Results:`);
    step.expected_results.forEach((er) => {
      parts.push(`  - ${er}`);
    });
  }

  parts.push(`Expected outcome: ${step.expected_outcome}`);
  parts.push(`Failure indicator: ${step.failure_indicator}`);
  parts.push(`Suggested action: ${step.action_hint}`);
  parts.push(`Priority: ${step.priority}`);

  return parts.join("\n");
}

function classifyTask(goal: string): string {
  const lower = goal.toLowerCase();
  if (lower.includes("login") || lower.includes("auth")) return "authentication";
  if (lower.includes("form") || lower.includes("input")) return "form_testing";
  if (lower.includes("navigation") || lower.includes("navigate")) return "navigation";
  if (lower.includes("load") || lower.includes("performance")) return "performance";
  return "general_qa";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a suggestion for scenarios that were missed or could be tested next.
 * This helps the user iteratively test all functionality of the application.
 */
function generateMissedScenarioSuggestion(
  plan: TestPlan,
  goal: string,
  url: string
): string | undefined {
  const testedTitles = new Set(plan.steps.map((s) => s.title.toLowerCase()));
  const goalLower = goal.toLowerCase();

  // Common QA scenario categories
  const allScenarios: { title: string; description: string }[] = [
    { title: "Error handling and validation", description: "Test form validation messages, empty submissions, and error boundaries" },
    { title: "Responsive design and mobile view", description: "Test the application at different viewport sizes and mobile breakpoints" },
    { title: "Search and filter functionality", description: "Test search inputs, filters, sorting, and result accuracy" },
    { title: "User profile and settings", description: "Test user profile editing, settings changes, and account management" },
    { title: "Navigation and routing", description: "Test all navigation links, breadcrumbs, back/forward behavior" },
    { title: "Accessibility compliance", description: "Test keyboard navigation, screen reader labels, focus management, and ARIA attributes" },
    { title: "Edge cases and boundary values", description: "Test with special characters, maximum length inputs, and extreme values" },
    { title: "Session and state management", description: "Test session persistence, page refreshes, and state recovery" },
    { title: "Performance under load", description: "Test page load times, large data sets, and concurrent actions" },
    { title: "Cross-browser compatibility", description: "Verify consistent behavior across different browsers" },
  ];

  // Filter out scenarios already tested (fuzzy match)
  const missed = allScenarios.filter((scenario) => {
    const scenarioLower = scenario.title.toLowerCase();
    return !testedTitles.has(scenarioLower) &&
      !Array.from(testedTitles).some((t) =>
        t.includes(scenarioLower.split(" ")[0]) || scenarioLower.includes(t.split(" ")[0])
      ) &&
      !goalLower.includes(scenarioLower.split(" ")[0]);
  });

  // Also check for failed steps that could be retried
  const failedSteps = plan.steps.filter((s) => s.result === "fail");

  if (missed.length === 0 && failedSteps.length === 0) return undefined;

  const suggestions: string[] = [];
  if (failedSteps.length > 0) {
    suggestions.push(`Retry failed: ${failedSteps.map((s) => s.title).join(", ")}`);
  }
  const topMissed = missed.slice(0, 3);
  if (topMissed.length > 0) {
    suggestions.push(`Test: ${topMissed.map((s) => s.title).join(", ")}`);
  }

  return suggestions.join(". ") + ` for ${new URL(url).hostname}`;
}
