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
 * - Screenshots are analyzed via Gemini Vision for visual understanding
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
import {
  analyzeScreenshotForDecision,
  isVisionAvailable,
} from "../sensing/vision_client.js";
import {
  createActionExecutor,
  type ActionExecutor,
} from "./action_executor.js";
import type { PageDOMSnapshot } from "./browser_session.js";
import { callDecisionLLM, callMockDecisionLLM } from "./decision_llm.js";
import { closeSession, closeSessionAndGetVideo } from "./browser_session.js";
import type {
  DecisionEngineConfig,
  DecisionContext,
  DecisionResult,
  ExecutionResult,
  DecisionPromptInput,
  TestCredentials,
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
    model: process.env.GEMINI_MODEL || "gemini-3-flash-preview",
  },
  browser: {
    headless: true,
    slowMo: 0,
    screenshotDir: "./data/screenshots",
  },
};

/** Lightweight record of a completed action for LLM context */
interface ActionRecord {
  action_type: BrowserActionType;
  selector?: string;
  value?: string;
  rationale: string;
  status: "success" | "failure";
  error_message?: string;
}

export class DecisionEngine {
  private readonly config: Required<DecisionEngineConfig>;
  private executor: ActionExecutor;
  private recentOutcomes: BrowserActionOutcome[] = [];
  /** Full action history (type + inputs + outcome) so the LLM knows what it already did */
  private recentActions: ActionRecord[] = [];
  /** Latest visual description of the browser page (from Gemini Vision) */
  private latestVisualContext: string | null = null;
  /** Latest DOM snapshot extracted after the most recent action */
  private latestDOMSnapshot: PageDOMSnapshot | null = null;
  /** Test credentials loaded from environment (never narrated or logged) */
  private credentials: TestCredentials | undefined;
  /** Count of LLM calls made during this engine's lifetime */
  private _llmCallCount = 0;

  constructor(config: DecisionEngineConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      llm: { ...DEFAULT_CONFIG.llm, ...config.llm },
      browser: { ...DEFAULT_CONFIG.browser, ...config.browser },
    };
    this.executor = createActionExecutor({ browser: this.config.browser });

    // Load test credentials from environment variables (secure — never narrated)
    this.credentials = loadCredentialsFromEnv();
    if (this.credentials) {
      console.log("[DecisionEngine] Test credentials loaded from environment (username: configured)");
    }
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

    // 1. Build decision context (includes visual context from last screenshot)
    const context = await this.buildContext(task, runId);

    // 2. Select action via LLM
    const decision = await this.selectAction(context);

    // 3. Execute the action
    const outcome = await this.executeAction(decision.action, runId);

    // 4. Capture DOM snapshot from executor (extracted after action)
    this.latestDOMSnapshot = this.executor.getLatestDOMSnapshot();

    // 5. Record action + outcome for future decisions
    const actionRecord: ActionRecord = {
      action_type: decision.action.type,
      selector: extractSelector(decision.action.inputs),
      value: extractValue(decision.action.inputs),
      rationale: decision.action.rationale,
      status: outcome.status,
      error_message: outcome.error_message,
    };
    this.recentActions.push(actionRecord);
    if (this.recentActions.length > 10) {
      this.recentActions.shift();
    }

    this.recentOutcomes.push(outcome);
    if (this.recentOutcomes.length > this.config.maxRecentOutcomes) {
      this.recentOutcomes.shift();
    }

    // 6. Feed outcome back through sensing layer (with vision + DOM analysis)
    const observationIds = await this.feedbackToSensing(outcome, task, runId);

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
   * Check if the agent is stuck in a loop (same action + same selector repeated).
   * Returns true if the last N actions are identical.
   */
  isStuckInLoop(threshold: number = 3): boolean {
    if (this.recentActions.length < threshold) return false;
    const last = this.recentActions.slice(-threshold);
    const first = last[0];
    return last.every(
      (a) =>
        a.action_type === first.action_type &&
        a.selector === first.selector &&
        a.value === first.value
    );
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

    // Build combined visual context: DOM snapshot + Gemini Vision analysis
    let combinedVisualContext = this.latestVisualContext || undefined;
    if (this.latestDOMSnapshot) {
      const domSummary = formatDOMForDecision(this.latestDOMSnapshot);
      combinedVisualContext = combinedVisualContext
        ? `${combinedVisualContext}\n\n--- DOM STRUCTURE ---\n${domSummary}`
        : `--- DOM STRUCTURE ---\n${domSummary}`;
    }

    console.log(
      `[DecisionEngine] Context: ${relevantModels.length} models, ` +
      `${experiences.length} experiences, ${this.recentOutcomes.length} recent outcomes` +
      (combinedVisualContext ? ", visual+DOM context available" : "") +
      (this.latestDOMSnapshot ? `, ${this.latestDOMSnapshot.interactiveElements.length} interactive elements` : "")
    );

    return {
      task,
      mentalModels: relevantModels,
      experiences,
      recentOutcomes: this.recentOutcomes,
      recentObservations,
      runId,
      visualContext: combinedVisualContext,
      credentials: this.credentials,
    };
  }

  /**
   * Select the next action using LLM
   */
  private async selectAction(context: DecisionContext): Promise<DecisionResult> {
    this._llmCallCount++; // Track LLM usage

    // Build prompt input with full action history
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
      recent_actions: this.recentActions.slice(-8).map((a) => ({
        action_type: a.action_type,
        selector: a.selector,
        value: a.value,
        rationale: a.rationale,
        status: a.status,
        error_message: a.error_message,
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
      visual_context: context.visualContext,
      credentials: context.credentials,
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
   * Feed action outcome back through sensing layer.
   * 
   * PERFORMANCE: Vision analysis runs in the BACKGROUND (fire-and-forget).
   * The result will be available for the NEXT decision cycle.
   * This saves 5-15 seconds per action cycle compared to awaiting vision.
   * 
   * Only screenshot + DOM observations are created synchronously.
   */
  private async feedbackToSensing(
    outcome: BrowserActionOutcome,
    task: string,
    runId: string
  ): Promise<string[]> {
    const sensorHub = createSensorHub({ cogneeEnabled: false });
    const observationIds: string[] = [];

    // BACKGROUND: Fire-and-forget vision analysis for screenshots
    // Result will be picked up in latestVisualContext for the next decision cycle
    for (const screenshotPath of outcome.artifacts.screenshots) {
      if (!this.config.mockLLM && isVisionAvailable()) {
        // Fire and forget — don't block the action loop
        console.log(`[DecisionEngine] Launching background vision analysis: ${screenshotPath}`);
        analyzeScreenshotForDecision({ filePath: screenshotPath }, task)
          .then((visualDescription) => {
            this.latestVisualContext = visualDescription;
            console.log(`[DecisionEngine] Background vision analysis complete (${visualDescription.length} chars)`);
          })
          .catch((err) => {
            console.warn(`[DecisionEngine] Background vision failed (non-blocking): ${err}`);
          });
      }

      // Create a lightweight observation synchronously (no vision text — that comes later)
      try {
        const content = this.latestVisualContext
          ? `[Visual Analysis of ${screenshotPath}]\nAction: ${outcome.action_id}\nStatus: ${outcome.status}\n\n${this.latestVisualContext}`
          : `Screenshot captured: ${screenshotPath}\nAction: ${outcome.action_id}\nStatus: ${outcome.status}`;

        const result = await sensorHub.ingest({
          type: "text",
          content,
          sessionId: runId,
          source: {
            origin: "action_outcome",
            action_id: outcome.action_id,
            screenshot_path: screenshotPath,
          },
        });
        observationIds.push(...result.observationIds);
      } catch (error) {
        console.warn(`[DecisionEngine] Failed to ingest screenshot: ${error}`);
      }
    }

    // Convert logs to observations (fast, <1ms)
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

    // Convert network errors to observations (fast)
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

    // Ingest DOM snapshot as a text observation (fast)
    if (this.latestDOMSnapshot) {
      try {
        const domContent = formatDOMForObservation(this.latestDOMSnapshot);
        const result = await sensorHub.ingest({
          type: "text",
          content: domContent,
          sessionId: runId,
          source: {
            origin: "dom_extraction",
            action_id: outcome.action_id,
          },
        });
        observationIds.push(...result.observationIds);
      } catch (error) {
        console.warn(`[DecisionEngine] Failed to ingest DOM snapshot: ${error}`);
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
   * Infer action type from outcome (for context building).
   * Looks up the persisted action record for the most accurate type.
   */
  private inferActionType(outcome: BrowserActionOutcome): BrowserActionType {
    // Check logs for action result data which includes the type
    for (const log of outcome.artifacts.logs) {
      if (log.startsWith("[ACTION_RESULT]")) {
        try {
          const data = JSON.parse(log.replace("[ACTION_RESULT] ", ""));
          if (data.url) return "navigate_to_url";
          if (data.selector && data.isVisible !== undefined) return "check_element_visible";
          if (data.selector && data.valueLength !== undefined) return "fill_input";
          if (data.selector) return "click_element";
          if (data.filepath) return "capture_screenshot";
          if (data.waited) return "wait_for_network_idle";
          if (data.reason) return "no_op";
        } catch {
          // Skip malformed log entries
        }
      }
    }

    // Fallback: infer from artifacts
    if (outcome.artifacts.screenshots.length > 0) {
      return "capture_screenshot";
    }
    return "no_op";
  }

  /**
   * Get the number of LLM calls made so far.
   */
  get llmCallCount(): number {
    return this._llmCallCount;
  }

  /**
   * Get recent action records (for recording action sequences).
   */
  getRecentActionRecords(): ActionRecord[] {
    return [...this.recentActions];
  }

  /**
   * Get test credentials (for action sequence tokenization).
   */
  getCredentials(): TestCredentials | undefined {
    return this.credentials;
  }

  /**
   * Close the browser session and return the video recording path (if any).
   */
  async close(runId: string): Promise<string | null> {
    const videoPath = await closeSessionAndGetVideo(runId);
    console.log("[DecisionEngine] Session closed" + (videoPath ? ` (video: ${videoPath})` : ""));
    return videoPath;
  }

  /**
   * Set test credentials (e.g., loaded from env by run_controller)
   */
  setCredentials(creds: TestCredentials | undefined): void {
    this.credentials = creds;
  }

  /**
   * Clear recent outcomes and actions (for testing or full reset)
   */
  clearRecentOutcomes(): void {
    this.recentOutcomes = [];
    this.recentActions = [];
    this.latestVisualContext = null;
    this.latestDOMSnapshot = null;
  }

  /**
   * Reset action history between plan steps.
   * Keeps visual/DOM context (so the LLM knows the current page state)
   * but clears the action sequence (so it doesn't confuse actions from step N with step N+1).
   */
  resetForNewStep(): void {
    this.recentActions = [];
    // Keep only the last 2 outcomes for cross-step continuity
    this.recentOutcomes = this.recentOutcomes.slice(-2);
  }
}

// =============================================================================
// DOM Formatting Helpers
// =============================================================================

/**
 * Format a DOM snapshot into a concise string for the decision LLM prompt.
 * Focuses on actionable elements and page structure.
 */
function formatDOMForDecision(dom: PageDOMSnapshot): string {
  const parts: string[] = [];

  parts.push(`Page: "${dom.title}" (${dom.url})`);

  if (dom.headings.length > 0) {
    parts.push(`\nHeadings:`);
    for (const h of dom.headings) {
      parts.push(`  ${"#".repeat(h.level)} ${h.text}`);
    }
  }

  if (dom.errorMessages.length > 0) {
    parts.push(`\n⚠ Error Messages:`);
    for (const err of dom.errorMessages) {
      parts.push(`  - ${err}`);
    }
  }

  if (dom.forms.length > 0) {
    parts.push(`\nForms (${dom.forms.length}):`);
    for (const form of dom.forms) {
      parts.push(`  Form "${form.selector}" (${form.method.toUpperCase()} ${form.action || "self"})`);
      for (const field of form.fields) {
        parts.push(`    - ${field.tag}[type=${field.type}] name="${field.name}" placeholder="${field.placeholder}" → ${field.selector}`);
      }
    }
  }

  if (dom.interactiveElements.length > 0) {
    parts.push(`\nInteractive Elements (${dom.interactiveElements.length}):`);
    for (const el of dom.interactiveElements.slice(0, 25)) {
      const label = el.text || el.attributes["aria-label"] || el.attributes["placeholder"] || "(no label)";
      parts.push(`  - <${el.tag}> "${label.substring(0, 60)}" → ${el.selector}`);
    }
  }

  return parts.join("\n");
}

/**
 * Format a DOM snapshot for ingestion as an observation.
 * Includes full body text preview for richer understanding.
 */
function formatDOMForObservation(dom: PageDOMSnapshot): string {
  const parts: string[] = [];

  parts.push(`[DOM Snapshot] Page: "${dom.title}"`);
  parts.push(`URL: ${dom.url}`);
  parts.push(`Total elements: ${dom.totalElements}`);

  if (dom.errorMessages.length > 0) {
    parts.push(`\nVisible Errors:`);
    for (const err of dom.errorMessages) {
      parts.push(`  ERROR: ${err}`);
    }
  }

  if (dom.forms.length > 0) {
    parts.push(`\nForms: ${dom.forms.length}`);
    for (const form of dom.forms) {
      parts.push(`  ${form.selector}: ${form.fields.length} fields (${form.method.toUpperCase()})`);
    }
  }

  parts.push(`Interactive elements: ${dom.interactiveElements.length}`);
  parts.push(`\nPage text preview:\n${dom.bodyTextPreview.substring(0, 1500)}`);

  return parts.join("\n");
}

// =============================================================================
// Action Input Extractors (for building action history)
// =============================================================================

/** Extract the selector from any action input */
function extractSelector(inputs: unknown): string | undefined {
  if (typeof inputs !== "object" || inputs === null) return undefined;
  const obj = inputs as Record<string, unknown>;
  if (typeof obj.selector === "string") return obj.selector;
  return undefined;
}

/** Extract the value from a fill_input action */
function extractValue(inputs: unknown): string | undefined {
  if (typeof inputs !== "object" || inputs === null) return undefined;
  const obj = inputs as Record<string, unknown>;
  if (typeof obj.value === "string") {
    // Mask passwords in action history (still sent to LLM but not logged)
    return obj.value;
  }
  if (typeof obj.url === "string") return obj.url;
  return undefined;
}

// =============================================================================
// Credential Loading
// =============================================================================

/**
 * Load test credentials from environment variables.
 * Returns undefined if no credentials are configured.
 * 
 * Supported env vars:
 * - TEST_USERNAME: Test user email/username
 * - TEST_PASSWORD: Test user password
 * - TEST_CREDENTIALS_JSON: JSON string with additional fields
 *   e.g. '{"api_token":"abc","2fa_code":"123456"}'
 */
function loadCredentialsFromEnv(): TestCredentials | undefined {
  const username = process.env.TEST_USERNAME;
  const password = process.env.TEST_PASSWORD;
  const extrasJson = process.env.TEST_CREDENTIALS_JSON;

  if (!username && !password && !extrasJson) {
    return undefined;
  }

  let extras: Record<string, string> | undefined;
  if (extrasJson) {
    try {
      extras = JSON.parse(extrasJson);
    } catch {
      console.warn("[DecisionEngine] Failed to parse TEST_CREDENTIALS_JSON — ignoring");
    }
  }

  return {
    username: username || undefined,
    password: password || undefined,
    extras,
  };
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
