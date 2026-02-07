/**
 * Experience Injector
 * 
 * Retrieves relevant experiences and injects them into decision prompts.
 * Experiences are ADVISORY bias, not hard rules.
 * 
 * This component does NOT:
 * - Update beliefs
 * - Make decisions
 * - Override decision logic
 */

import type { Experience } from "../../schemas/index.js";
import { getExperienceRepository } from "../../storage/index.js";
import type { BeliefContext } from "./types.js";

export interface ExperienceInjectorConfig {
  /** Maximum experiences to inject (default: 5) */
  maxExperiences?: number;
  /** Minimum confidence to include (default: 0.3) */
  minConfidence?: number;
}

const DEFAULT_CONFIG: Required<ExperienceInjectorConfig> = {
  maxExperiences: 5,
  minConfidence: 0.3,
};

export class ExperienceInjector {
  private readonly config: Required<ExperienceInjectorConfig>;

  constructor(config: Partial<ExperienceInjectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get relevant experiences for a decision context
   */
  async getRelevantExperiences(
    task: string,
    beliefContext?: BeliefContext
  ): Promise<Experience[]> {
    const expRepo = getExperienceRepository();
    const allExperiences = await expRepo.list();

    // Filter by minimum confidence
    let relevant = allExperiences.filter(
      (e) => e.confidence >= this.config.minConfidence
    );

    // Score by relevance to task and context
    const scored = relevant.map((exp) => ({
      experience: exp,
      score: this.computeRelevanceScore(exp, task, beliefContext),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Return top N
    const result = scored
      .slice(0, this.config.maxExperiences)
      .filter((s) => s.score > 0)
      .map((s) => s.experience);

    console.log(
      `[ExperienceInjector] Selected ${result.length} experiences from ${allExperiences.length} total`
    );

    return result;
  }

  /**
   * Format experiences for injection into decision prompt
   */
  formatForPrompt(experiences: Experience[]): string {
    if (experiences.length === 0) {
      return "No prior experiences available.";
    }

    const lines = [
      "PRIOR EXPERIENCES (advisory, not mandatory):",
      "",
    ];

    for (const exp of experiences) {
      lines.push(`- [${exp.confidence.toFixed(2)}] ${exp.statement}`);
      if (exp.scope.length > 0) {
        lines.push(`  Scope: ${exp.scope.join(", ")}`);
      }
    }

    lines.push("");
    lines.push("Use these experiences as heuristics, not hard rules.");

    return lines.join("\n");
  }

  /**
   * Compute relevance score for an experience
   */
  private computeRelevanceScore(
    experience: Experience,
    task: string,
    beliefContext?: BeliefContext
  ): number {
    let score = experience.confidence * 0.5; // Base score from confidence

    const taskLower = task.toLowerCase();

    // Check scope overlap with task
    for (const scope of experience.scope) {
      if (taskLower.includes(scope.toLowerCase())) {
        score += 0.2;
      }
    }

    // Check keyword overlap
    const taskKeywords = this.extractKeywords(task);
    const statementKeywords = this.extractKeywords(experience.statement);

    let keywordOverlap = 0;
    for (const kw of taskKeywords) {
      if (statementKeywords.has(kw)) {
        keywordOverlap++;
      }
    }

    if (taskKeywords.size > 0) {
      score += (keywordOverlap / taskKeywords.size) * 0.3;
    }

    // Check belief context overlap
    if (beliefContext) {
      for (const model of beliefContext.models) {
        for (const tag of model.tags) {
          if (experience.scope.includes(tag)) {
            score += 0.1;
          }
        }
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): Set<string> {
    const words = text.toLowerCase().split(/\s+/);
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been",
      "being", "have", "has", "had", "do", "does", "did", "will",
      "would", "could", "should", "may", "might", "must", "shall",
      "can", "to", "of", "in", "for", "on", "with", "at", "by",
      "from", "as", "into", "through", "during", "before", "after",
      "above", "below", "between", "under", "again", "further",
      "then", "once", "here", "there", "when", "where", "why", "how",
      "all", "each", "few", "more", "most", "other", "some", "such",
      "no", "nor", "not", "only", "own", "same", "so", "than", "too",
      "very", "just", "and", "but", "if", "or", "because", "until",
      "while", "this", "that", "these", "those",
    ]);

    return new Set(
      words.filter((w) => w.length > 3 && !stopWords.has(w))
    );
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createExperienceInjector(
  config?: Partial<ExperienceInjectorConfig>
): ExperienceInjector {
  return new ExperienceInjector(config);
}

let instance: ExperienceInjector | null = null;

export function getExperienceInjector(
  config?: Partial<ExperienceInjectorConfig>
): ExperienceInjector {
  if (!instance) {
    instance = new ExperienceInjector(config);
  }
  return instance;
}
