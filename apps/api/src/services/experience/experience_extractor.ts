/**
 * Experience Extractor
 * 
 * Extracts reusable action heuristics from rollout comparisons.
 * Uses prompts/experience_extraction.md.
 * 
 * Key principle: Only extract if there's a CLEAR winner.
 * If outcomes are ambiguous → extract nothing.
 * 
 * This component does NOT:
 * - Update beliefs
 * - Make decisions
 * - Evaluate outcomes
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Experience } from "../../schemas/index.js";
import { getExperienceRepository } from "../../storage/index.js";
import type {
  Rollout,
  RolloutComparison,
  ExtractionPromptInput,
  ExtractionPromptOutput,
  ExtractionResult,
} from "./types.js";

export interface ExperienceExtractorConfig {
  /** Use mock LLM for testing (default: false) */
  mockLLM?: boolean;
  /** LLM configuration */
  llm?: {
    provider: "gemini" | "openai";
    model?: string;
    apiKey?: string;
  };
}

const DEFAULT_CONFIG: Required<ExperienceExtractorConfig> = {
  mockLLM: false,
  llm: {
    provider: "gemini",
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  },
};

export class ExperienceExtractor {
  private readonly config: Required<ExperienceExtractorConfig>;

  constructor(config: Partial<ExperienceExtractorConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      llm: { ...DEFAULT_CONFIG.llm, ...config.llm },
    };
  }

  /**
   * Extract experiences from a rollout comparison
   */
  async extract(
    comparison: RolloutComparison,
    runId: string
  ): Promise<ExtractionResult> {
    console.log(`[ExperienceExtractor] Extracting from comparison ${comparison.set_id}`);

    // If no clear winner, don't extract
    if (!comparison.hasClearWinner) {
      console.log("[ExperienceExtractor] No clear winner, skipping extraction");
      return {
        added: [],
        modified: [],
        deleted: [],
        hasChanges: false,
        noExtractionReason: `No clear winner (margin: ${comparison.winMargin.toFixed(3)})`,
      };
    }

    // Get existing experiences for context
    const expRepo = getExperienceRepository();
    const existingExperiences = await expRepo.list();

    // Build prompt input
    const promptInput = this.buildPromptInput(comparison, existingExperiences);

    // Call LLM
    let llmOutput: ExtractionPromptOutput;
    try {
      if (this.config.mockLLM) {
        llmOutput = this.mockExtraction(comparison);
      } else {
        llmOutput = await this.callExtractionLLM(promptInput);
      }
    } catch (error) {
      console.error("[ExperienceExtractor] LLM call failed:", error);
      return {
        added: [],
        modified: [],
        deleted: [],
        hasChanges: false,
        noExtractionReason: `LLM call failed: ${error}`,
      };
    }

    // Apply extraction results
    const result = await this.applyExtraction(llmOutput, runId);

    console.log(
      `[ExperienceExtractor] Extraction complete: ` +
      `${result.added.length} added, ${result.modified.length} modified, ${result.deleted.length} deleted`
    );

    return result;
  }

  /**
   * Build prompt input from comparison
   */
  private buildPromptInput(
    comparison: RolloutComparison,
    existingExperiences: Experience[]
  ): ExtractionPromptInput {
    const task = comparison.evaluatedRollouts[0]?.rollout.beliefContext.task || "";

    return {
      task,
      rollouts: comparison.evaluatedRollouts.map((er) => ({
        action_plan: `${er.rollout.action.type}: ${er.rollout.action.rationale}`,
        outcome: er.rollout.outcome.error_message || 
          `Status: ${er.rollout.outcome.status}, Duration: ${er.rollout.outcome.duration_ms}ms`,
        success: er.rollout.outcome.status === "success",
        artifacts: [
          ...er.rollout.outcome.artifacts.screenshots,
          ...er.rollout.outcome.artifacts.logs.slice(0, 3), // Limit logs
        ],
      })),
      existing_experiences: existingExperiences.map((e) => ({
        experience_id: e.experience_id,
        statement: e.statement,
        scope: e.scope,
        confidence: e.confidence,
      })),
    };
  }

  /**
   * Call LLM for experience extraction
   */
  private async callExtractionLLM(
    input: ExtractionPromptInput
  ): Promise<ExtractionPromptOutput> {
    // Load prompt template
    const promptPath = join(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "..",
      "..",
      "prompts",
      "experience_extraction.md"
    );
    const promptTemplate = await readFile(promptPath, "utf-8");

    const userMessage = `
${promptTemplate}

---

INPUT:
${JSON.stringify(input, null, 2)}

---

Respond with valid JSON only. No markdown, no explanation.
`;

    // Call Gemini
    const apiKey = this.config.llm.apiKey || 
      process.env.GEMINI_API_KEY || 
      process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      throw new Error("Gemini API key not set");
    }

    const model = this.config.llm.model || process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("No text in Gemini response");
    }

    return this.parseExtractionResponse(text);
  }

  /**
   * Parse LLM response
   */
  private parseExtractionResponse(response: string): ExtractionPromptOutput {
    let jsonStr = response.trim();

    // Remove markdown code blocks
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    return {
      add: Array.isArray(parsed.add) ? parsed.add : [],
      modify: Array.isArray(parsed.modify) ? parsed.modify : [],
      delete: Array.isArray(parsed.delete) ? parsed.delete : [],
    };
  }

  /**
   * Mock extraction for testing
   */
  private mockExtraction(comparison: RolloutComparison): ExtractionPromptOutput {
    if (!comparison.hasClearWinner || !comparison.winner) {
      return { add: [], modify: [], delete: [] };
    }

    const winner = comparison.winner;
    const loser = comparison.losers[0];

    // Generate a mock experience based on the winning action
    const winnerAction = winner.action.type;
    const loserAction = loser?.action.type;

    // Only generate if actions differ
    if (winnerAction === loserAction) {
      return { add: [], modify: [], delete: [] };
    }

    const statement = this.generateMockStatement(winner, loser);

    return {
      add: [
        {
          statement,
          scope: ["browser", "navigation", winner.action.type],
          confidence: Math.min(0.7, 0.5 + comparison.winMargin),
        },
      ],
      modify: [],
      delete: [],
    };
  }

  /**
   * Generate a mock experience statement
   */
  private generateMockStatement(
    winner: Rollout,
    _loser?: Rollout
  ): string {
    const winnerAction = winner.action.type;
    const winnerSuccess = winner.outcome.status === "success";

    if (winnerSuccess) {
      return `When navigating to a URL, ${winnerAction} produces clearer evidence than alternatives.`;
    } else {
      // Even failed actions can teach us something
      const errorType = winner.outcome.error_message?.includes("timeout")
        ? "timeout"
        : winner.outcome.error_message?.includes("not found")
        ? "element not found"
        : "error";

      return `When encountering ${errorType}, capture a screenshot first to understand the page state.`;
    }
  }

  /**
   * Apply extraction results to storage
   */
  private async applyExtraction(
    output: ExtractionPromptOutput,
    runId: string
  ): Promise<ExtractionResult> {
    const expRepo = getExperienceRepository();
    const added: Experience[] = [];
    const modified: Experience[] = [];
    const deleted: string[] = [];

    // Add new experiences
    for (const toAdd of output.add) {
      // Validate statement length
      const wordCount = toAdd.statement.split(/\s+/).length;
      if (wordCount > 32) {
        console.warn(`[ExperienceExtractor] Skipping experience with ${wordCount} words (max 32)`);
        continue;
      }

      const experience = await expRepo.create({
        statement: toAdd.statement,
        scope: toAdd.scope,
        confidence: Math.max(0, Math.min(1, toAdd.confidence)),
        source_runs: [runId],
      });

      added.push(experience);
      console.log(`[ExperienceExtractor] Added: "${experience.statement.substring(0, 50)}..."`);
    }

    // Modify existing experiences
    for (const toModify of output.modify) {
      const existing = await expRepo.get(toModify.experience_id);
      if (!existing) {
        console.warn(`[ExperienceExtractor] Experience not found: ${toModify.experience_id}`);
        continue;
      }

      const updated = await expRepo.update(toModify.experience_id, {
        updates: {
          statement: toModify.new_statement,
          scope: toModify.new_scope,
          confidence: Math.max(0, Math.min(1, toModify.new_confidence)),
        },
        additionalSourceRuns: [runId],
      });

      if (updated) {
        modified.push(updated);
        console.log(`[ExperienceExtractor] Modified: ${toModify.experience_id}`);
      }
    }

    // Delete experiences
    for (const toDelete of output.delete) {
      const success = await expRepo.delete(toDelete);
      if (success) {
        deleted.push(toDelete);
        console.log(`[ExperienceExtractor] Deleted: ${toDelete}`);
      }
    }

    return {
      added,
      modified,
      deleted,
      hasChanges: added.length > 0 || modified.length > 0 || deleted.length > 0,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createExperienceExtractor(
  config?: Partial<ExperienceExtractorConfig>
): ExperienceExtractor {
  return new ExperienceExtractor(config);
}
