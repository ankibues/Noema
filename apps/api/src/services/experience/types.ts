/**
 * Experience Optimizer Types
 * 
 * Types for learning from action outcomes without retraining.
 * 
 * Key distinction:
 * - Phase 4 learns what is TRUE (beliefs)
 * - Phase 6 learns what WORKS (experiences)
 */

import type { Experience } from "../../schemas/index.js";
import type { BrowserAction, BrowserActionOutcome } from "../decision/action_types.js";

// =============================================================================
// Rollout Types
// =============================================================================

/**
 * A single rollout represents one action attempt in a given context
 */
export interface Rollout {
  rollout_id: string;
  /** The belief context (mental models) at time of rollout */
  beliefContext: BeliefContext;
  /** The action that was taken */
  action: BrowserAction;
  /** The outcome of the action */
  outcome: BrowserActionOutcome;
  /** Observations generated from this rollout */
  observationIds: string[];
  /** Run ID this rollout belongs to */
  runId: string;
  /** Timestamp */
  timestamp: string;
}

/**
 * Belief context at the time of a rollout
 */
export interface BeliefContext {
  /** Active mental models */
  models: {
    model_id: string;
    title: string;
    confidence: number;
    tags: string[];
  }[];
  /** Task being performed */
  task: string;
  /** Summary of current state */
  stateSummary: string;
}

/**
 * A rollout set is a collection of rollouts for comparison
 */
export interface RolloutSet {
  set_id: string;
  /** The shared belief context */
  beliefContext: BeliefContext;
  /** All rollouts in this set */
  rollouts: Rollout[];
  /** When this set was created */
  created_at: string;
}

// =============================================================================
// Evaluation Types
// =============================================================================

/**
 * Evaluation criteria for comparing rollouts
 */
export interface EvaluationCriteria {
  /** Did the action succeed? */
  success: boolean;
  /** How clear was the evidence produced? (0-1) */
  evidenceClarity: number;
  /** How specific was the error/result? (0-1) */
  errorSpecificity: number;
  /** Did it reduce ambiguity? (0-1) */
  ambiguityReduction: number;
  /** How strong was the signal? (0-1) */
  signalStrength: number;
}

/**
 * Evaluated rollout with scores
 */
export interface EvaluatedRollout {
  rollout: Rollout;
  criteria: EvaluationCriteria;
  /** Overall score (0-1) */
  overallScore: number;
  /** Rank within the set (1 = best) */
  rank: number;
}

/**
 * Comparison result between rollouts
 */
export interface RolloutComparison {
  set_id: string;
  evaluatedRollouts: EvaluatedRollout[];
  /** The winning rollout */
  winner: Rollout | null;
  /** The losing rollout(s) */
  losers: Rollout[];
  /** Is there a clear winner? */
  hasClearWinner: boolean;
  /** Margin between winner and runner-up */
  winMargin: number;
}

// =============================================================================
// Experience Extraction Types
// =============================================================================

/**
 * Input to the experience extraction LLM
 */
export interface ExtractionPromptInput {
  task: string;
  rollouts: {
    action_plan: string;
    outcome: string;
    success: boolean;
    artifacts: string[];
  }[];
  existing_experiences: {
    experience_id: string;
    statement: string;
    scope: string[];
    confidence: number;
  }[];
}

/**
 * Output from the experience extraction LLM
 */
export interface ExtractionPromptOutput {
  add: {
    statement: string;
    scope: string[];
    confidence: number;
  }[];
  modify: {
    experience_id: string;
    new_statement: string;
    new_scope: string[];
    new_confidence: number;
  }[];
  delete: string[];
}

/**
 * Result of experience extraction
 */
export interface ExtractionResult {
  /** Experiences to add */
  added: Experience[];
  /** Experiences that were modified */
  modified: Experience[];
  /** Experience IDs that were deleted */
  deleted: string[];
  /** Whether any extraction occurred */
  hasChanges: boolean;
  /** Reason if no extraction */
  noExtractionReason?: string;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for the Experience Optimizer
 */
export interface ExperienceOptimizerConfig {
  /** Number of rollouts per comparison (default: 2) */
  rolloutCount?: number;
  /** Minimum score margin to declare a winner (default: 0.15) */
  minWinMargin?: number;
  /** Maximum experiences to inject into decisions (default: 5) */
  maxExperiencesInContext?: number;
  /** Use mock LLM for testing (default: false) */
  mockLLM?: boolean;
  /** LLM configuration */
  llm?: {
    provider: "gemini" | "openai";
    model?: string;
    apiKey?: string;
  };
}

/**
 * Configuration for the Rollout Manager
 */
export interface RolloutManagerConfig {
  /** Number of rollouts to perform (default: 2) */
  rolloutCount?: number;
  /** Delay between rollouts in ms (default: 1000) */
  rolloutDelay?: number;
  /** Browser configuration */
  browser?: {
    headless?: boolean;
    slowMo?: number;
    screenshotDir?: string;
  };
}
