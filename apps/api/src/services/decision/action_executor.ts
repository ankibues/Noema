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
import {
  getOrCreateSession,
  type BrowserSessionConfig,
  type PageDOMSnapshot,
} from "./browser_session.js";
import { runAction } from "./playwright_runner.js";
import { getActionOutcomeRepository } from "../../storage/index.js";

export interface ActionExecutorConfig {
  browser?: BrowserSessionConfig;
}

export class ActionExecutor {
  private readonly config: ActionExecutorConfig;
  /** Latest DOM snapshot after the most recent action */
  private latestDOMSnapshot: PageDOMSnapshot | null = null;

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

    // Get or create browser session
    const session = await getOrCreateSession(runId, this.config.browser);

    // Execute the action
    const result = await runAction(session, action.type, action.inputs);

    // Capture artifacts — pull real logs/errors from the browser session
    const artifacts = await this.captureArtifacts(session, action, result);

    // Extract DOM snapshot after action for NOEMA's understanding
    if (action.type !== "no_op") {
      try {
        this.latestDOMSnapshot = await session.extractPageDOM();
        console.log(
          `[ActionExecutor] DOM snapshot: ${this.latestDOMSnapshot.title} ` +
          `(${this.latestDOMSnapshot.interactiveElements.length} interactive, ` +
          `${this.latestDOMSnapshot.forms.length} forms, ` +
          `${this.latestDOMSnapshot.errorMessages.length} errors)`
        );
      } catch (error) {
        console.warn("[ActionExecutor] Failed to extract DOM:", error);
      }
    }

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
      `(${outcome.duration_ms}ms, ${artifacts.logs.length} logs, ${artifacts.network_errors.length} network errors)`
    );

    return outcome;
  }

  /**
   * Get the latest DOM snapshot (extracted after the last action)
   */
  getLatestDOMSnapshot(): PageDOMSnapshot | null {
    return this.latestDOMSnapshot;
  }

  /**
   * Capture artifacts after action execution.
   * Pulls real console logs and network errors from the browser session.
   */
  private async captureArtifacts(
    session: ReturnType<typeof getOrCreateSession> extends Promise<infer T> ? T : never,
    action: BrowserAction,
    result: { success: boolean; error?: string; data?: Record<string, unknown> }
  ): Promise<ActionArtifacts> {
    // Get real console logs and network errors from the browser session (and clear them)
    const browserLogs = session.getConsoleLogs(true);
    const browserNetErrors = session.getNetworkErrors(true);

    const artifacts: ActionArtifacts = {
      screenshots: [],
      logs: [...browserLogs],
      network_errors: [...browserNetErrors],
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
      if (!artifacts.screenshots.includes(result.data.filepath as string)) {
        artifacts.screenshots.push(result.data.filepath as string);
      }
    }

    // Add error to logs if action failed
    if (!result.success && result.error) {
      artifacts.logs.push(`[ACTION_ERROR] ${result.error}`);
    }

    // Add result data to logs
    if (result.data) {
      artifacts.logs.push(`[ACTION_RESULT] ${JSON.stringify(result.data)}`);
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
