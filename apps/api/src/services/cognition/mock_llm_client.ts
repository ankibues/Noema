/**
 * Mock LLM Client for Testing
 * 
 * Provides deterministic responses for testing the Model Update Engine
 * without making actual LLM calls.
 */

import type {
  ModelUpdatePromptInput,
  ModelUpdatePromptOutput,
} from "./types.js";

/**
 * Mock LLM call that generates deterministic model updates
 */
export async function callMockModelUpdateLLM(
  input: ModelUpdatePromptInput
): Promise<ModelUpdatePromptOutput> {
  const observation = input.observation;
  const hasExistingModels = input.candidate_models.length > 0;

  // Analyze observation content
  const isError = observation.summary.toLowerCase().includes("error") ||
    observation.summary.toLowerCase().includes("fail") ||
    observation.summary.toLowerCase().includes("timeout");
  
  const isHealthy = observation.summary.toLowerCase().includes("ok") ||
    observation.summary.toLowerCase().includes("healthy") ||
    observation.summary.toLowerCase().includes("success");

  // If we have existing models, update them
  if (hasExistingModels) {
    const bestCandidate = input.candidate_models[0];
    
    // Determine delta confidence based on content
    let deltaConfidence = 0.05; // Default small increase
    let changeSummary = "Reinforced by new evidence";
    
    if (isError && !bestCandidate.summary.toLowerCase().includes("error")) {
      // Error observation contradicts healthy model
      deltaConfidence = -0.15;
      changeSummary = "Contradicted by error observation";
    } else if (isHealthy && bestCandidate.summary.toLowerCase().includes("error")) {
      // Healthy observation contradicts error model
      deltaConfidence = -0.10;
      changeSummary = "Contradicted by healthy observation";
    } else if (isError && bestCandidate.summary.toLowerCase().includes("error")) {
      // Error reinforces error model
      deltaConfidence = 0.10;
      changeSummary = "Reinforced by similar error pattern";
    } else if (isHealthy && bestCandidate.summary.toLowerCase().includes("healthy")) {
      // Healthy reinforces healthy model
      deltaConfidence = 0.08;
      changeSummary = "Reinforced by healthy status";
    }

    return {
      create_models: [],
      update_models: [
        {
          model_id: bestCandidate.model_id,
          patch: {
            examples: [observation.summary],
          },
          change_summary: changeSummary,
          delta_confidence: deltaConfidence,
          evidence_ids: [observation.observation_id],
        },
      ],
      contradictions: isError && isHealthy ? [
        {
          model_id: bestCandidate.model_id,
          conflict: "Observation contains both error and healthy indicators",
          suggested_resolution: "Investigate system state more thoroughly",
        },
      ] : [],
    };
  }

  // No existing models - create a new one
  const domain = observation.type === "log" ? "software_QA" : "general";
  const title = isError
    ? "Database Connection Issues"
    : isHealthy
    ? "Database Health Status"
    : `Understanding: ${observation.summary.substring(0, 30)}`;

  return {
    create_models: [
      {
        title,
        domain,
        tags: extractTags(observation),
        summary: observation.summary,
        core_principles: observation.key_points.slice(0, 3),
        assumptions: [
          isError
            ? "System may have intermittent connectivity issues"
            : "System is generally stable",
        ],
        procedures: [
          isError
            ? "Monitor connection pool utilization"
            : "Continue regular health checks",
        ],
        failure_modes: isError
          ? ["Connection timeout", "Pool exhaustion"]
          : [],
        diagnostics: [
          isError
            ? "Check database logs for timeout patterns"
            : "Verify connection metrics",
        ],
        examples: [observation.summary],
        confidence: isError ? 0.55 : 0.45,
        evidence_ids: [observation.observation_id],
      },
    ],
    update_models: [],
    contradictions: [],
  };
}

/**
 * Extract tags from observation
 */
function extractTags(observation: ModelUpdatePromptInput["observation"]): string[] {
  const tags: string[] = [];
  const text = observation.summary.toLowerCase();

  if (text.includes("database")) tags.push("database");
  if (text.includes("connection")) tags.push("connection");
  if (text.includes("timeout")) tags.push("timeout");
  if (text.includes("error")) tags.push("error");
  if (text.includes("health")) tags.push("health");
  if (text.includes("pool")) tags.push("connection-pool");

  return tags.length > 0 ? tags : ["general"];
}
