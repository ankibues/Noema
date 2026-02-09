/**
 * Experience Optimizer
 * 
 * The main orchestrator for learning from action outcomes.
 * Implements Training-Free GRPO-style learning.
 * 
 * Workflow:
 * 1. Run K rollouts for the same belief context
 * 2. Evaluate outcomes using observable signals
 * 3. Extract experiences if there's a clear winner
 * 4. Persist experiences for future decision injection
 * 
 * Core principle: Learn what WORKS, not what is TRUE.
 * 
 * This component does NOT:
 * - Update beliefs (that's Phase 4)
 * - Make decisions (that's Phase 5)
 * - Retrain models
 */

import { v4 as uuidv4 } from "uuid";
import type { Experience } from "../../schemas/index.js";
import { createRolloutManager, type RolloutManager } from "./rollout_manager.js";
import { createOutcomeEvaluator, type OutcomeEvaluator } from "./outcome_evaluator.js";
import { createExperienceExtractor, type ExperienceExtractor } from "./experience_extractor.js";
import { createExperienceInjector, type ExperienceInjector } from "./experience_injector.js";
import type {
  ExperienceOptimizerConfig,
  RolloutSet,
  RolloutComparison,
  ExtractionResult,
} from "./types.js";

const DEFAULT_CONFIG: Required<ExperienceOptimizerConfig> = {
  rolloutCount: 2,
  minWinMargin: 0.15,
  maxExperiencesInContext: 5,
  mockLLM: false,
  llm: {
    provider: "gemini",
    model: process.env.GEMINI_MODEL || "gemini-3-flash-preview",
  },
};

export interface OptimizationResult {
  /** The rollout set that was created */
  rolloutSet: RolloutSet;
  /** The comparison result */
  comparison: RolloutComparison;
  /** The extraction result */
  extraction: ExtractionResult;
  /** Summary of what was learned */
  summary: string;
}

export class ExperienceOptimizer {
  private readonly config: Required<ExperienceOptimizerConfig>;
  private readonly rolloutManager: RolloutManager;
  private readonly outcomeEvaluator: OutcomeEvaluator;
  private readonly experienceExtractor: ExperienceExtractor;
  private readonly experienceInjector: ExperienceInjector;

  constructor(config: Partial<ExperienceOptimizerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      llm: { ...DEFAULT_CONFIG.llm, ...config.llm },
    };

    this.rolloutManager = createRolloutManager({
      rolloutCount: this.config.rolloutCount,
    });

    this.outcomeEvaluator = createOutcomeEvaluator({
      minWinMargin: this.config.minWinMargin,
    });

    this.experienceExtractor = createExperienceExtractor({
      mockLLM: this.config.mockLLM,
      llm: this.config.llm,
    });

    this.experienceInjector = createExperienceInjector({
      maxExperiences: this.config.maxExperiencesInContext,
    });
  }

  /**
   * Run the full optimization cycle
   * 
   * 1. Perform K rollouts
   * 2. Evaluate and compare outcomes
   * 3. Extract experiences if clear winner
   */
  async optimize(task: string): Promise<OptimizationResult> {
    const runId = uuidv4();

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  Experience Optimizer - Learning Cycle");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`Run ID: ${runId}`);
    console.log(`Task: ${task.substring(0, 60)}...`);
    console.log(`Rollout count: ${this.config.rolloutCount}`);
    console.log();

    // Step 1: Perform rollouts
    console.log("Step 1: Performing rollouts...");
    const rolloutSet = await this.rolloutManager.performRollouts(task, runId, {
      mockLLM: this.config.mockLLM,
    });
    console.log(`Completed ${rolloutSet.rollouts.length} rollouts\n`);

    // Step 2: Evaluate and compare
    console.log("Step 2: Evaluating outcomes...");
    const comparison = this.outcomeEvaluator.compare(rolloutSet);
    console.log();

    // Step 3: Extract experiences
    console.log("Step 3: Extracting experiences...");
    const extraction = await this.experienceExtractor.extract(comparison, runId);
    console.log();

    // Build summary
    const summary = this.buildSummary(comparison, extraction);
    console.log("Summary:", summary);
    console.log();

    return {
      rolloutSet,
      comparison,
      extraction,
      summary,
    };
  }

  /**
   * Get experiences relevant to a task (for injection into decisions)
   */
  async getExperiencesForTask(task: string): Promise<Experience[]> {
    return this.experienceInjector.getRelevantExperiences(task);
  }

  /**
   * Format experiences for injection into a decision prompt
   */
  formatExperiencesForPrompt(experiences: Experience[]): string {
    return this.experienceInjector.formatForPrompt(experiences);
  }

  /**
   * Build a summary of the optimization result
   */
  private buildSummary(
    comparison: RolloutComparison,
    extraction: ExtractionResult
  ): string {
    const parts: string[] = [];

    if (comparison.hasClearWinner && comparison.winner) {
      parts.push(
        `Clear winner: ${comparison.winner.action.type} ` +
        `(margin: ${comparison.winMargin.toFixed(3)})`
      );
    } else {
      parts.push(`No clear winner (margin: ${comparison.winMargin.toFixed(3)})`);
    }

    if (extraction.hasChanges) {
      if (extraction.added.length > 0) {
        parts.push(`Learned ${extraction.added.length} new experience(s)`);
      }
      if (extraction.modified.length > 0) {
        parts.push(`Updated ${extraction.modified.length} experience(s)`);
      }
    } else {
      parts.push(extraction.noExtractionReason || "No learning occurred");
    }

    return parts.join(". ");
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createExperienceOptimizer(
  config?: Partial<ExperienceOptimizerConfig>
): ExperienceOptimizer {
  return new ExperienceOptimizer(config);
}
