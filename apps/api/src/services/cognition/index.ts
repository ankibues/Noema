/**
 * Cognition Layer - Main Export
 * 
 * The Cognition Layer is where NOEMA forms and evolves beliefs.
 * 
 * This layer:
 * - Subscribes to observations
 * - Retrieves evidence from memory
 * - Updates mental models
 * - Maintains belief structure (graph)
 * 
 * This layer does NOT:
 * - Make decisions about actions
 * - Run tools or external systems
 * - Extract experiences (that's Phase 6)
 */

// Main engine
export {
  ModelUpdateEngine,
  getModelUpdateEngine,
  createModelUpdateEngine,
} from "./model_update_engine.js";

// Supporting components
export { retrieveEvidence, retrieveEvidenceBatch } from "./evidence_retriever.js";
export { selectCandidateModels, isNovelConcept } from "./candidate_selector.js";
export { callModelUpdateLLM } from "./llm_client.js";
export { callMockModelUpdateLLM } from "./mock_llm_client.js";
export {
  persistNewModels,
  persistModelUpdates,
  linkObservationToModels,
} from "./model_persister.js";

// Types
export type {
  ModelUpdateEngineConfig,
  ModelUpdateResult,
  ModelUpdatePromptInput,
  ModelUpdatePromptOutput,
  ModelCreateInstruction,
  ModelUpdateInstruction,
  ModelPatch,
  GraphUpdate,
  ContradictionDetection,
  RetrievedEvidence,
} from "./types.js";
