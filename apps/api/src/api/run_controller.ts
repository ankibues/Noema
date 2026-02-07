/**
 * Run Controller
 * 
 * Orchestrates a full NOEMA QA run:
 * 1. Accept human intent
 * 2. Initialize browser + services
 * 3. Run decision-action-sensing loops with narration
 * 4. Run experience optimization (rollouts)
 * 5. Generate reflection and report
 * 6. Record metrics and update identity
 * 
 * This controller ties together ALL phases:
 * - Phase 3: Sensing (observations)
 * - Phase 4: Cognition (belief updates)
 * - Phase 5: Decision (actions)
 * - Phase 6: Experience (learning)
 * - Phase 7: Narration + Reflection + Metrics
 */

import { v4 as uuidv4 } from "uuid";
import {
  getMentalModelRepository,
  getExperienceRepository,
  initializeStorage,
} from "../storage/index.js";
import { createDecisionEngine, closeAllSessions } from "../services/decision/index.js";
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
  /** Max decision cycles per scenario */
  max_cycles?: number;
  /** Use mock LLM */
  mock_llm?: boolean;
  /** Visible browser */
  visible_browser?: boolean;
  /** Enable experience optimization */
  enable_optimization?: boolean;
}

export interface RunState {
  run_id: string;
  status: "pending" | "running" | "completed" | "failed";
  task: QATaskInput;
  started_at: string;
  finished_at?: string;
  current_phase?: string;
  error?: string;
}

// =============================================================================
// Active Runs
// =============================================================================

const activeRuns = new Map<string, RunState>();

export function getRunState(runId: string): RunState | undefined {
  return activeRuns.get(runId);
}

export function getAllRunStates(): RunState[] {
  return Array.from(activeRuns.values());
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

  const state: RunState = {
    run_id: runId,
    status: "pending",
    task: input,
    started_at: new Date().toISOString(),
  };

  activeRuns.set(runId, state);

  // Run asynchronously
  executeQARun(runId, input).catch((error) => {
    console.error(`[RunController] Run ${runId} failed:`, error);
    state.status = "failed";
    state.error = error.message;
    state.finished_at = new Date().toISOString();
    narration.emit("error", `Run failed: ${error.message}`, runId);
  });

  return runId;
}

/**
 * Execute a full QA run.
 */
async function executeQARun(runId: string, input: QATaskInput): Promise<void> {
  const narration = getNarrationEmitter();
  const state = activeRuns.get(runId)!;
  const startTime = Date.now();
  const maxCycles = input.max_cycles ?? 3;
  // Default to real LLM if GEMINI_API_KEY is set, otherwise mock
  const hasApiKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const mockLLM = input.mock_llm ?? !hasApiKey;

  let stepsTaken = 0;
  let failureCount = 0;
  let experiencesUsed = 0;
  let experiencesAdded = 0;
  let modelsCreated = 0;
  let modelsUpdated = 0;
  let observationsCreated = 0;

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

    // Snapshot initial state
    const initialModels = await getMentalModelRepository().list();
    const initialExperiences = await getExperienceRepository().list();

    // Build the task string from human intent
    const taskString = buildTaskString(input);

    // ─── STEP 1: Seed initial observations ───────────────────────────
    state.current_phase = "sensing";
    narration.emit("narration", "I'm preparing to interact with the target.", runId);

    const sensorHub = createSensorHub({ cogneeEnabled: false });
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
    narration.emit("narration", "I'm forming initial beliefs about the task.", runId);

    const modelUpdateEngine = createModelUpdateEngine({
      mockLLM,
      salienceThreshold: 0.1,
      cogneeEnabled: false,
    });
    modelUpdateEngine.start();
    // Give time for observations to process
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

    // ─── STEP 3: Decision-Action loop ────────────────────────────────
    state.current_phase = "decision";
    narration.emit("narration", `I'll now execute up to ${maxCycles} action cycles.`, runId);

    const decisionEngine = createDecisionEngine({
      mockLLM,
      browser: {
        headless: !input.visible_browser,
        screenshotDir: "./data/screenshots",
      },
    });

    for (let cycle = 0; cycle < maxCycles; cycle++) {
      narration.emit("narration", `Starting action cycle ${cycle + 1} of ${maxCycles}.`, runId);

      try {
        const result = await decisionEngine.decideAndAct(taskString, runId);
        stepsTaken++;

        // Narrate action
        narration.emit("action_started", narrateActionStarted(result.action), runId, {
          action_type: result.action.type,
          action_id: result.action.action_id,
        });

        narration.emit("action_completed", narrateActionCompleted(result.action, result.outcome), runId, {
          action_id: result.action.action_id,
          status: result.outcome.status,
          duration_ms: result.outcome.duration_ms,
          screenshots: result.outcome.artifacts.screenshots,
        });

        if (result.outcome.status === "failure") {
          failureCount++;
        }

        // Narrate evidence
        if (result.outcome.artifacts.screenshots.length > 0) {
          narration.emit("evidence_captured", `Captured ${result.outcome.artifacts.screenshots.length} screenshot(s).`, runId, {
            screenshots: result.outcome.artifacts.screenshots,
          });
        }

        observationsCreated += result.generatedObservationIds.length;

        // Run belief update for this cycle's observations
        const cycleUpdateEngine = createModelUpdateEngine({
          mockLLM,
          salienceThreshold: 0.1,
          cogneeEnabled: false,
        });
        cycleUpdateEngine.start();
        await sleep(300);
        cycleUpdateEngine.stop();

        // Check if new beliefs formed
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

      } catch (error) {
        failureCount++;
        narration.emit("error", `Action cycle ${cycle + 1} failed: ${(error as Error).message}`, runId);
      }
    }

    // Close browser
    await decisionEngine.close(runId);

    // ─── STEP 4: Experience Optimization (optional) ──────────────────
    if (input.enable_optimization !== false) {
      state.current_phase = "experience";
      narration.emit("narration", "I'm now comparing different approaches to find what works better.", runId);

      try {
        const optimizer = createExperienceOptimizer({
          rolloutCount: 2,
          mockLLM,
        });
        const optResult = await optimizer.optimize(taskString);

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
        narration.emit("error", `Experience optimization failed: ${(error as Error).message}`, runId);
      }

      // Close any remaining sessions
      await closeAllSessions();
    }

    // ─── STEP 5: Reflection & Report ─────────────────────────────────
    state.current_phase = "reflection";
    narration.emit("narration", "I'm reflecting on what I observed and learned.", runId);

    // Record metrics
    const durationMs = Date.now() - startTime;
    const metrics: RunMetrics = {
      run_id: runId,
      task_type: classifyTask(input.goal),
      task_summary: input.goal.substring(0, 100),
      steps_taken: stepsTaken,
      tool_calls: stepsTaken, // In this context, tool_calls ≈ steps
      rollouts_used: input.enable_optimization !== false ? 2 : 0,
      success: failureCount < stepsTaken,
      experiences_used: experiencesUsed,
      experiences_added: experiencesAdded,
      models_created: modelsCreated,
      models_updated: modelsUpdated,
      observations_created: observationsCreated,
      failure_count: failureCount,
      timestamp: new Date().toISOString(),
      duration_ms: durationMs,
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

    // Generate report
    const updatedIdentity = await refreshIdentity();
    const report = generateQAReport(
      runId,
      input.goal,
      timeline,
      reflection,
      improvement,
      formatIdentityStatement(updatedIdentity)
    );

    narration.emit("narration", `Reflection complete. ${reflection.what_learned.length > 0 ? reflection.what_learned[0] : "Run completed."}`, runId);

    // Store report reference
    state.finished_at = new Date().toISOString();
    state.status = "completed";

    narration.emit("run_completed", narrateRunCompleted(input.goal, stepsTaken, failureCount < stepsTaken), runId, {
      result: report.result,
      duration_ms: durationMs,
      actions_taken: stepsTaken,
      observations_created: observationsCreated,
      models_created: modelsCreated,
      experiences_learned: experiencesAdded,
      report,
    });

  } catch (error) {
    state.status = "failed";
    state.error = (error as Error).message;
    state.finished_at = new Date().toISOString();
    narration.emit("error", `Run failed: ${(error as Error).message}`, runId);
    await closeAllSessions();
    throw error;
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
