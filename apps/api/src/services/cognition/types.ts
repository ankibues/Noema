/**
 * Model Update Engine - Type Definitions
 * 
 * Types for belief formation and evolution in NOEMA.
 */

import type { 
  MentalModelDomain,
} from "../../schemas/index.js";

// =============================================================================
// LLM Prompt Input/Output Types
// =============================================================================

/**
 * Input to the model update prompt
 */
export interface ModelUpdatePromptInput {
  observation: {
    observation_id: string;
    type: string;
    summary: string;
    key_points: string[];
    entities: string[];
    confidence: number;
  };
  candidate_models: {
    model_id: string;
    title: string;
    summary: string;
    confidence: number;
    tags: string[];
  }[];
  retrieved_evidence_summaries: {
    evidence_id: string;
    snippet: string;
    score: number;
  }[];
  current_graph_edges: {
    from_model: string;
    to_model: string;
    relation: string;
    weight: number;
  }[];
}

/**
 * Model patch for updates
 */
export interface ModelPatch {
  title?: string;
  summary?: string;
  core_principles?: string[];
  assumptions?: string[];
  procedures?: string[];
  failure_modes?: string[];
  diagnostics?: string[];
  examples?: string[];
}

/**
 * Graph update instruction
 */
export interface GraphUpdate {
  to_model: string;
  relation: "depends_on" | "explains" | "extends" | "contradicts";
  weight: number;
}

/**
 * Model update instruction from LLM
 */
export interface ModelUpdateInstruction {
  model_id: string;
  patch: ModelPatch;
  change_summary: string;
  delta_confidence: number;
  evidence_ids: string[];
  graph_updates?: GraphUpdate[];
}

/**
 * New model creation instruction from LLM
 */
export interface ModelCreateInstruction {
  title: string;
  domain: MentalModelDomain;
  tags: string[];
  summary: string;
  core_principles: string[];
  assumptions: string[];
  procedures: string[];
  failure_modes: string[];
  diagnostics: string[];
  examples: string[];
  confidence: number;
  evidence_ids: string[];
}

/**
 * Contradiction detected by LLM
 */
export interface ContradictionDetection {
  model_id: string;
  conflict: string;
  suggested_resolution: string;
}

/**
 * Output from the model update prompt
 */
export interface ModelUpdatePromptOutput {
  create_models: ModelCreateInstruction[];
  update_models: ModelUpdateInstruction[];
  contradictions: ContradictionDetection[];
}

// =============================================================================
// Engine Types
// =============================================================================

/**
 * Configuration for ModelUpdateEngine
 */
export interface ModelUpdateEngineConfig {
  /** Minimum salience to trigger model update (default: 0.5) */
  salienceThreshold?: number;
  /** Whether to enable Cognee retrieval (default: true) */
  cogneeEnabled?: boolean;
  /** Number of evidence items to retrieve (default: 5) */
  evidenceTopK?: number;
  /** Number of candidate models to consider (default: 3) */
  candidateModelLimit?: number;
  /** Use mock LLM for testing (default: false) */
  mockLLM?: boolean;
  /** LLM provider configuration */
  llm?: {
    provider: "gemini" | "openai";
    model?: string;
    apiKey?: string;
  };
}

/**
 * Result of processing an observation
 */
export interface ModelUpdateResult {
  /** Observation that was processed */
  observationId: string;
  /** Models that were created */
  createdModels: string[];
  /** Models that were updated */
  updatedModels: string[];
  /** Graph edges that were created */
  createdEdges: string[];
  /** Contradictions detected */
  contradictions: ContradictionDetection[];
  /** Whether processing was skipped (e.g., low salience) */
  skipped: boolean;
  /** Reason for skipping if applicable */
  skipReason?: string;
}

/**
 * Evidence retrieved from Cognee
 */
export interface RetrievedEvidence {
  evidenceId: string;
  snippet: string;
  score: number;
  metadata?: Record<string, unknown>;
}
