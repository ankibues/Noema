/**
 * Candidate Model Selector
 * 
 * Selects existing mental models that might be related to an observation.
 * 
 * This component does NOT:
 * - Create or update models
 * - Interpret observation meaning deeply
 * - Make decisions about which model to use
 */

import { getMentalModelRepository } from "../../storage/index.js";
import type { Observation, MentalModel } from "../../schemas/index.js";

export interface CandidateSelectorConfig {
  /** Maximum number of candidates to return */
  limit: number;
  /** Minimum confidence for a model to be considered */
  minConfidence?: number;
  /** Only consider active models */
  activeOnly?: boolean;
}

const DEFAULT_CONFIG: CandidateSelectorConfig = {
  limit: 3,
  minConfidence: 0.1,
  activeOnly: false, // Include candidates as well
};

/**
 * Select candidate models related to an observation
 */
export async function selectCandidateModels(
  observation: Observation,
  config: Partial<CandidateSelectorConfig> = {}
): Promise<MentalModel[]> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const modelRepo = getMentalModelRepository();

  // Get all models (filtered by status if needed)
  let models = opts.activeOnly
    ? await modelRepo.findActive()
    : await modelRepo.list();

  // Filter by minimum confidence
  if (opts.minConfidence !== undefined) {
    models = models.filter((m) => m.confidence >= opts.minConfidence!);
  }

  // Score models by relevance to observation
  const scoredModels = models.map((model) => ({
    model,
    score: calculateRelevanceScore(observation, model),
  }));

  // Sort by score descending
  scoredModels.sort((a, b) => b.score - a.score);

  // Return top candidates
  return scoredModels
    .slice(0, opts.limit)
    .filter((s) => s.score > 0) // Only return models with some relevance
    .map((s) => s.model);
}

/**
 * Calculate relevance score between observation and model
 * 
 * Simple heuristic based on:
 * - Entity overlap
 * - Tag overlap
 * - Keyword overlap in summary
 * - Title similarity
 */
function calculateRelevanceScore(
  observation: Observation,
  model: MentalModel
): number {
  let score = 0;

  // Extract keywords from observation
  const obsText = observation.summary.toLowerCase();
  const obsKeywords = new Set([
    ...observation.entities.map((e) => e.toLowerCase()),
    ...observation.key_points.flatMap((kp) =>
      kp.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    ),
    // Also extract from summary
    ...obsText.split(/\s+/).filter((w) => w.length > 4),
  ]);

  // Extract keywords from model
  const modelTitle = model.title.toLowerCase();
  const modelSummary = model.summary.toLowerCase();
  const modelKeywords = new Set([
    ...model.tags.map((t) => t.toLowerCase()),
    ...modelTitle.split(/\s+/).filter((w) => w.length > 3),
    ...modelSummary.split(/\s+/).filter((w) => w.length > 4),
  ]);

  // Count overlapping keywords
  let overlap = 0;
  for (const keyword of obsKeywords) {
    if (modelKeywords.has(keyword)) {
      overlap++;
    }
    // Partial match
    for (const modelKw of modelKeywords) {
      if (modelKw.includes(keyword) || keyword.includes(modelKw)) {
        overlap += 0.5;
      }
    }
  }

  // Normalize score
  const maxPossible = Math.max(obsKeywords.size, modelKeywords.size, 1);
  score = overlap / maxPossible;

  // Title similarity boost - check if key concepts match
  const titleWords = modelTitle.split(/\s+/);
  for (const word of titleWords) {
    if (word.length > 3 && obsText.includes(word)) {
      score += 0.15;
    }
  }

  // Boost for domain match based on observation type
  const domainBoosts: Record<string, string[]> = {
    software_QA: ["test", "error", "fail", "bug", "qa", "timeout", "database", "connection"],
    programming: ["code", "function", "class", "api", "module"],
    research: ["study", "analysis", "data", "hypothesis"],
  };

  for (const [domain, keywords] of Object.entries(domainBoosts)) {
    if (model.domain === domain) {
      for (const kw of keywords) {
        if (obsText.includes(kw)) {
          score += 0.1;
          break;
        }
      }
    }
  }

  return Math.min(score, 1.0);
}

/**
 * Check if an observation represents a novel concept
 * (no existing models are sufficiently related)
 */
export async function isNovelConcept(
  observation: Observation,
  threshold: number = 0.2
): Promise<boolean> {
  const candidates = await selectCandidateModels(observation, { limit: 1 });
  
  if (candidates.length === 0) {
    return true;
  }

  // Check if the best candidate has sufficient relevance
  const bestScore = calculateRelevanceScore(observation, candidates[0]);
  return bestScore < threshold;
}
