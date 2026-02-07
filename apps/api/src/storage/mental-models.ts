/**
 * Mental Model Repository
 * 
 * Mental models are DOCUMENTS that represent understanding.
 * They evolve over time with full audit trail via update_history.
 * 
 * Key constraints:
 * - created_at is immutable
 * - All updates append to update_history
 * - Updates must include change_summary and evidence
 */

import { v4 as uuid } from "uuid";
import {
  MentalModel,
  MentalModelSchema,
  CreateMentalModelInput,
  UpdateHistoryEntry,
} from "../schemas/index.js";
import { BaseRepository, getCollectionPath, nowISO } from "./base.js";

export interface UpdateMentalModelInput {
  /** What changed - required for audit trail */
  change_summary: string;
  /** Evidence supporting this change */
  evidence_ids: string[];
  /** Fields to update */
  updates: Partial<
    Omit<MentalModel, "model_id" | "created_at" | "last_updated" | "update_history">
  >;
}

export class MentalModelRepository extends BaseRepository<MentalModel> {
  constructor() {
    super({
      filePath: getCollectionPath("mental_models"),
      schema: MentalModelSchema,
      idField: "model_id",
    });
  }

  /**
   * Create a new mental model
   */
  async create(input: CreateMentalModelInput): Promise<MentalModel> {
    const now = nowISO();
    const model: MentalModel = {
      ...input,
      model_id: uuid(),
      created_at: now,
      last_updated: now,
      update_history: [
        {
          timestamp: now,
          change_summary: "Model created",
          delta_confidence: input.confidence,
          evidence_ids: input.evidence_ids,
        },
      ],
    };

    await this._set(model.model_id, model);
    return model;
  }

  /**
   * Update a mental model with full audit trail
   * 
   * This preserves created_at and appends to update_history.
   */
  async update(
    id: string,
    input: UpdateMentalModelInput
  ): Promise<MentalModel | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;

    const now = nowISO();
    const previousConfidence = existing.confidence;
    const newConfidence = input.updates.confidence ?? previousConfidence;

    const historyEntry: UpdateHistoryEntry = {
      timestamp: now,
      change_summary: input.change_summary,
      delta_confidence: newConfidence - previousConfidence,
      evidence_ids: input.evidence_ids,
    };

    const updated: MentalModel = {
      ...existing,
      ...input.updates,
      // Immutable fields preserved
      model_id: existing.model_id,
      created_at: existing.created_at,
      // Updated metadata
      last_updated: now,
      update_history: [...existing.update_history, historyEntry],
      // Merge evidence IDs (don't lose existing evidence)
      evidence_ids: [
        ...new Set([...existing.evidence_ids, ...input.evidence_ids]),
      ],
    };

    await this._set(id, updated);
    return updated;
  }

  /**
   * Reinforce a model (increase confidence based on supporting evidence)
   */
  async reinforce(
    id: string,
    evidence_ids: string[],
    confidenceBoost: number = 0.05
  ): Promise<MentalModel | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;

    const newConfidence = Math.min(1, existing.confidence + confidenceBoost);

    return this.update(id, {
      change_summary: `Model reinforced by ${evidence_ids.length} observation(s)`,
      evidence_ids,
      updates: {
        confidence: newConfidence,
      },
    });
  }

  /**
   * Challenge a model (decrease confidence based on contradicting evidence)
   */
  async challenge(
    id: string,
    evidence_ids: string[],
    confidencePenalty: number = 0.1
  ): Promise<MentalModel | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;

    const newConfidence = Math.max(0, existing.confidence - confidencePenalty);

    return this.update(id, {
      change_summary: `Model challenged by ${evidence_ids.length} observation(s)`,
      evidence_ids,
      updates: {
        confidence: newConfidence,
      },
    });
  }

  /**
   * Deprecate a model (soft retirement)
   */
  async deprecate(
    id: string,
    reason: string,
    evidence_ids: string[] = []
  ): Promise<MentalModel | undefined> {
    return this.update(id, {
      change_summary: `Model deprecated: ${reason}`,
      evidence_ids,
      updates: {
        status: "deprecated",
      },
    });
  }

  /**
   * Find models by domain
   */
  async findByDomain(domain: MentalModel["domain"]): Promise<MentalModel[]> {
    return this.list((model) => model.domain === domain);
  }

  /**
   * Find models by status
   */
  async findByStatus(status: MentalModel["status"]): Promise<MentalModel[]> {
    return this.list((model) => model.status === status);
  }

  /**
   * Find active models (convenience method)
   */
  async findActive(): Promise<MentalModel[]> {
    return this.findByStatus("active");
  }

  /**
   * Find models by tag
   */
  async findByTag(tag: string): Promise<MentalModel[]> {
    return this.list((model) => model.tags.includes(tag));
  }

  /**
   * Find models with confidence above threshold
   */
  async findHighConfidence(threshold: number = 0.7): Promise<MentalModel[]> {
    return this.list((model) => model.confidence >= threshold);
  }

  /**
   * Find models that reference specific evidence
   */
  async findByEvidence(evidenceId: string): Promise<MentalModel[]> {
    return this.list((model) => model.evidence_ids.includes(evidenceId));
  }

  /**
   * Get the update history for a model
   */
  async getHistory(id: string): Promise<UpdateHistoryEntry[] | undefined> {
    const model = await this.get(id);
    return model?.update_history;
  }
}

// Singleton instance
let instance: MentalModelRepository | null = null;

export function getMentalModelRepository(): MentalModelRepository {
  if (!instance) {
    instance = new MentalModelRepository();
  }
  return instance;
}
