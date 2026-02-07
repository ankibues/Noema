/**
 * Experience Layer - Main Export
 * 
 * The Experience Layer is where NOEMA learns what WORKS.
 * 
 * Key distinction:
 * - Phase 4 learns what is TRUE (beliefs/mental models)
 * - Phase 6 learns what WORKS (experiences/action heuristics)
 * 
 * This layer does NOT:
 * - Update beliefs
 * - Make decisions
 * - Retrain models
 */

// Main optimizer
export {
  ExperienceOptimizer,
  createExperienceOptimizer,
  type OptimizationResult,
} from "./experience_optimizer.js";

// Rollout management
export {
  RolloutManager,
  createRolloutManager,
} from "./rollout_manager.js";

// Outcome evaluation
export {
  OutcomeEvaluator,
  createOutcomeEvaluator,
} from "./outcome_evaluator.js";

// Experience extraction
export {
  ExperienceExtractor,
  createExperienceExtractor,
} from "./experience_extractor.js";

// Experience injection
export {
  ExperienceInjector,
  createExperienceInjector,
  getExperienceInjector,
} from "./experience_injector.js";

// Types
export type {
  Rollout,
  RolloutSet,
  BeliefContext,
  EvaluationCriteria,
  EvaluatedRollout,
  RolloutComparison,
  ExtractionPromptInput,
  ExtractionPromptOutput,
  ExtractionResult,
  ExperienceOptimizerConfig,
  RolloutManagerConfig,
} from "./types.js";
