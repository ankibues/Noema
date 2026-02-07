# NOEMA — Data Schemas (Source of Truth)

## 1 Observation
```ts
export interface Observation {
  observation_id: string;
  type: "log" | "text" | "screenshot" | "video_frame" | "audio_transcript" | "human" | "test_result";
  summary: string;
  key_points: string[];
  entities: string[];
  confidence: number;      // 0..1
  raw_ref?: string;        // evidence id/path/url
  timestamp: string;       // ISO
  source: {
    sensor: string;        // "text_adapter" etc.
    session_id?: string;
    run_id?: string;
  };
}

## 2 Mental Model

export interface MentalModel {
  model_id: string;
  title: string;
  domain: "software_QA" | "programming" | "research" | "general";
  tags: string[];

  summary: string;
  core_principles: string[];
  assumptions: string[];
  procedures: string[];
  failure_modes: string[];
  diagnostics: string[];
  examples: string[];

  confidence: number;      // 0..1
  status: "active" | "candidate" | "deprecated";

  evidence_ids: string[];
  created_at: string;
  last_updated: string;

  update_history: {
    timestamp: string;
    change_summary: string;
    delta_confidence: number;
    evidence_ids: string[];
  }[];
}

## 3 Experience (Token Prior)

export interface Experience {
  experience_id: string;
  statement: string;       // short general lesson
  scope: string[];         // ["qa","login","email"]
  confidence: number;      // 0..1
  source_runs: string[];
  last_updated: string;
}

## 4 Thought Graph

export interface GraphEdge {
  from_model: string;
  to_model: string;
  relation: "depends_on" | "explains" | "extends" | "contradicts";
  weight: number;          // 0..1
  evidence_ids: string[];
}

## 5 Action and Outcomes

export interface Action {
  action_id: string;
  type: "run_test" | "inspect_logs" | "capture_screenshot" | "ask_human" | "patch_code" | "no_op";
  rationale: string;
  inputs: Record<string, any>;
  expected_outcome: string;
}

export interface ActionOutcome {
  action_id: string;
  success: boolean;
  summary: string;
  artifacts: string[];     // evidence ids
  timestamp: string;
}

## 6 Run Record (for demo visibility)

export interface RunRecord {
  run_id: string;
  task: string;
  observations_used: string[];
  models_touched: string[];
  experiences_touched: string[];
  actions: Action[];
  outcomes: ActionOutcome[];
  reflection_ref?: string;
  started_at: string;
  finished_at: string;
}

## 7 NOEMA Identity (persistent across restarts)

export interface NoemaIdentity {
  id: string;
  created_at: string;       // ISO — when this instance was born
  total_runs: number;
  total_observations: number;
  total_models: number;
  total_experiences: number;
  domains_seen: string[];
}

## 8 Run Metrics (per-run performance data)

export interface RunMetrics {
  run_id: string;
  task_type: string;         // auto-classified: "authentication", "form_testing", etc.
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
  timestamp: string;         // ISO
  duration_ms: number;
}

## 9 Browser Action Types

type BrowserActionType =
  | "navigate_to_url"
  | "click_element"
  | "fill_input"
  | "submit_form"
  | "check_element_visible"
  | "capture_screenshot"
  | "wait_for_network_idle"
  | "no_op";

## 10 Improvement Signal

export interface ImprovementSignal {
  metric: string;
  previous_value: number;
  current_value: number;
  direction: "improved" | "same" | "regressed";
  description: string;
}
