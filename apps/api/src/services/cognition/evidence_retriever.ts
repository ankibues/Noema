/**
 * Evidence Retriever
 * 
 * Retrieves relevant evidence from Cognee based on observation content.
 * 
 * This component does NOT:
 * - Rank or filter beyond Cognee's output
 * - Interpret evidence meaning
 * - Make decisions
 */

import { getCogneeClient } from "../cognee/index.js";
import type { Observation } from "../../schemas/index.js";
import type { RetrievedEvidence } from "./types.js";

export interface EvidenceRetrieverConfig {
  /** Number of evidence items to retrieve */
  topK: number;
  /** Whether Cognee is enabled */
  enabled: boolean;
}

const DEFAULT_CONFIG: EvidenceRetrieverConfig = {
  topK: 5,
  enabled: true,
};

/**
 * Retrieve evidence related to an observation
 */
export async function retrieveEvidence(
  observation: Observation,
  config: Partial<EvidenceRetrieverConfig> = {}
): Promise<RetrievedEvidence[]> {
  const opts = { ...DEFAULT_CONFIG, ...config };

  if (!opts.enabled) {
    return [];
  }

  // Build query from observation content
  const queryParts = [
    observation.summary,
    ...observation.key_points.slice(0, 3),
    ...observation.entities.slice(0, 3),
  ];
  const query = queryParts.join(" ").substring(0, 500);

  try {
    const cognee = getCogneeClient();
    const result = await cognee.searchMemory({
      query,
      topK: opts.topK,
    });

    // Convert to our evidence format
    return result.items.map((item) => ({
      evidenceId: item.cognee_id,
      snippet: item.snippet,
      score: item.score,
      metadata: item.metadata,
    }));
  } catch (error) {
    console.error("[EvidenceRetriever] Cognee search failed:", error);
    return [];
  }
}

/**
 * Retrieve evidence for multiple observations (batched)
 */
export async function retrieveEvidenceBatch(
  observations: Observation[],
  config: Partial<EvidenceRetrieverConfig> = {}
): Promise<Map<string, RetrievedEvidence[]>> {
  const results = new Map<string, RetrievedEvidence[]>();

  // Process in parallel
  await Promise.all(
    observations.map(async (obs) => {
      const evidence = await retrieveEvidence(obs, config);
      results.set(obs.observation_id, evidence);
    })
  );

  return results;
}
