/**
 * Reflection Engine
 * 
 * Generates a structured reflection for a completed run.
 * Uses prompts/reflection.md format.
 * 
 * Reflection is READ-ONLY — it does not change state.
 */

import type { RunTimeline } from "./timeline_builder.js";
import type { ImprovementReport } from "./improvement_analyzer.js";
// =============================================================================
// Reflection Schema
// =============================================================================

export interface RunReflection {
  run_id: string;
  /** What NOEMA observed */
  what_observed: string[];
  /** What it believed */
  what_believed: string[];
  /** What it tried */
  what_tried: string[];
  /** What worked better */
  what_worked_better: string[];
  /** What it learned */
  what_learned: string[];
  /** How it improved compared to earlier runs */
  improvement_summary: string;
  /** Open questions remaining */
  open_questions: string[];
  /** Next best action suggestion */
  next_best_action: string;
  /** Generated at */
  timestamp: string;
}

// =============================================================================
// QA Report Schema
// =============================================================================

export interface QAReport {
  /** Run ID */
  run_id: string;
  /** Original task */
  task: string;
  /** Overall result */
  result: "pass" | "fail" | "partial";
  /** Summary of findings */
  summary: string;
  /** Detailed reflection */
  reflection: RunReflection;
  /** Improvement report */
  improvement: ImprovementReport;
  /** Identity context */
  identity_statement: string;
  /** Timeline entries count */
  total_events: number;
  /** Actions taken */
  actions_taken: number;
  /** Observations created */
  observations_created: number;
  /** Models affected */
  models_affected: number;
  /** Experiences learned */
  experiences_learned: number;
  /** Duration */
  duration_ms: number;
  /** Generated at */
  timestamp: string;
}

// =============================================================================
// Reflection Generation (No LLM — deterministic from state)
// =============================================================================

/**
 * Generate a structured reflection from a run timeline and improvement report.
 */
export function generateReflection(
  runId: string,
  timeline: RunTimeline,
  improvement: ImprovementReport
): RunReflection {
  const observations = timeline.entries.filter((e) => e.type === "observation");
  const actions = timeline.entries.filter((e) => e.type === "action");
  const outcomes = timeline.entries.filter((e) => e.type === "outcome");
  const beliefUpdates = timeline.entries.filter((e) => e.type === "belief_update");
  const experiencesLearned = timeline.entries.filter((e) => e.type === "experience_learned");

  // What NOEMA observed
  const whatObserved = observations.map((o) => o.summary);

  // What it believed
  const whatBelieved = beliefUpdates.map((b) => b.summary);

  // What it tried
  const whatTried = actions.map((a) => a.summary);

  // What worked better
  const successfulOutcomes = outcomes.filter((o) => (o.details as any).success === true);
  const failedOutcomes = outcomes.filter((o) => (o.details as any).success === false);
  const whatWorkedBetter: string[] = [];

  if (successfulOutcomes.length > 0) {
    whatWorkedBetter.push(
      `${successfulOutcomes.length} action(s) succeeded out of ${outcomes.length} total`
    );
  }

  if (improvement.signals.some((s) => s.direction === "improved")) {
    for (const signal of improvement.signals.filter((s) => s.direction === "improved")) {
      whatWorkedBetter.push(signal.description);
    }
  }

  // What it learned
  const whatLearned = experiencesLearned.map((e) => e.summary);
  if (whatLearned.length === 0 && failedOutcomes.length > 0) {
    whatLearned.push("Observed failures that may inform future actions.");
  }

  // Improvement summary
  const improvementSummary = improvement.conclusion;

  // Open questions
  const openQuestions: string[] = [];
  if (failedOutcomes.length > 0) {
    openQuestions.push("Why did some actions fail? Could different approaches be tried?");
  }
  if (beliefUpdates.length === 0) {
    openQuestions.push("No beliefs were updated in this run. Was the evidence insufficient?");
  }

  // Next best action
  let nextBestAction = "Continue monitoring and running similar tasks to accumulate more experience.";
  if (failedOutcomes.length > failedOutcomes.length / 2) {
    nextBestAction = "Re-run with different action strategies to find more reliable approaches.";
  }

  return {
    run_id: runId,
    what_observed: whatObserved,
    what_believed: whatBelieved,
    what_tried: whatTried,
    what_worked_better: whatWorkedBetter,
    what_learned: whatLearned,
    improvement_summary: improvementSummary,
    open_questions: openQuestions,
    next_best_action: nextBestAction,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate a full QA report for a run.
 */
export function generateQAReport(
  runId: string,
  task: string,
  timeline: RunTimeline,
  reflection: RunReflection,
  improvement: ImprovementReport,
  identityStatement: string
): QAReport {
  const actions = timeline.entries.filter((e) => e.type === "action");
  const observations = timeline.entries.filter((e) => e.type === "observation");
  const outcomes = timeline.entries.filter((e) => e.type === "outcome");
  const beliefUpdates = timeline.entries.filter((e) => e.type === "belief_update");
  const experiencesLearned = timeline.entries.filter((e) => e.type === "experience_learned");

  const successCount = outcomes.filter((o) => (o.details as any).success === true).length;
  const failureCount = outcomes.filter((o) => (o.details as any).success === false).length;

  let result: "pass" | "fail" | "partial";
  if (failureCount === 0 && successCount > 0) {
    result = "pass";
  } else if (successCount === 0) {
    result = "fail";
  } else {
    result = "partial";
  }

  const summary = [
    `Task: "${task.substring(0, 100)}"`,
    `Result: ${result.toUpperCase()}`,
    `${actions.length} actions taken, ${successCount} succeeded, ${failureCount} failed`,
    `${observations.length} observations generated`,
    `${beliefUpdates.length} belief updates`,
    `${experiencesLearned.length} experiences learned`,
    improvement.has_improved ? "Performance improved compared to previous runs." : "",
  ].filter(Boolean).join(". ");

  return {
    run_id: runId,
    task,
    result,
    summary,
    reflection,
    improvement,
    identity_statement: identityStatement,
    total_events: timeline.entries.length,
    actions_taken: actions.length,
    observations_created: observations.length,
    models_affected: beliefUpdates.length,
    experiences_learned: experiencesLearned.length,
    duration_ms: timeline.duration_ms,
    timestamp: new Date().toISOString(),
  };
}
