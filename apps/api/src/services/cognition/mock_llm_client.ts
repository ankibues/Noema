/**
 * Mock LLM Client for Testing
 * 
 * Provides deterministic responses for testing the Model Update Engine
 * without making actual LLM calls. Generates QA-relevant mental models.
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

  // Analyze observation content for QA-relevant patterns
  const text = observation.summary.toLowerCase();
  const isError = text.includes("error") || text.includes("fail") || text.includes("timeout");
  const isSuccess = text.includes("ok") || text.includes("success") || text.includes("pass");
  const isLogin = text.includes("login") || text.includes("auth") || text.includes("credential");
  const isNavigation = text.includes("navigate") || text.includes("url") || text.includes("page");
  const isForm = text.includes("form") || text.includes("input") || text.includes("submit");
  const isValidation = text.includes("valid") || text.includes("required") || text.includes("field");

  // If we have existing models, update them
  if (hasExistingModels) {
    const bestCandidate = input.candidate_models[0];
    
    let deltaConfidence = 0.05;
    let changeSummary = "Reinforced by new QA observation";
    
    if (isError && !bestCandidate.summary.toLowerCase().includes("error")) {
      deltaConfidence = -0.15;
      changeSummary = "Contradicted: expected success but observed failure";
    } else if (isSuccess && bestCandidate.summary.toLowerCase().includes("error")) {
      deltaConfidence = -0.10;
      changeSummary = "Contradicted: expected failure but observed success";
    } else if (isError) {
      deltaConfidence = 0.10;
      changeSummary = "Reinforced: similar failure pattern observed again";
    } else if (isSuccess) {
      deltaConfidence = 0.08;
      changeSummary = "Reinforced: consistent successful behavior confirmed";
    }

    return {
      create_models: [],
      update_models: [
        {
          model_id: bestCandidate.model_id,
          patch: {
            examples: [truncateSummary(observation.summary)],
          },
          change_summary: changeSummary,
          delta_confidence: deltaConfidence,
          evidence_ids: [observation.observation_id],
        },
      ],
      contradictions: isError && isSuccess ? [
        {
          model_id: bestCandidate.model_id,
          conflict: "Observation contains both error and success indicators",
          suggested_resolution: "Investigate inconsistent application state",
        },
      ] : [],
    };
  }

  // No existing models — create a QA-relevant one
  const { title, summary, principles, assumptions, procedures, failureModes, diagnostics } =
    generateQAModelContent(observation, { isError, isSuccess, isLogin, isNavigation, isForm, isValidation });

  return {
    create_models: [
      {
        title,
        domain: "software_QA",
        tags: extractQATags(observation),
        summary,
        core_principles: principles,
        assumptions,
        procedures,
        failure_modes: failureModes,
        diagnostics,
        examples: [truncateSummary(observation.summary)],
        confidence: isError ? 0.55 : isSuccess ? 0.50 : 0.45,
        evidence_ids: [observation.observation_id],
      },
    ],
    update_models: [],
    contradictions: [],
  };
}

/**
 * Generate QA-relevant model content based on observation patterns
 */
function generateQAModelContent(
  observation: ModelUpdatePromptInput["observation"],
  flags: { isError: boolean; isSuccess: boolean; isLogin: boolean; isNavigation: boolean; isForm: boolean; isValidation: boolean }
) {
  if (flags.isLogin) {
    return {
      title: "Login Form Behavior",
      summary: "Observed login/authentication behavior on the target application.",
      principles: ["Authentication forms require valid credentials", "Login state persists across page navigation"],
      assumptions: ["Standard username/password authentication flow"],
      procedures: ["Enter credentials → Submit → Verify redirect to authenticated page"],
      failureModes: flags.isError ? ["Invalid credentials rejected", "Login timeout"] : [],
      diagnostics: ["Check for error messages after login attempt", "Verify URL change after successful login"],
    };
  }
  if (flags.isForm || flags.isValidation) {
    return {
      title: "Form Validation Rules",
      summary: "Observed form input validation behavior on the target application.",
      principles: ["Required fields must be filled before submission", "Validation errors appear near the affected field"],
      assumptions: ["Client-side validation provides immediate feedback"],
      procedures: ["Fill required fields → Submit → Verify success or error messages"],
      failureModes: flags.isError ? ["Missing required fields", "Invalid input format"] : [],
      diagnostics: ["Check for inline validation messages", "Verify form submission response"],
    };
  }
  if (flags.isNavigation) {
    return {
      title: "Page Navigation Patterns",
      summary: "Observed navigation behavior and page loading patterns.",
      principles: ["Pages load within expected timeframes", "Navigation updates the URL path"],
      assumptions: ["Single-page application with client-side routing"],
      procedures: ["Navigate to URL → Wait for load → Verify page content"],
      failureModes: flags.isError ? ["Page load timeout", "404 not found"] : [],
      diagnostics: ["Check page title matches expected", "Verify key elements are visible after navigation"],
    };
  }
  if (flags.isError) {
    return {
      title: "Error Handling Behavior",
      summary: "Observed error states and error handling in the target application.",
      principles: ["Errors should display user-friendly messages", "Error states should be recoverable"],
      assumptions: ["Application has consistent error handling patterns"],
      procedures: ["Trigger error condition → Verify error message → Attempt recovery"],
      failureModes: ["Unhandled exception", "Silent failure without user feedback"],
      diagnostics: ["Check for error messages in UI", "Verify console for JavaScript errors"],
    };
  }

  // Generic QA observation
  const briefSummary = observation.summary.length > 120
    ? observation.summary.substring(0, 120) + "..."
    : observation.summary;
  return {
    title: `Application Behavior: ${observation.key_points[0]?.substring(0, 40) || "General"}`,
    summary: briefSummary,
    principles: observation.key_points.slice(0, 2),
    assumptions: ["Application behaves consistently across interactions"],
    procedures: ["Observe → Interact → Verify expected outcome"],
    failureModes: [] as string[],
    diagnostics: ["Compare actual vs expected behavior"],
  };
}

/**
 * Truncate a verbose summary (e.g., raw log entries) to a readable length
 */
function truncateSummary(summary: string): string {
  // Remove raw timestamps and log prefixes
  const cleaned = summary
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s*\[?\w*\]?\s*/g, "")
    .replace(/\[Log\]\s*/gi, "")
    .replace(/\[ERROR\]\s*/gi, "Error: ")
    .replace(/\[WARN\]\s*/gi, "Warning: ")
    .replace(/\[INFO\]\s*/gi, "")
    .trim();
  return cleaned.length > 150 ? cleaned.substring(0, 150) + "..." : cleaned;
}

/**
 * Extract QA-relevant tags from observation
 */
function extractQATags(observation: ModelUpdatePromptInput["observation"]): string[] {
  const tags: string[] = [];
  const text = observation.summary.toLowerCase();

  if (text.includes("login") || text.includes("auth")) tags.push("authentication");
  if (text.includes("navigate") || text.includes("url")) tags.push("navigation");
  if (text.includes("form") || text.includes("input")) tags.push("forms");
  if (text.includes("error") || text.includes("fail")) tags.push("error-handling");
  if (text.includes("click") || text.includes("button")) tags.push("interaction");
  if (text.includes("valid")) tags.push("validation");
  if (text.includes("cart") || text.includes("checkout")) tags.push("e-commerce");
  if (text.includes("screenshot") || text.includes("page")) tags.push("visual");

  return tags.length > 0 ? tags : ["qa", "general"];
}
