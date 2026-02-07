/**
 * Decision Engine
 * 
 * The core decision-making component of NOEMA.
 * Selects actions based on beliefs, executes them, and records outcomes.
 * 
 * Core Principle:
 * - Beliefs drive actions
 * - Actions produce evidence
 * - Evidence flows back through perception
 * 
 * This engine does NOT:
 * - Update beliefs directly
 * - Plan multiple steps ahead
 * - Retry failed actions
 * - Extract experiences
 */

import { v4 as uuidv4 } from "uuid";
import {
  getMentalModelRepository,
  getObservationRepository,
  getActionRepository,
} from "../../storage/index.js";
import { createSensorHub } from "../sensing/index.js";
import { getExperienceInjector } from "../experience/index.js";
import { createActionExecutor, type ActionExecutor } from "./action_executor.js";
import { callDecisionLLM, callMockDecisionLLM } from "./decision_llm.js";
import { closeSession } from "./browser_session.js";
import type {
  DecisionEngineConfig,
  DecisionContext,
  DecisionResult,
  ExecutionResult,
  DecisionPromptInput,
} from "./types.js";
import type {
  BrowserAction,
  BrowserActionOutcome,
  BrowserActionType,
} from "./action_types.js";

const DEFAULT_CONFIG: Required<DecisionEngineConfig> = {
  modelConfidenceThreshold: 0.4,
  maxModelsInContext: 5,
  maxRecentOutcomes: 5,
  mockLLM: false,
  llm: {
    provider: "gemini",
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  },
  browser: {
    headless: true,
    slowMo: 0,
    screenshotDir: "./data/screenshots",
  },
};

export class DecisionEngine {
  private readonly config: Required<DecisionEngineConfig>;
  private executor: ActionExecutor;
  private recentOutcomes: BrowserActionOutcome[] = [];

  constructor(config: DecisionEngineConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      llm: { ...DEFAULT_CONFIG.llm, ...config.llm },
      browser: { ...DEFAULT_CONFIG.browser, ...config.browser },
    };
    this.executor = createActionExecutor({ browser: this.config.browser });
  }

  /**
   * Make a decision and execute one action
   * 
   * This is the main entry point for the decision loop.
   * One call = one decision = one action = one outcome
   */
  async decideAndAct(task: string, runId: string): Promise<ExecutionResult> {
    console.log(`[DecisionEngine] Starting decision cycle for task: ${task}`);
    console.log(`[DecisionEngine] Run ID: ${runId}`);

    // 1. Build decision context
    const context = await this.buildContext(task, runId);

    // 2. Select action via LLM
    const decision = await this.selectAction(context);

    // 3. Execute the action
    const outcome = await this.executeAction(decision.action, runId);

    // 4. Record outcome for future decisions
    this.recentOutcomes.push(outcome);
    if (this.recentOutcomes.length > this.config.maxRecentOutcomes) {
      this.recentOutcomes.shift();
    }

    // 5. Feed outcome back through sensing layer
    const observationIds = await this.feedbackToSensing(outcome, runId);

    console.log(
      `[DecisionEngine] Cycle complete: ${decision.action.type} -> ${outcome.status}`
    );

    return {
      action: decision.action,
      outcome,
      generatedObservationIds: observationIds,
    };
  }

  /**
   * Build the context for decision making
   */
  private async buildContext(task: string, runId: string): Promise<DecisionContext> {
    const modelRepo = getMentalModelRepository();
    const obsRepo = getObservationRepository();

    // Get active mental models above confidence threshold
    const allModels = await modelRepo.findActive();
    const relevantModels = allModels
      .filter((m) => m.confidence >= this.config.modelConfidenceThreshold)
      .slice(0, this.config.maxModelsInContext);

    // Get relevant experiences (injected from Phase 6)
    const injector = getExperienceInjector();
    const experiences = await injector.getRelevantExperiences(task);

    // Get recent observations
    const observations = await obsRepo.list();
    const recentObservations = observations.slice(-10);

    console.log(
      `[DecisionEngine] Context: ${relevantModels.length} models, ` +
      `${experiences.length} experiences, ${this.recentOutcomes.length} recent outcomes`
    );

    return {
      task,
      mentalModels: relevantModels,
      experiences,
      recentOutcomes: this.recentOutcomes,
      recentObservations,
      runId,
    };
  }

  /**
   * Select the next action using LLM
   */
  private async selectAction(context: DecisionContext): Promise<DecisionResult> {
    // Build prompt input
    const promptInput: DecisionPromptInput = {
      task: context.task,
      mental_models: context.mentalModels.map((m) => ({
        model_id: m.model_id,
        title: m.title,
        summary: m.summary,
        confidence: m.confidence,
        procedures: m.procedures,
        failure_modes: m.failure_modes,
      })),
      experiences: context.experiences.map((e) => ({
        experience_id: e.experience_id,
        statement: e.statement,
        confidence: e.confidence,
      })),
      recent_outcomes: context.recentOutcomes.map((o) => ({
        action_id: o.action_id,
        action_type: this.inferActionType(o),
        status: o.status,
        error_message: o.error_message,
      })),
      available_actions: [
        "navigate_to_url",
        "click_element",
        "fill_input",
        "submit_form",
        "check_element_visible",
        "capture_screenshot",
        "wait_for_network_idle",
        "no_op",
      ],
    };

    // Call LLM
    let rawOutput;
    try {
      if (this.config.mockLLM) {
        rawOutput = await callMockDecisionLLM(promptInput);
      } else {
        rawOutput = await callDecisionLLM(promptInput, this.config.llm);
      }
    } catch (error) {
      console.error("[DecisionEngine] LLM call failed:", error);
      // Fallback to no-op
      rawOutput = {
        action_type: "no_op" as BrowserActionType,
        rationale: `LLM call failed: ${error}`,
        inputs: { reason: "LLM unavailable" },
        expected_outcome: "No action taken",
      };
    }

    // Build action
    const action: BrowserAction = {
      action_id: uuidv4(),
      type: rawOutput.action_type,
      rationale: rawOutput.rationale,
      inputs: rawOutput.inputs as any,
      expected_outcome: rawOutput.expected_outcome,
      created_at: new Date().toISOString(),
    };

    // Persist action
    await this.persistAction(action);

    console.log(`[DecisionEngine] Selected action: ${action.type}`);
    console.log(`[DecisionEngine] Rationale: ${action.rationale}`);

    return {
      action,
      rawOutput,
      contextUsed: {
        modelIds: context.mentalModels.map((m) => m.model_id),
        experienceIds: context.experiences.map((e) => e.experience_id),
        outcomeIds: context.recentOutcomes.map((o) => o.action_id),
      },
    };
  }

  /**
   * Execute the selected action
   */
  private async executeAction(
    action: BrowserAction,
    runId: string
  ): Promise<BrowserActionOutcome> {
    return this.executor.execute(action, runId);
  }

  /**
   * Feed action outcome back through sensing layer
   * This creates new observations that will later update beliefs
   */
  private async feedbackToSensing(
    outcome: BrowserActionOutcome,
    runId: string
  ): Promise<string[]> {
    const sensorHub = createSensorHub({ cogneeEnabled: false });
    const observationIds: string[] = [];

    // Convert screenshots to observations
    for (const screenshotPath of outcome.artifacts.screenshots) {
      try {
        // For now, we'll create a text observation describing the screenshot
        // In a real implementation, we'd use OCR or vision model
        const result = await sensorHub.ingest({
          type: "text",
          content: `Screenshot captured: ${screenshotPath}\nAction: ${outcome.action_id}\nStatus: ${outcome.status}`,
          sessionId: runId,
          source: {
            origin: "action_outcome",
            action_id: outcome.action_id,
          },
        });
        observationIds.push(...result.observationIds);
      } catch (error) {
        console.warn(`[DecisionEngine] Failed to ingest screenshot: ${error}`);
      }
    }

    // Convert logs to observations
    if (outcome.artifacts.logs.length > 0) {
      try {
        const logContent = outcome.artifacts.logs.join("\n");
        const result = await sensorHub.ingest({
          type: "log",
          content: logContent,
          sessionId: runId,
          source: {
            origin: "action_outcome",
            action_id: outcome.action_id,
          },
        });
        observationIds.push(...result.observationIds);
      } catch (error) {
        console.warn(`[DecisionEngine] Failed to ingest logs: ${error}`);
      }
    }

    // Convert network errors to observations
    if (outcome.artifacts.network_errors.length > 0) {
      try {
        const errorContent = outcome.artifacts.network_errors.join("\n");
        const result = await sensorHub.ingest({
          type: "log",
          content: `[NETWORK ERRORS]\n${errorContent}`,
          sessionId: runId,
          source: {
            origin: "action_outcome",
            action_id: outcome.action_id,
          },
        });
        observationIds.push(...result.observationIds);
      } catch (error) {
        console.warn(`[DecisionEngine] Failed to ingest network errors: ${error}`);
      }
    }

    console.log(
      `[DecisionEngine] Generated ${observationIds.length} observations from outcome`
    );

    return observationIds;
  }

  /**
   * Persist action to storage
   */
  private async persistAction(action: BrowserAction): Promise<void> {
    const actionRepo = getActionRepository();
    
    // Map to storage schema
    await actionRepo.create({
      type: this.mapToStorageActionType(action.type),
      rationale: action.rationale,
      inputs: action.inputs as Record<string, unknown>,
      expected_outcome: action.expected_outcome,
    });
  }

  /**
   * Map browser action type to storage action type
   */
  private mapToStorageActionType(
    browserType: BrowserActionType
  ): "run_test" | "inspect_logs" | "capture_screenshot" | "ask_human" | "patch_code" | "no_op" {
    switch (browserType) {
      case "capture_screenshot":
        return "capture_screenshot";
      case "no_op":
        return "no_op";
      default:
        return "run_test"; // Map browser actions to run_test
    }
  }

  /**
   * Infer action type from outcome (for context building)
   */
  private inferActionType(outcome: BrowserActionOutcome): BrowserActionType {
    // Try to infer from artifacts
    if (outcome.artifacts.screenshots.length > 0) {
      return "capture_screenshot";
    }
    return "no_op";
  }

  /**
   * Close the browser session
   */
  async close(runId: string): Promise<void> {
    await closeSession(runId);
    console.log("[DecisionEngine] Session closed");
  }

  /**
   * Clear recent outcomes (for testing)
   */
  clearRecentOutcomes(): void {
    this.recentOutcomes = [];
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createDecisionEngine(
  config?: DecisionEngineConfig
): DecisionEngine {
  return new DecisionEngine(config);
}

let instance: DecisionEngine | null = null;

export function getDecisionEngine(
  config?: DecisionEngineConfig
): DecisionEngine {
  if (!instance) {
    instance = new DecisionEngine(config);
  }
  return instance;
}
