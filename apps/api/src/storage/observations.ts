/**
 * Observation Repository
 * 
 * Observations are APPEND-ONLY. They represent sensory input and cannot be
 * modified or hard-deleted. Soft delete is supported via deleted_at timestamp.
 * 
 * Observations are the ONLY entry point for new information into NOEMA.
 */

import { v4 as uuid } from "uuid";
import {
  Observation,
  ObservationSchema,
  CreateObservationInput,
} from "../schemas/index.js";
import { BaseRepository, getCollectionPath, nowISO } from "./base.js";

export class ObservationRepository extends BaseRepository<Observation> {
  constructor() {
    super({
      filePath: getCollectionPath("observations"),
      schema: ObservationSchema,
      idField: "observation_id",
    });
  }

  /**
   * Create a new observation (append-only)
   */
  async create(input: CreateObservationInput): Promise<Observation> {
    const observation: Observation = {
      ...input,
      observation_id: uuid(),
      timestamp: nowISO(),
    };

    await this._set(observation.observation_id, observation);
    return observation;
  }

  /**
   * Get observation by ID (excludes soft-deleted by default)
   */
  async get(id: string, includeSoftDeleted = false): Promise<Observation | undefined> {
    const obs = await super.get(id);
    if (!obs) return undefined;
    if (!includeSoftDeleted && obs.deleted_at) return undefined;
    return obs;
  }

  /**
   * List observations (excludes soft-deleted by default)
   */
  async list(filter?: (item: Observation) => boolean, includeSoftDeleted = false): Promise<Observation[]> {
    const baseFilter = includeSoftDeleted
      ? filter
      : (item: Observation) => !item.deleted_at && (!filter || filter(item));
    
    return super.list(baseFilter);
  }

  /**
   * Soft delete an observation
   * Observations are never hard-deleted to preserve audit trail
   */
  async softDelete(id: string): Promise<Observation | undefined> {
    const existing = await super.get(id);
    if (!existing) return undefined;
    if (existing.deleted_at) return existing; // Already deleted

    const updated: Observation = {
      ...existing,
      deleted_at: nowISO(),
    };

    await this._set(id, updated);
    return updated;
  }

  /**
   * Find observations by type
   */
  async findByType(type: Observation["type"]): Promise<Observation[]> {
    return this.list((obs) => obs.type === type);
  }

  /**
   * Find observations by session
   */
  async findBySession(sessionId: string): Promise<Observation[]> {
    return this.list((obs) => obs.source.session_id === sessionId);
  }

  /**
   * Find observations by run
   */
  async findByRun(runId: string): Promise<Observation[]> {
    return this.list((obs) => obs.source.run_id === runId);
  }

  /**
   * Find observations within a time range
   */
  async findByTimeRange(start: Date, end: Date): Promise<Observation[]> {
    const startISO = start.toISOString();
    const endISO = end.toISOString();
    return this.list((obs) => obs.timestamp >= startISO && obs.timestamp <= endISO);
  }

  /**
   * Find observations containing specific entities
   */
  async findByEntities(entities: string[]): Promise<Observation[]> {
    return this.list((obs) =>
      entities.some((entity) => obs.entities.includes(entity))
    );
  }

  // Override to prevent hard delete
  protected async _delete(_id: string): Promise<boolean> {
    throw new Error(
      "Observations cannot be hard-deleted. Use softDelete() instead."
    );
  }
}

// Singleton instance
let instance: ObservationRepository | null = null;

export function getObservationRepository(): ObservationRepository {
  if (!instance) {
    instance = new ObservationRepository();
  }
  return instance;
}
