/**
 * NOEMA Cognee Client - Type Definitions
 * 
 * These types define the contract between NOEMA and the Cognee service.
 * The Cognee service runs as a separate Python process.
 */

// =============================================================================
// Ingest Types
// =============================================================================

export interface IngestMetadata {
  source: string;
  timestamp: string;
  extra?: Record<string, unknown>;
}

export interface IngestInput {
  evidence_id: string;
  content: string;
  content_type: "text" | "log" | "screenshot_ocr" | "transcript";
  metadata: IngestMetadata;
}

export interface IngestResult {
  cognee_id: string;
}

// =============================================================================
// Search Types
// =============================================================================

export interface SearchInput {
  query: string;
  topK: number;
}

export interface SearchItem {
  cognee_id: string;
  snippet: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string;
  weight?: number;
}

export interface GraphContext {
  nodes: string[];
  edges: GraphEdge[];
}

export interface SearchResult {
  items: SearchItem[];
  graph_context?: GraphContext;
}

// =============================================================================
// Health Types
// =============================================================================

export interface HealthResult {
  status: "ok" | "error";
  message?: string;
}

// =============================================================================
// Cognify Types
// =============================================================================

export interface CognifyResult {
  status: "completed" | "error";
  message?: string;
}

// =============================================================================
// Client Interface
// =============================================================================

/**
 * Interface for the Cognee client.
 * 
 * This client communicates with the Cognee service over HTTP.
 * It does NOT contain any cognition logic - just HTTP calls + typing.
 */
export interface CogneeClient {
  /**
   * Ingest evidence into Cognee.
   * 
   * @param input - Evidence to ingest
   * @returns Cognee's internal identifier
   */
  ingestArtifact(input: IngestInput): Promise<IngestResult>;

  /**
   * Run Cognee's cognify process.
   * 
   * This builds/updates Cognee's internal representations
   * (vector embeddings, knowledge graph).
   */
  cognify(): Promise<CognifyResult>;

  /**
   * Search Cognee's memory for relevant evidence.
   * 
   * @param input - Search query and parameters
   * @returns Matching evidence snippets and graph context
   */
  searchMemory(input: SearchInput): Promise<SearchResult>;

  /**
   * Check if the Cognee service is healthy.
   */
  healthCheck(): Promise<HealthResult>;
}
