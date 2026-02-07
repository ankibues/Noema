/**
 * NOEMA Data Schemas
 * Source of truth: docs/DATA_SCHEMAS.md
 * 
 * These schemas define the core data structures for NOEMA's persistent state.
 * All writes are validated against these schemas at runtime.
 */

import { z } from "zod";

// =============================================================================
// 1. Observation
// =============================================================================

export const ObservationTypeSchema = z.enum([
  "log",
  "text",
  "screenshot",
  "video_frame",
  "audio_transcript",
  "human",
  "test_result",
]);

export const ObservationSourceSchema = z.object({
  sensor: z.string(),
  session_id: z.string().optional(),
  run_id: z.string().optional(),
});

export const ObservationSchema = z.object({
  observation_id: z.string().uuid(),
  type: ObservationTypeSchema,
  summary: z.string(),
  key_points: z.array(z.string()),
  entities: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  raw_ref: z.string().optional(),
  timestamp: z.string().datetime(),
  source: ObservationSourceSchema,
  // Soft delete support
  deleted_at: z.string().datetime().optional(),
});

export type ObservationType = z.infer<typeof ObservationTypeSchema>;
export type ObservationSource = z.infer<typeof ObservationSourceSchema>;
export type Observation = z.infer<typeof ObservationSchema>;

// =============================================================================
// 2. Mental Model
// =============================================================================

export const MentalModelDomainSchema = z.enum([
  "software_QA",
  "programming",
  "research",
  "general",
]);

export const MentalModelStatusSchema = z.enum([
  "active",
  "candidate",
  "deprecated",
]);

export const UpdateHistoryEntrySchema = z.object({
  timestamp: z.string().datetime(),
  change_summary: z.string(),
  delta_confidence: z.number(),
  evidence_ids: z.array(z.string()),
});

export const MentalModelSchema = z.object({
  model_id: z.string().uuid(),
  title: z.string(),
  domain: MentalModelDomainSchema,
  tags: z.array(z.string()),

  summary: z.string(),
  core_principles: z.array(z.string()),
  assumptions: z.array(z.string()),
  procedures: z.array(z.string()),
  failure_modes: z.array(z.string()),
  diagnostics: z.array(z.string()),
  examples: z.array(z.string()),

  confidence: z.number().min(0).max(1),
  status: MentalModelStatusSchema,

  evidence_ids: z.array(z.string()),
  created_at: z.string().datetime(),
  last_updated: z.string().datetime(),

  update_history: z.array(UpdateHistoryEntrySchema),
});

export type MentalModelDomain = z.infer<typeof MentalModelDomainSchema>;
export type MentalModelStatus = z.infer<typeof MentalModelStatusSchema>;
export type UpdateHistoryEntry = z.infer<typeof UpdateHistoryEntrySchema>;
export type MentalModel = z.infer<typeof MentalModelSchema>;

// =============================================================================
// 3. Experience (Token Prior)
// =============================================================================

export const ExperienceSchema = z.object({
  experience_id: z.string().uuid(),
  statement: z.string(),
  scope: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  source_runs: z.array(z.string()),
  created_at: z.string().datetime(),
  last_updated: z.string().datetime(),
});

export type Experience = z.infer<typeof ExperienceSchema>;

// =============================================================================
// 4. Thought Graph
// =============================================================================

export const GraphRelationSchema = z.enum([
  "depends_on",
  "explains",
  "extends",
  "contradicts",
]);

export const GraphEdgeSchema = z.object({
  edge_id: z.string().uuid(),
  from_model: z.string().uuid(),
  to_model: z.string().uuid(),
  relation: GraphRelationSchema,
  weight: z.number().min(0).max(1),
  evidence_ids: z.array(z.string()),
  created_at: z.string().datetime(),
  last_updated: z.string().datetime(),
});

export type GraphRelation = z.infer<typeof GraphRelationSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

// =============================================================================
// 5. Action and Outcomes
// =============================================================================

export const ActionTypeSchema = z.enum([
  "run_test",
  "inspect_logs",
  "capture_screenshot",
  "ask_human",
  "patch_code",
  "no_op",
]);

export const ActionSchema = z.object({
  action_id: z.string().uuid(),
  type: ActionTypeSchema,
  rationale: z.string(),
  inputs: z.record(z.any()),
  expected_outcome: z.string(),
  created_at: z.string().datetime(),
});

export const ActionOutcomeSchema = z.object({
  outcome_id: z.string().uuid(),
  action_id: z.string().uuid(),
  success: z.boolean(),
  summary: z.string(),
  artifacts: z.array(z.string()),
  timestamp: z.string().datetime(),
});

export type ActionType = z.infer<typeof ActionTypeSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type ActionOutcome = z.infer<typeof ActionOutcomeSchema>;

// =============================================================================
// 6. Run Record
// =============================================================================

export const RunRecordSchema = z.object({
  run_id: z.string().uuid(),
  task: z.string(),
  observations_used: z.array(z.string()),
  models_touched: z.array(z.string()),
  experiences_touched: z.array(z.string()),
  actions: z.array(ActionSchema),
  outcomes: z.array(ActionOutcomeSchema),
  reflection_ref: z.string().optional(),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime().optional(),
});

export type RunRecord = z.infer<typeof RunRecordSchema>;

// =============================================================================
// Input schemas for creation (without auto-generated fields)
// =============================================================================

export const CreateObservationInputSchema = ObservationSchema.omit({
  observation_id: true,
  timestamp: true,
  deleted_at: true,
});

export const CreateMentalModelInputSchema = MentalModelSchema.omit({
  model_id: true,
  created_at: true,
  last_updated: true,
  update_history: true,
});

export const CreateExperienceInputSchema = ExperienceSchema.omit({
  experience_id: true,
  created_at: true,
  last_updated: true,
});

export const CreateGraphEdgeInputSchema = GraphEdgeSchema.omit({
  edge_id: true,
  created_at: true,
  last_updated: true,
});

export const CreateActionInputSchema = ActionSchema.omit({
  action_id: true,
  created_at: true,
});

export const CreateActionOutcomeInputSchema = ActionOutcomeSchema.omit({
  outcome_id: true,
  timestamp: true,
});

export const CreateRunRecordInputSchema = RunRecordSchema.omit({
  run_id: true,
  started_at: true,
  finished_at: true,
});

export type CreateObservationInput = z.infer<typeof CreateObservationInputSchema>;
export type CreateMentalModelInput = z.infer<typeof CreateMentalModelInputSchema>;
export type CreateExperienceInput = z.infer<typeof CreateExperienceInputSchema>;
export type CreateGraphEdgeInput = z.infer<typeof CreateGraphEdgeInputSchema>;
export type CreateActionInput = z.infer<typeof CreateActionInputSchema>;
export type CreateActionOutcomeInput = z.infer<typeof CreateActionOutcomeInputSchema>;
export type CreateRunRecordInput = z.infer<typeof CreateRunRecordInputSchema>;
