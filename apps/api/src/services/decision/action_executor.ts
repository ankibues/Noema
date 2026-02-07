/**
 * Action Executor
 * 
 * Orchestrates action execution and outcome recording.
 * Captures all artifacts (screenshots, logs, errors).
 * 
 * This component does NOT:
 * - Make decisions
 * - Update beliefs
 * - Retry on failure
 */

import type {
  BrowserAction,
  BrowserActionOutcome,
  ActionArtifacts,
} from "./action_types.js";
import { getOrCreateSession, type BrowserSessionConfig } from "./browser_session.js";
import { runAction } from "./playwright_runner.js";
import { getActionOutcomeRepository } from "../../storage/index.js";

export interface ActionExecutorConfig {
  browser?: BrowserSessionConfig;
}

export class ActionExecutor {
  private readonly config: ActionExecutorConfig;
  private consoleLogs: string[] = [];
  private networkErrors: string[] = [];

  constructor(config: ActionExecutorConfig = {}) {
    this.config = config;
  }

  /**
   * Execute an action and record the outcome
   */
  async execute(
    action: BrowserAction,
    runId: string
  ): Promise<BrowserActionOutcome> {
    const startTime = Date.now();
    
    console.log(`[ActionExecutor] Executing action: ${action.type}`);
    console.log(`[ActionExecutor] Rationale: ${action.rationale}`);

    // Reset log collectors
    this.consoleLogs = [];
    this.networkErrors = [];

    // Get or create browser session
    const session = await getOrCreateSession(runId, this.config.browser);

    // Execute the action
    const result = await runAction(session, action.type, action.inputs);

    // Capture artifacts
    const artifacts = await this.captureArtifacts(session, action, result);

    // Build outcome
    const outcome: BrowserActionOutcome = {
      action_id: action.action_id,
      status: result.success ? "success" : "failure",
      error_message: result.error,
      artifacts,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    // Persist outcome
    await this.persistOutcome(outcome);

    console.log(
      `[ActionExecutor] Action ${outcome.status}: ${action.type} ` +
      `(${outcome.duration_ms}ms)`
    );

    return outcome;
  }

  /**
   * Capture artifacts after action execution
   */
  private async captureArtifacts(
    session: ReturnType<typeof getOrCreateSession> extends Promise<infer T> ? T : never,
    action: BrowserAction,
    result: { success: boolean; error?: string; data?: Record<string, unknown> }
  ): Promise<ActionArtifacts> {
    const artifacts: ActionArtifacts = {
      screenshots: [],
      logs: [...this.consoleLogs],
      network_errors: [...this.networkErrors],
    };

    // Always capture a screenshot after action (except no_op)
    if (action.type !== "no_op") {
      try {
        const screenshotPath = await session.takeScreenshot({ fullPage: false });
        artifacts.screenshots.push(screenshotPath);
      } catch (error) {
        console.warn("[ActionExecutor] Failed to capture screenshot:", error);
      }
    }

    // If action was capture_screenshot, the screenshot is already in result.data
    if (action.type === "capture_screenshot" && result.data?.filepath) {
      // Already captured in the action itself
      if (!artifacts.screenshots.includes(result.data.filepath as string)) {
        artifacts.screenshots.push(result.data.filepath as string);
      }
    }

    // Add error to logs if action failed
    if (!result.success && result.error) {
      artifacts.logs.push(`[ERROR] ${result.error}`);
    }

    // Add result data to logs
    if (result.data) {
      artifacts.logs.push(`[RESULT] ${JSON.stringify(result.data)}`);
    }

    return artifacts;
  }

  /**
   * Persist action outcome to storage
   */
  private async persistOutcome(outcome: BrowserActionOutcome): Promise<void> {
    const outcomeRepo = getActionOutcomeRepository();
    
    // Convert to storage schema
    await outcomeRepo.create({
      action_id: outcome.action_id,
      success: outcome.status === "success",
      summary: outcome.error_message || `Action completed with status: ${outcome.status}`,
      artifacts: [
        ...outcome.artifacts.screenshots,
        ...outcome.artifacts.logs.map((log) => `log:${log}`),
        ...outcome.artifacts.network_errors.map((err) => `network_error:${err}`),
      ],
    });
  }

  /**
   * Add a console log (called by session event handlers)
   */
  addConsoleLog(log: string): void {
    this.consoleLogs.push(log);
  }

  /**
   * Add a network error (called by session event handlers)
   */
  addNetworkError(error: string): void {
    this.networkErrors.push(error);
  }
}

// =============================================================================
// Singleton
// =============================================================================

let instance: ActionExecutor | null = null;

export function getActionExecutor(config?: ActionExecutorConfig): ActionExecutor {
  if (!instance) {
    instance = new ActionExecutor(config);
  }
  return instance;
}

export function createActionExecutor(config?: ActionExecutorConfig): ActionExecutor {
  return new ActionExecutor(config);
}
