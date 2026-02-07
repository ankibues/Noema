/**
 * Timeline Builder
 * 
 * Constructs an ordered timeline of events from a run
 * for reflection and reporting.
 */

import {
  getObservationRepository,
  getMentalModelRepository,
  getExperienceRepository,
  getActionRepository,
  getActionOutcomeRepository,
} from "../../storage/index.js";

// =============================================================================
// Timeline Types
// =============================================================================

export type TimelineEntryType =
  | "observation"
  | "action"
  | "outcome"
  | "belief_update"
  | "experience_learned";

export interface TimelineEntry {
  type: TimelineEntryType;
  timestamp: string;
  summary: string;
  details: Record<string, unknown>;
}

export interface RunTimeline {
  run_id: string;
  entries: TimelineEntry[];
  start_time: string;
  end_time: string;
  duration_ms: number;
}

// =============================================================================
// Builder
// =============================================================================

/**
 * Build a timeline for a given run ID by collecting and sorting events.
 */
export async function buildRunTimeline(runId: string): Promise<RunTimeline> {
  const entries: TimelineEntry[] = [];

  // Gather observations
  const observations = await getObservationRepository().list();
  const runObservations = observations.filter(
    (o) => o.source.run_id === runId || o.source.session_id === runId
  );
  for (const obs of runObservations) {
    entries.push({
      type: "observation",
      timestamp: obs.timestamp,
      summary: `Observed: ${obs.summary.substring(0, 80)}`,
      details: {
        observation_id: obs.observation_id,
        type: obs.type,
        confidence: obs.confidence,
        key_points: obs.key_points,
      },
    });
  }

  // Gather actions — filter by time range of this run's observations
  const actions = await getActionRepository().list();
  const outcomes = await getActionOutcomeRepository().list();

  // Determine run time window from observations
  let runStartMs = Infinity;
  let runEndMs = 0;
  for (const obs of runObservations) {
    const t = new Date(obs.timestamp).getTime();
    if (t < runStartMs) runStartMs = t;
    if (t > runEndMs) runEndMs = t;
  }

  // Pad the window slightly (5 minutes after last observation to catch final actions)
  const windowPadMs = 5 * 60 * 1000;
  const runActions = actions.filter((a) => {
    const t = new Date(a.created_at).getTime();
    return t >= runStartMs - 1000 && t <= runEndMs + windowPadMs;
  });

  // Match actions to outcomes
  for (const action of runActions) {
    entries.push({
      type: "action",
      timestamp: action.created_at,
      summary: `Action: ${action.type} — ${action.rationale.substring(0, 60)}`,
      details: {
        action_id: action.action_id,
        type: action.type,
        inputs: action.inputs,
      },
    });

    const matchingOutcome = outcomes.find((o) => o.action_id === action.action_id);
    if (matchingOutcome) {
      entries.push({
        type: "outcome",
        timestamp: matchingOutcome.timestamp,
        summary: `Outcome: ${matchingOutcome.success ? "Success" : "Failure"} — ${matchingOutcome.summary.substring(0, 60)}`,
        details: {
          outcome_id: matchingOutcome.outcome_id,
          action_id: matchingOutcome.action_id,
          success: matchingOutcome.success,
          artifacts: matchingOutcome.artifacts,
        },
      });
    }
  }

  // Gather mental model updates (check update_history for entries during this run)
  const models = await getMentalModelRepository().list();
  for (const model of models) {
    for (const entry of model.update_history) {
      // Check if any evidence_id matches run observations
      const isRelated = runObservations.some((obs) =>
        entry.evidence_ids.includes(obs.observation_id)
      );
      if (isRelated) {
        entries.push({
          type: "belief_update",
          timestamp: entry.timestamp,
          summary: `Belief updated: "${model.title}" — ${entry.change_summary}`,
          details: {
            model_id: model.model_id,
            title: model.title,
            delta_confidence: entry.delta_confidence,
            confidence: model.confidence,
          },
        });
      }
    }
  }

  // Gather experiences (check source_runs)
  const experiences = await getExperienceRepository().list();
  for (const exp of experiences) {
    if (exp.source_runs.includes(runId)) {
      entries.push({
        type: "experience_learned",
        timestamp: exp.created_at,
        summary: `Learned: "${exp.statement}"`,
        details: {
          experience_id: exp.experience_id,
          confidence: exp.confidence,
          scope: exp.scope,
        },
      });
    }
  }

  // Sort by timestamp
  entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const startTime = entries.length > 0 ? entries[0].timestamp : new Date().toISOString();
  const endTime = entries.length > 0 ? entries[entries.length - 1].timestamp : startTime;
  const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();

  return {
    run_id: runId,
    entries,
    start_time: startTime,
    end_time: endTime,
    duration_ms: durationMs,
  };
}
