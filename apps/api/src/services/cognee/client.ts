/**
 * NOEMA Cognee Client - HTTP Client Implementation
 * 
 * This client communicates with the Cognee service over HTTP.
 * 
 * IMPORTANT: This client contains NO cognition logic.
 * - No heuristics
 * - No prompt engineering
 * - No filtering or ranking
 * - Just HTTP calls + typing
 * 
 * The Cognee service is memory infrastructure, not intelligence.
 */

import {
  CogneeClient,
  IngestInput,
  IngestResult,
  CognifyResult,
  SearchInput,
  SearchResult,
  HealthResult,
} from "./types.js";

export interface CogneeClientConfig {
  /** Base URL of the Cognee service */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * HTTP client for the Cognee service.
 */
export class CogneeHttpClient implements CogneeClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: CogneeClientConfig) {
    // Remove trailing slash if present
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  /**
   * Make an HTTP request to the Cognee service.
   */
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Cognee service error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Cognee service request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Ingest evidence into Cognee.
   */
  async ingestArtifact(input: IngestInput): Promise<IngestResult> {
    return this.request<IngestResult>("POST", "/ingest", {
      evidence_id: input.evidence_id,
      content: input.content,
      content_type: input.content_type,
      metadata: {
        source: input.metadata.source,
        timestamp: input.metadata.timestamp,
        extra: input.metadata.extra,
      },
    });
  }

  /**
   * Run Cognee's cognify process.
   */
  async cognify(): Promise<CognifyResult> {
    return this.request<CognifyResult>("POST", "/cognify");
  }

  /**
   * Search Cognee's memory.
   */
  async searchMemory(input: SearchInput): Promise<SearchResult> {
    return this.request<SearchResult>("POST", "/search", {
      query: input.query,
      topK: input.topK,
    });
  }

  /**
   * Check if the Cognee service is healthy.
   */
  async healthCheck(): Promise<HealthResult> {
    try {
      return await this.request<HealthResult>("GET", "/health");
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// =============================================================================
// Factory and Singleton
// =============================================================================

const DEFAULT_COGNEE_URL = "http://localhost:8100";

let instance: CogneeHttpClient | null = null;

/**
 * Get the default Cognee client instance.
 * 
 * Uses COGNEE_SERVICE_URL environment variable or defaults to localhost:8100.
 */
export function getCogneeClient(): CogneeClient {
  if (!instance) {
    const baseUrl = process.env.COGNEE_SERVICE_URL ?? DEFAULT_COGNEE_URL;
    instance = new CogneeHttpClient({ baseUrl });
  }
  return instance;
}

/**
 * Create a new Cognee client with custom configuration.
 */
export function createCogneeClient(config: CogneeClientConfig): CogneeClient {
  return new CogneeHttpClient(config);
}
