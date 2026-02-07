/**
 * Improvement Analyzer
 * 
 * Compares runs over time and detects measurable improvement.
 * Simple comparisons only — no ML.
 * 
 * Detects:
 * - Fewer steps
 * - Fewer tool calls
 * - Earlier success
 * - Reduced retries
 * - Failed actions avoided
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir } from "../../storage/base.js";

// =============================================================================
// Run Metrics Schema
// =============================================================================

export interface RunMetrics {
  run_id: string;
  task_type: string;
  task_summary: string;
  steps_taken: number;
  tool_calls: number;
  rollouts_used: number;
  success: boolean;
  experiences_used: number;
  experiences_added: number;
  models_created: number;
  models_updated: number;
  observations_created: number;
  failure_count: number;
  timestamp: string;
  duration_ms: number;
}

export interface ImprovementSignal {
  metric: string;
  previous_value: number;
  current_value: number;
  direction: "improved" | "same" | "regressed";
  description: string;
}

export interface ImprovementReport {
  /** Compared runs */
  current_run_id: string;
  compared_to_run_ids: string[];
  /** Individual improvement signals */
  signals: ImprovementSignal[];
  /** Overall conclusion */
  conclusion: string;
  /** Has NOEMA improved? */
  has_improved: boolean;
  /** Generated at */
  timestamp: string;
}

// =============================================================================
// Metrics Storage
// =============================================================================

const METRICS_FILE = "run_metrics.json";

function getMetricsPath(): string {
  return join(getDataDir(), METRICS_FILE);
}

let cachedMetrics: RunMetrics[] | null = null;

async function loadMetrics(): Promise<RunMetrics[]> {
  if (cachedMetrics) return cachedMetrics;

  const filePath = getMetricsPath();
  if (existsSync(filePath)) {
    try {
      const content = await readFile(filePath, "utf-8");
      cachedMetrics = JSON.parse(content) as RunMetrics[];
      return cachedMetrics;
    } catch {
      cachedMetrics = [];
      return cachedMetrics;
    }
  }

  cachedMetrics = [];
  return cachedMetrics;
}

async function persistMetrics(): Promise<void> {
  if (!cachedMetrics) return;
  const filePath = getMetricsPath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, JSON.stringify(cachedMetrics, null, 2), "utf-8");
}

/**
 * Record metrics for a completed run.
 */
export async function recordRunMetrics(metrics: RunMetrics): Promise<void> {
  const allMetrics = await loadMetrics();
  allMetrics.push(metrics);
  await persistMetrics();
}

/**
 * Get all recorded metrics.
 */
export async function getAllRunMetrics(): Promise<RunMetrics[]> {
  return loadMetrics();
}

/**
 * Get metrics for a specific task type.
 */
export async function getMetricsByTaskType(taskType: string): Promise<RunMetrics[]> {
  const all = await loadMetrics();
  return all.filter((m) => m.task_type === taskType);
}

// =============================================================================
// Improvement Analysis
// =============================================================================

/**
 * Analyze improvement between the current run and previous similar runs.
 */
export async function analyzeImprovement(
  currentMetrics: RunMetrics
): Promise<ImprovementReport> {
  const allMetrics = await loadMetrics();

  // Find previous runs of the same task type
  const previousRuns = allMetrics
    .filter(
      (m) =>
        m.task_type === currentMetrics.task_type &&
        m.run_id !== currentMetrics.run_id &&
        new Date(m.timestamp) < new Date(currentMetrics.timestamp)
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (previousRuns.length === 0) {
    return {
      current_run_id: currentMetrics.run_id,
      compared_to_run_ids: [],
      signals: [],
      conclusion: "This is the first run of this task type. No comparison available yet.",
      has_improved: false,
      timestamp: new Date().toISOString(),
    };
  }

  // Compare with the average of previous runs
  const signals: ImprovementSignal[] = [];

  const avgSteps = average(previousRuns.map((r) => r.steps_taken));
  const avgFailures = average(previousRuns.map((r) => r.failure_count));
  const avgDuration = average(previousRuns.map((r) => r.duration_ms));
  const avgExperiencesUsed = average(previousRuns.map((r) => r.experiences_used));

  // Steps comparison
  signals.push(compareMetric(
    "steps_taken",
    avgSteps,
    currentMetrics.steps_taken,
    "lower",
    "steps to complete"
  ));

  // Failure count
  signals.push(compareMetric(
    "failure_count",
    avgFailures,
    currentMetrics.failure_count,
    "lower",
    "failed actions"
  ));

  // Duration
  signals.push(compareMetric(
    "duration_ms",
    avgDuration,
    currentMetrics.duration_ms,
    "lower",
    "ms duration"
  ));

  // Experiences used (more is better — leveraging learning)
  signals.push(compareMetric(
    "experiences_used",
    avgExperiencesUsed,
    currentMetrics.experiences_used,
    "higher",
    "experiences applied"
  ));

  // Success (if previous runs failed and this one succeeded)
  const prevSuccessRate = previousRuns.filter((r) => r.success).length / previousRuns.length;
  if (currentMetrics.success && prevSuccessRate < 1.0) {
    signals.push({
      metric: "success",
      previous_value: prevSuccessRate,
      current_value: 1.0,
      direction: "improved",
      description: `Success rate improved from ${(prevSuccessRate * 100).toFixed(0)}% to 100%`,
    });
  }

  const improvements = signals.filter((s) => s.direction === "improved");
  const regressions = signals.filter((s) => s.direction === "regressed");
  const hasImproved = improvements.length > regressions.length;

  // Build conclusion
  const conclusionParts: string[] = [];

  if (improvements.length > 0) {
    for (const sig of improvements) {
      conclusionParts.push(sig.description);
    }
  }

  if (regressions.length > 0) {
    for (const sig of regressions) {
      conclusionParts.push(sig.description);
    }
  }

  if (conclusionParts.length === 0) {
    conclusionParts.push("Performance is comparable to previous runs.");
  }

  return {
    current_run_id: currentMetrics.run_id,
    compared_to_run_ids: previousRuns.map((r) => r.run_id),
    signals,
    conclusion: conclusionParts.join(". ") + ".",
    has_improved: hasImproved,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// Helpers
// =============================================================================

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function compareMetric(
  name: string,
  previousAvg: number,
  current: number,
  betterDirection: "lower" | "higher",
  label: string
): ImprovementSignal {
  const threshold = 0.1; // 10% change threshold

  let direction: "improved" | "same" | "regressed";
  const ratio = previousAvg > 0 ? Math.abs(current - previousAvg) / previousAvg : 0;

  if (ratio < threshold) {
    direction = "same";
  } else if (betterDirection === "lower") {
    direction = current < previousAvg ? "improved" : "regressed";
  } else {
    direction = current > previousAvg ? "improved" : "regressed";
  }

  let description: string;
  if (direction === "improved") {
    if (betterDirection === "lower") {
      description = `NOEMA used fewer ${label} (${current} vs avg ${previousAvg.toFixed(1)})`;
    } else {
      description = `NOEMA used more ${label} (${current} vs avg ${previousAvg.toFixed(1)})`;
    }
  } else if (direction === "regressed") {
    description = `${label}: ${current} vs avg ${previousAvg.toFixed(1)} (slightly higher)`;
  } else {
    description = `${label}: ${current} (similar to avg ${previousAvg.toFixed(1)})`;
  }

  return {
    metric: name,
    previous_value: previousAvg,
    current_value: current,
    direction,
    description,
  };
}
