/**
 * Rollout Manager
 * 
 * Manages multiple rollouts for the same belief context.
 * Each rollout varies action parameters slightly.
 * Rollouts are SEQUENTIAL, not parallel.
 * 
 * This component does NOT:
 * - Update beliefs
 * - Extract experiences
 * - Evaluate outcomes
 */

import { v4 as uuidv4 } from "uuid";
import { getMentalModelRepository } from "../../storage/index.js";
import { createDecisionEngine, type DecisionEngine } from "../decision/index.js";
import type {
  Rollout,
  RolloutSet,
  BeliefContext,
  RolloutManagerConfig,
} from "./types.js";

const DEFAULT_CONFIG: Required<RolloutManagerConfig> = {
  rolloutCount: 2,
  rolloutDelay: 1000,
  browser: {
    headless: true,
    slowMo: 0,
    screenshotDir: "./data/screenshots",
  },
};

export class RolloutManager {
  private readonly config: Required<RolloutManagerConfig>;
  private decisionEngine: DecisionEngine | null = null;

  constructor(config: Partial<RolloutManagerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      browser: { ...DEFAULT_CONFIG.browser, ...config.browser },
    };
  }

  /**
   * Perform K rollouts for a given task
   * 
   * Each rollout:
   * - Uses the same belief context
   * - Varies action parameters slightly
   * - Is executed sequentially
   */
  async performRollouts(
    task: string,
    runId: string,
    options?: {
      mockLLM?: boolean;
      variationSeed?: number;
    }
  ): Promise<RolloutSet> {
    console.log(`[RolloutManager] Starting ${this.config.rolloutCount} rollouts for task`);
    console.log(`[RolloutManager] Task: ${task.substring(0, 50)}...`);

    // Capture belief context
    const beliefContext = await this.captureBeliefContext(task);

    // Create decision engine for rollouts
    this.decisionEngine = createDecisionEngine({
      mockLLM: options?.mockLLM ?? false,
      browser: this.config.browser,
    });

    const rollouts: Rollout[] = [];
    const setId = uuidv4();

    for (let i = 0; i < this.config.rolloutCount; i++) {
      console.log(`[RolloutManager] Rollout ${i + 1}/${this.config.rolloutCount}`);

      // Add variation to the task for different rollouts
      const variedTask = this.varyTask(task, i, options?.variationSeed);

      try {
        // Execute rollout
        const result = await this.decisionEngine.decideAndAct(variedTask, `${runId}_rollout_${i}`);

        const rollout: Rollout = {
          rollout_id: uuidv4(),
          beliefContext,
          action: result.action,
          outcome: result.outcome,
          observationIds: result.generatedObservationIds,
          runId: `${runId}_rollout_${i}`,
          timestamp: new Date().toISOString(),
        };

        rollouts.push(rollout);

        console.log(
          `[RolloutManager] Rollout ${i + 1} complete: ${result.action.type} -> ${result.outcome.status}`
        );

        // Wait between rollouts
        if (i < this.config.rolloutCount - 1) {
          await this.sleep(this.config.rolloutDelay);
        }
      } catch (error) {
        console.error(`[RolloutManager] Rollout ${i + 1} failed:`, error);
        // Continue with remaining rollouts
      }
    }

    // Close all rollout browser sessions
    for (let i = 0; i < this.config.rolloutCount; i++) {
      try {
        await this.decisionEngine.close(`${runId}_rollout_${i}`);
      } catch {
        // Session may not exist if rollout failed
      }
    }

    const rolloutSet: RolloutSet = {
      set_id: setId,
      beliefContext,
      rollouts,
      created_at: new Date().toISOString(),
    };

    console.log(`[RolloutManager] Completed ${rollouts.length} rollouts`);

    return rolloutSet;
  }

  /**
   * Capture the current belief context
   */
  private async captureBeliefContext(task: string): Promise<BeliefContext> {
    const modelRepo = getMentalModelRepository();
    const models = await modelRepo.findActive();

    return {
      models: models.map((m) => ({
        model_id: m.model_id,
        title: m.title,
        confidence: m.confidence,
        tags: m.tags,
      })),
      task,
      stateSummary: `${models.length} active models, task: ${task.substring(0, 50)}`,
    };
  }

  /**
   * Add variation to task for different rollouts
   * 
   * This creates slight variations in how the task is approached
   * without changing the fundamental goal.
   */
  private varyTask(task: string, rolloutIndex: number, seed?: number): string {
    // For rollout 0, use the original task
    if (rolloutIndex === 0) {
      return task;
    }

    // For subsequent rollouts, add variation hints
    const variations = [
      "Try a different approach: ",
      "Alternative strategy: ",
      "Consider this variation: ",
      "Explore another path: ",
    ];

    const variationIndex = (rolloutIndex - 1 + (seed || 0)) % variations.length;
    const variation = variations[variationIndex];

    // Add variation hints based on rollout index
    const hints = [
      "Focus on capturing more detailed evidence.",
      "Prioritize checking element visibility before acting.",
      "Wait for page stability before proceeding.",
      "Take a screenshot first to understand the state.",
    ];

    const hintIndex = (rolloutIndex - 1 + (seed || 0)) % hints.length;
    const hint = hints[hintIndex];

    return `${variation}${hint}\n\nOriginal task: ${task}`;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createRolloutManager(
  config?: Partial<RolloutManagerConfig>
): RolloutManager {
  return new RolloutManager(config);
}
