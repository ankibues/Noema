/**
 * Action and ActionOutcome Repositories
 * 
 * Actions represent decisions to do something.
 * ActionOutcomes record what actually happened.
 * 
 * These are separate entities because:
 * - An action may have multiple outcomes (retries)
 * - Outcomes may arrive asynchronously
 * - We want to analyze action→outcome patterns
 */

import { v4 as uuid } from "uuid";
import {
  Action,
  ActionSchema,
  CreateActionInput,
  ActionOutcome,
  ActionOutcomeSchema,
  CreateActionOutcomeInput,
  ActionType,
} from "../schemas/index.js";
import { BaseRepository, getCollectionPath, nowISO } from "./base.js";

// =============================================================================
// Action Repository
// =============================================================================

export class ActionRepository extends BaseRepository<Action> {
  constructor() {
    super({
      filePath: getCollectionPath("actions"),
      schema: ActionSchema,
      idField: "action_id",
    });
  }

  /**
   * Create a new action
   */
  async create(input: CreateActionInput): Promise<Action> {
    const action: Action = {
      ...input,
      action_id: uuid(),
      created_at: nowISO(),
    };

    await this._set(action.action_id, action);
    return action;
  }

  /**
   * Find actions by type
   */
  async findByType(type: ActionType): Promise<Action[]> {
    return this.list((action) => action.type === type);
  }

  /**
   * Find actions within a time range
   */
  async findByTimeRange(start: Date, end: Date): Promise<Action[]> {
    const startISO = start.toISOString();
    const endISO = end.toISOString();
    return this.list(
      (action) => action.created_at >= startISO && action.created_at <= endISO
    );
  }

  /**
   * Delete an action
   */
  async delete(id: string): Promise<boolean> {
    return this._delete(id);
  }
}

// =============================================================================
// ActionOutcome Repository
// =============================================================================

export class ActionOutcomeRepository extends BaseRepository<ActionOutcome> {
  constructor() {
    super({
      filePath: getCollectionPath("action_outcomes"),
      schema: ActionOutcomeSchema,
      idField: "outcome_id",
    });
  }

  /**
   * Create a new action outcome
   */
  async create(input: CreateActionOutcomeInput): Promise<ActionOutcome> {
    const outcome: ActionOutcome = {
      ...input,
      outcome_id: uuid(),
      timestamp: nowISO(),
    };

    await this._set(outcome.outcome_id, outcome);
    return outcome;
  }

  /**
   * Find outcomes for a specific action
   */
  async findByAction(actionId: string): Promise<ActionOutcome[]> {
    return this.list((outcome) => outcome.action_id === actionId);
  }

  /**
   * Find successful outcomes
   */
  async findSuccessful(): Promise<ActionOutcome[]> {
    return this.list((outcome) => outcome.success);
  }

  /**
   * Find failed outcomes
   */
  async findFailed(): Promise<ActionOutcome[]> {
    return this.list((outcome) => !outcome.success);
  }

  /**
   * Get the latest outcome for an action
   */
  async getLatestForAction(actionId: string): Promise<ActionOutcome | undefined> {
    const outcomes = await this.findByAction(actionId);
    if (outcomes.length === 0) return undefined;
    
    // Sort by timestamp descending
    outcomes.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return outcomes[0];
  }

  /**
   * Check if an action succeeded (latest outcome)
   */
  async didActionSucceed(actionId: string): Promise<boolean | undefined> {
    const latest = await this.getLatestForAction(actionId);
    return latest?.success;
  }

  /**
   * Delete an outcome
   */
  async delete(id: string): Promise<boolean> {
    return this._delete(id);
  }

  /**
   * Delete all outcomes for an action
   */
  async deleteByAction(actionId: string): Promise<number> {
    const outcomes = await this.findByAction(actionId);
    let deleted = 0;
    for (const outcome of outcomes) {
      if (await this._delete(outcome.outcome_id)) {
        deleted++;
      }
    }
    return deleted;
  }
}

// Singleton instances
let actionInstance: ActionRepository | null = null;
let outcomeInstance: ActionOutcomeRepository | null = null;

export function getActionRepository(): ActionRepository {
  if (!actionInstance) {
    actionInstance = new ActionRepository();
  }
  return actionInstance;
}

export function getActionOutcomeRepository(): ActionOutcomeRepository {
  if (!outcomeInstance) {
    outcomeInstance = new ActionOutcomeRepository();
  }
  return outcomeInstance;
}
