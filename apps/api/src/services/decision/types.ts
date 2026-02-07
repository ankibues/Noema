/**
 * Decision Engine Types
 * 
 * Types for the decision-making layer of NOEMA.
 */

import type { MentalModel, Experience, Observation } from "../../schemas/index.js";
import type {
  BrowserAction,
  BrowserActionOutcome,
  BrowserActionType,
  DecisionOutput,
} from "./action_types.js";

// =============================================================================
// Decision Engine Configuration
// =============================================================================

export interface DecisionEngineConfig {
  /** Minimum model confidence to consider (default: 0.4) */
  modelConfidenceThreshold?: number;
  /** Maximum number of models to include in context (default: 5) */
  maxModelsInContext?: number;
  /** Maximum number of recent outcomes to include (default: 5) */
  maxRecentOutcomes?: number;
  /** Use mock LLM for testing (default: false) */
  mockLLM?: boolean;
  /** LLM provider configuration */
  llm?: {
    provider: "gemini" | "openai";
    model?: string;
    apiKey?: string;
  };
  /** Browser configuration */
  browser?: {
    headless?: boolean;
    slowMo?: number;
    screenshotDir?: string;
  };
}

// =============================================================================
// Decision Context
// =============================================================================

export interface DecisionContext {
  /** Current task description */
  task: string;
  /** Active mental models (filtered by confidence) */
  mentalModels: MentalModel[];
  /** Relevant experiences */
  experiences: Experience[];
  /** Recent action outcomes */
  recentOutcomes: BrowserActionOutcome[];
  /** Recent observations */
  recentObservations: Observation[];
  /** Current run ID */
  runId: string;
}

// =============================================================================
// Decision Result
// =============================================================================

export interface DecisionResult {
  /** The selected action */
  action: BrowserAction;
  /** Raw LLM output */
  rawOutput: DecisionOutput;
  /** Context used for decision */
  contextUsed: {
    modelIds: string[];
    experienceIds: string[];
    outcomeIds: string[];
  };
}

// =============================================================================
// Execution Result
// =============================================================================

export interface ExecutionResult {
  /** The action that was executed */
  action: BrowserAction;
  /** The outcome of execution */
  outcome: BrowserActionOutcome;
  /** Observations generated from outcome */
  generatedObservationIds: string[];
}

// =============================================================================
// LLM Prompt Input
// =============================================================================

export interface DecisionPromptInput {
  task: string;
  mental_models: {
    model_id: string;
    title: string;
    summary: string;
    confidence: number;
    procedures: string[];
    failure_modes: string[];
  }[];
  experiences: {
    experience_id: string;
    statement: string;
    confidence: number;
  }[];
  recent_outcomes: {
    action_id: string;
    action_type: BrowserActionType;
    status: "success" | "failure";
    error_message?: string;
  }[];
  available_actions: string[];
}
