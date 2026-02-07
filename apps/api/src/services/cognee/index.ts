/**
 * NOEMA Cognee Client - Main Export
 * 
 * Provides access to the Cognee service for semantic memory operations.
 * 
 * Cognee is memory infrastructure, NOT intelligence.
 * - Stores and indexes evidence
 * - Provides semantic + graph-based retrieval
 * - Does NOT store beliefs, models, or experiences
 * - Does NOT make decisions
 */

export * from "./types.js";
export {
  CogneeHttpClient,
  getCogneeClient,
  createCogneeClient,
  type CogneeClientConfig,
} from "./client.js";
