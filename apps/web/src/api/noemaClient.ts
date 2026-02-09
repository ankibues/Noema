/**
 * NOEMA API Client
 * 
 * Communicates with the NOEMA backend API.
 */

const API_BASE = "/api";

// =============================================================================
// Types
// =============================================================================

export interface QATaskInput {
  goal: string;
  url: string;
  critical_scenarios?: string[];
  max_cycles_per_step?: number;
  max_total_actions?: number;
  mock_llm?: boolean;
  visible_browser?: boolean;
  enable_optimization?: boolean;
}

export interface RunState {
  run_id: string;
  status: "pending" | "running" | "completed" | "failed";
  task: QATaskInput;
  started_at: string;
  finished_at?: string;
  current_phase?: string;
  current_step?: number;
  plan?: QAPlan;
  error?: string;
}

export interface NarrationEvent {
  event_id: string;
  seq: number;
  type: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
  run_id?: string;
}

export interface NoemaIdentity {
  id: string;
  created_at: string;
  total_runs: number;
  total_observations: number;
  total_models: number;
  total_experiences: number;
  domains_seen: string[];
  last_active_at: string;
  age: string;
  statement: string;
}

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
  llm_calls_made?: number;
  llm_calls_saved?: number;
  plan_reused?: boolean;
  steps_from_memory?: number;
}

export interface QATestStep {
  step: number;
  action_type: string;
  description: string;
  result: "pass" | "fail";
  duration_ms: number;
  error?: string;
  screenshot?: string;
  timestamp: string;
}

export interface QAPlanStep {
  step_id: number;
  title: string;
  description: string;
  /** Ordered sub-steps within this test case */
  test_steps?: string[];
  /** Specific expected results */
  expected_results?: string[];
  priority: "critical" | "important" | "nice_to_have";
  expected_outcome: string;
  actual_outcome: string;
  result: "pass" | "fail" | "skipped";
  actions_taken: number;
  /** Screenshot URLs for this step (relative API paths) */
  screenshot_urls?: string[];
}

export interface QAPlan {
  plan_title: string;
  plan_rationale: string;
  total_steps: number;
  passed: number;
  failed: number;
  skipped: number;
  generated_by: "gemini" | "built_in";
  steps: QAPlanStep[];
}

export interface QAReport {
  run_id: string;
  test_title: string;
  test_description: string;
  task: string;
  target_url: string;
  result: "pass" | "fail" | "partial";
  summary: string;
  plan: QAPlan;
  test_steps: QATestStep[];
  passed_steps: number;
  failed_steps: number;
  reflection: {
    what_observed: string[];
    what_believed: string[];
    what_tried: string[];
    what_worked_better: string[];
    what_learned: string[];
    improvement_summary: string;
    open_questions: string[];
    next_best_action: string;
  };
  improvement: {
    has_improved: boolean;
    conclusion: string;
    signals: { metric: string; previous_value: number; current_value: number; direction: string; description: string }[];
  };
  identity_statement: string;
  total_events: number;
  actions_taken: number;
  observations_created: number;
  models_affected: number;
  experiences_learned: number;
  duration_ms: number;
  timestamp: string;
  /** URL to the full run video recording */
  video_url?: string;
  /** Persistent memory → LLM savings */
  memory_savings?: {
    llm_calls_made: number;
    llm_calls_saved: number;
    plan_reused: boolean;
    steps_from_memory: number;
    savings_percent: number;
  };
}

// =============================================================================
// API Methods
// =============================================================================

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || "API request failed");
  }
  return json.data as T;
}

export async function getHealth(): Promise<{ status: string }> {
  return fetchApi("/health");
}

export async function getIdentity(): Promise<NoemaIdentity> {
  return fetchApi("/identity");
}

export async function startRun(input: QATaskInput): Promise<{ run_id: string; status: string }> {
  return fetchApi("/qa/run", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getRunState(runId: string): Promise<RunState> {
  return fetchApi(`/run/${runId}/state`);
}

export async function stopRunApi(runId: string): Promise<{ run_id: string; status: string }> {
  return fetchApi(`/run/${runId}/stop`, { method: "POST" });
}

export async function getRunReport(runId: string): Promise<QAReport> {
  return fetchApi(`/run/${runId}/report`);
}

export async function getRunEvents(runId: string): Promise<NarrationEvent[]> {
  return fetchApi(`/run/${runId}/events`);
}

export async function listRuns(): Promise<RunState[]> {
  return fetchApi("/runs");
}

export async function getMetrics(): Promise<RunMetrics[]> {
  return fetchApi("/metrics");
}

export async function getImprovement(): Promise<any> {
  return fetchApi("/improvement");
}

export interface MentalModelSummary {
  model_id: string;
  title: string;
  summary: string;
  confidence: number;
  status: string;
  domain: string;
  evidence_count: number;
  created_at: string;
  updated_at: string;
}

export interface ExperienceSummary {
  experience_id: string;
  statement: string;
  confidence: number;
  source_task: string;
  times_applied: number;
  created_at: string;
}

export async function getModels(): Promise<MentalModelSummary[]> {
  return fetchApi("/models");
}

export async function getExperiences(): Promise<ExperienceSummary[]> {
  return fetchApi("/experiences");
}

/**
 * Trigger background experience optimization for a completed run.
 * This runs GRPO-style rollout learning after the report is already shown.
 */
export async function optimizeRun(runId: string): Promise<{ run_id: string; message: string }> {
  return fetchApi(`/run/${runId}/optimize`, { method: "POST" });
}

/**
 * Subscribe to SSE narration stream for a run.
 */
export function subscribeToRunStream(
  runId: string,
  onEvent: (event: NarrationEvent) => void,
  onError?: (error: Event) => void
): () => void {
  const url = `${API_BASE}/run/${runId}/stream`;
  const source = new EventSource(url);

  source.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as NarrationEvent;
      onEvent(event);
    } catch {
      // Skip malformed events
    }
  };

  source.onerror = (e) => {
    if (onError) onError(e);
  };

  return () => source.close();
}
