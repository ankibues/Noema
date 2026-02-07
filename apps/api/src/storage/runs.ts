/**
 * Run Record Repository
 * 
 * A RunRecord captures a complete cognitive session:
 * - The task being attempted
 * - Observations consumed
 * - Models and experiences touched
 * - Actions taken and their outcomes
 * - Optional reflection reference
 * 
 * RunRecords are essential for:
 * - Demo visibility (showing what NOEMA did)
 * - Experience extraction (comparing multiple runs)
 * - Debugging and auditing
 */

import { v4 as uuid } from "uuid";
import {
  RunRecord,
  RunRecordSchema,
  CreateRunRecordInput,
  Action,
  ActionOutcome,
} from "../schemas/index.js";
import { BaseRepository, getCollectionPath, nowISO } from "./base.js";

export interface UpdateRunRecordInput {
  /** Add observations that were used */
  addObservations?: string[];
  /** Add models that were touched */
  addModels?: string[];
  /** Add experiences that were touched */
  addExperiences?: string[];
  /** Add an action */
  addAction?: Action;
  /** Add an outcome */
  addOutcome?: ActionOutcome;
  /** Set reflection reference */
  reflectionRef?: string;
}

export class RunRecordRepository extends BaseRepository<RunRecord> {
  constructor() {
    super({
      filePath: getCollectionPath("runs"),
      schema: RunRecordSchema,
      idField: "run_id",
    });
  }

  /**
   * Start a new run
   */
  async create(input: CreateRunRecordInput): Promise<RunRecord> {
    const run: RunRecord = {
      ...input,
      run_id: uuid(),
      started_at: nowISO(),
      // finished_at is undefined until complete
    };

    await this._set(run.run_id, run);
    return run;
  }

  /**
   * Update a run (add observations, models, actions, etc.)
   */
  async update(
    id: string,
    input: UpdateRunRecordInput
  ): Promise<RunRecord | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;

    const updated: RunRecord = {
      ...existing,
      observations_used: input.addObservations
        ? [...new Set([...existing.observations_used, ...input.addObservations])]
        : existing.observations_used,
      models_touched: input.addModels
        ? [...new Set([...existing.models_touched, ...input.addModels])]
        : existing.models_touched,
      experiences_touched: input.addExperiences
        ? [...new Set([...existing.experiences_touched, ...input.addExperiences])]
        : existing.experiences_touched,
      actions: input.addAction
        ? [...existing.actions, input.addAction]
        : existing.actions,
      outcomes: input.addOutcome
        ? [...existing.outcomes, input.addOutcome]
        : existing.outcomes,
      reflection_ref: input.reflectionRef ?? existing.reflection_ref,
    };

    await this._set(id, updated);
    return updated;
  }

  /**
   * Complete a run (set finished_at)
   */
  async complete(id: string, reflectionRef?: string): Promise<RunRecord | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;

    const updated: RunRecord = {
      ...existing,
      finished_at: nowISO(),
      reflection_ref: reflectionRef ?? existing.reflection_ref,
    };

    await this._set(id, updated);
    return updated;
  }

  /**
   * Find runs by task (substring match)
   */
  async findByTask(taskSubstring: string): Promise<RunRecord[]> {
    const lower = taskSubstring.toLowerCase();
    return this.list((run) => run.task.toLowerCase().includes(lower));
  }

  /**
   * Find completed runs
   */
  async findCompleted(): Promise<RunRecord[]> {
    return this.list((run) => run.finished_at !== undefined);
  }

  /**
   * Find incomplete runs
   */
  async findIncomplete(): Promise<RunRecord[]> {
    return this.list((run) => run.finished_at === undefined);
  }

  /**
   * Find runs that touched a specific model
   */
  async findByModel(modelId: string): Promise<RunRecord[]> {
    return this.list((run) => run.models_touched.includes(modelId));
  }

  /**
   * Find runs that used a specific observation
   */
  async findByObservation(observationId: string): Promise<RunRecord[]> {
    return this.list((run) => run.observations_used.includes(observationId));
  }

  /**
   * Find runs that touched a specific experience
   */
  async findByExperience(experienceId: string): Promise<RunRecord[]> {
    return this.list((run) => run.experiences_touched.includes(experienceId));
  }

  /**
   * Find runs within a time range
   */
  async findByTimeRange(start: Date, end: Date): Promise<RunRecord[]> {
    const startISO = start.toISOString();
    const endISO = end.toISOString();
    return this.list(
      (run) => run.started_at >= startISO && run.started_at <= endISO
    );
  }

  /**
   * Get run statistics
   */
  async getStats(id: string): Promise<{
    observationCount: number;
    modelCount: number;
    experienceCount: number;
    actionCount: number;
    successRate: number;
    durationMs: number | null;
  } | undefined> {
    const run = await this.get(id);
    if (!run) return undefined;

    const successfulOutcomes = run.outcomes.filter((o) => o.success).length;
    const totalOutcomes = run.outcomes.length;

    let durationMs: number | null = null;
    if (run.finished_at) {
      durationMs =
        new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
    }

    return {
      observationCount: run.observations_used.length,
      modelCount: run.models_touched.length,
      experienceCount: run.experiences_touched.length,
      actionCount: run.actions.length,
      successRate: totalOutcomes > 0 ? successfulOutcomes / totalOutcomes : 0,
      durationMs,
    };
  }

  /**
   * Delete a run
   */
  async delete(id: string): Promise<boolean> {
    return this._delete(id);
  }
}

// Singleton instance
let instance: RunRecordRepository | null = null;

export function getRunRecordRepository(): RunRecordRepository {
  if (!instance) {
    instance = new RunRecordRepository();
  }
  return instance;
}
