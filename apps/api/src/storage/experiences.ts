/**
 * Experience Repository
 * 
 * Experiences are reusable lessons extracted from comparative attempts.
 * They serve as "token priors" - context injected to bias future action generation.
 * 
 * Experiences differ from mental models:
 * - Mental models: "How the world works" (descriptive)
 * - Experiences: "What worked for me" (prescriptive)
 */

import { v4 as uuid } from "uuid";
import {
  Experience,
  ExperienceSchema,
  CreateExperienceInput,
} from "../schemas/index.js";
import { BaseRepository, getCollectionPath, nowISO } from "./base.js";

export interface UpdateExperienceInput {
  /** Fields to update */
  updates: Partial<Omit<Experience, "experience_id" | "created_at" | "last_updated">>;
  /** Additional source runs to add */
  additionalSourceRuns?: string[];
}

export class ExperienceRepository extends BaseRepository<Experience> {
  constructor() {
    super({
      filePath: getCollectionPath("experiences"),
      schema: ExperienceSchema,
      idField: "experience_id",
    });
  }

  /**
   * Create a new experience
   */
  async create(input: CreateExperienceInput): Promise<Experience> {
    const now = nowISO();
    const experience: Experience = {
      ...input,
      experience_id: uuid(),
      created_at: now,
      last_updated: now,
    };

    await this._set(experience.experience_id, experience);
    return experience;
  }

  /**
   * Update an experience
   * Preserves created_at, updates last_updated
   */
  async update(
    id: string,
    input: UpdateExperienceInput
  ): Promise<Experience | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;

    const sourceRuns = input.additionalSourceRuns
      ? [...new Set([...existing.source_runs, ...input.additionalSourceRuns])]
      : existing.source_runs;

    const updated: Experience = {
      ...existing,
      ...input.updates,
      // Immutable fields preserved
      experience_id: existing.experience_id,
      created_at: existing.created_at,
      // Updated metadata
      last_updated: nowISO(),
      source_runs: sourceRuns,
    };

    await this._set(id, updated);
    return updated;
  }

  /**
   * Boost confidence of an experience (it worked again)
   */
  async reinforce(
    id: string,
    sourceRunId: string,
    boost: number = 0.05
  ): Promise<Experience | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;

    return this.update(id, {
      updates: {
        confidence: Math.min(1, existing.confidence + boost),
      },
      additionalSourceRuns: [sourceRunId],
    });
  }

  /**
   * Reduce confidence of an experience (it didn't work this time)
   */
  async weaken(
    id: string,
    sourceRunId: string,
    penalty: number = 0.1
  ): Promise<Experience | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;

    return this.update(id, {
      updates: {
        confidence: Math.max(0, existing.confidence - penalty),
      },
      additionalSourceRuns: [sourceRunId],
    });
  }

  /**
   * Find experiences by scope (any matching scope tag)
   */
  async findByScope(scopeTag: string): Promise<Experience[]> {
    return this.list((exp) => exp.scope.includes(scopeTag));
  }

  /**
   * Find experiences by multiple scope tags (all must match)
   */
  async findByScopeAll(scopeTags: string[]): Promise<Experience[]> {
    return this.list((exp) =>
      scopeTags.every((tag) => exp.scope.includes(tag))
    );
  }

  /**
   * Find experiences with confidence above threshold
   */
  async findHighConfidence(threshold: number = 0.6): Promise<Experience[]> {
    return this.list((exp) => exp.confidence >= threshold);
  }

  /**
   * Find experiences from a specific run
   */
  async findBySourceRun(runId: string): Promise<Experience[]> {
    return this.list((exp) => exp.source_runs.includes(runId));
  }

  /**
   * Delete an experience (experiences can be deleted unlike observations)
   */
  async delete(id: string): Promise<boolean> {
    return this._delete(id);
  }

  /**
   * Supersede an experience with a better one
   * Marks old as low confidence, creates new
   */
  async supersede(
    oldId: string,
    newInput: CreateExperienceInput
  ): Promise<{ old: Experience | undefined; new: Experience }> {
    // Weaken the old experience significantly
    const oldExperience = await this.update(oldId, {
      updates: {
        confidence: 0.1, // Mark as mostly obsolete
      },
    });

    // Create the new experience
    const newExperience = await this.create(newInput);

    return { old: oldExperience, new: newExperience };
  }
}

// Singleton instance
let instance: ExperienceRepository | null = null;

export function getExperienceRepository(): ExperienceRepository {
  if (!instance) {
    instance = new ExperienceRepository();
  }
  return instance;
}
