/**
 * Narration Formatter
 * 
 * Converts internal system events into first-person narration.
 * NOEMA speaks in first person, descriptive, factual.
 * 
 * NO emotions, desires, or claims of consciousness.
 */

import type { BrowserAction, BrowserActionOutcome } from "../decision/action_types.js";
import type { MentalModel, Experience, Observation } from "../../schemas/index.js";
import type { TestPlan, TestPlanStep } from "../decision/types.js";

// =============================================================================
// Action Narrations
// =============================================================================

/**
 * Get the set of credential values from env (for masking in narration).
 * Cached on first call.
 */
let _credentialValues: Set<string> | null = null;
function getCredentialValues(): Set<string> {
  if (_credentialValues === null) {
    _credentialValues = new Set<string>();
    if (process.env.TEST_USERNAME) _credentialValues.add(process.env.TEST_USERNAME);
    if (process.env.TEST_PASSWORD) _credentialValues.add(process.env.TEST_PASSWORD);
    if (process.env.TEST_CREDENTIALS_JSON) {
      try {
        const extras = JSON.parse(process.env.TEST_CREDENTIALS_JSON);
        for (const val of Object.values(extras)) {
          if (typeof val === "string" && val.length > 0) _credentialValues.add(val);
        }
      } catch { /* ignore */ }
    }
  }
  return _credentialValues;
}

/**
 * Mask a value if it matches any known credential.
 * Returns "••••••" if the value is a credential, otherwise returns the value unchanged.
 */
function maskIfCredential(value: string | undefined): string {
  if (!value) return "(empty)";
  const creds = getCredentialValues();
  if (creds.has(value)) return "••••••";
  return value;
}

export function narrateActionStarted(action: BrowserAction): string {
  switch (action.type) {
    case "navigate_to_url":
      return `I'm navigating to ${(action.inputs as any).url} to observe the page.`;
    case "click_element":
      return `I'm clicking on element '${(action.inputs as any).selector}'.`;
    case "fill_input": {
      const selector = (action.inputs as any).selector || "input";
      const value = maskIfCredential((action.inputs as any).value);
      return `I'm filling the input '${selector}' with value "${value}".`;
    }
    case "submit_form":
      return `I'm submitting a form to trigger a response.`;
    case "check_element_visible":
      return `I'm checking if '${(action.inputs as any).selector}' is visible on the page.`;
    case "capture_screenshot":
      return `I'm capturing a screenshot for evidence.`;
    case "wait_for_network_idle":
      return `I'm waiting for the network to stabilize.`;
    case "no_op":
      return `I'm pausing — no clear action to take right now.`;
    default:
      return `I'm performing action: ${action.type}.`;
  }
}

export function narrateActionCompleted(action: BrowserAction, outcome: BrowserActionOutcome): string {
  if (outcome.status === "success") {
    switch (action.type) {
      case "navigate_to_url":
        return `Successfully loaded the page (${outcome.duration_ms}ms).`;
      case "click_element":
        return `Clicked the element successfully.`;
      case "capture_screenshot":
        return `Screenshot captured — ${outcome.artifacts.screenshots.length} image(s) saved.`;
      case "check_element_visible":
        return `Element visibility check completed.`;
      default:
        return `Action completed successfully in ${outcome.duration_ms}ms.`;
    }
  } else {
    return `Action failed: ${outcome.error_message || "unknown error"}. I'll note this for future decisions.`;
  }
}

// =============================================================================
// Observation Narrations
// =============================================================================

export function narrateObservation(observation: Observation): string {
  const summarySnippet = observation.summary.substring(0, 80);
  switch (observation.type) {
    case "log":
      return `I observed log output: "${summarySnippet}..."`;
    case "screenshot":
      return `I observed visual evidence from a screenshot.`;
    case "text":
      return `I received text input: "${summarySnippet}..."`;
    default:
      return `I received a new observation: "${summarySnippet}..."`;
  }
}

// =============================================================================
// Belief Narrations
// =============================================================================

export function narrateBeliefFormed(model: MentalModel, isNew: boolean): string {
  if (isNew) {
    return `I formed a new belief: "${model.title}" (confidence: ${model.confidence.toFixed(2)}).`;
  } else {
    return `I updated my belief about "${model.title}" (confidence now: ${model.confidence.toFixed(2)}).`;
  }
}

export function narrateConfidenceChange(
  model: MentalModel,
  oldConfidence: number,
  newConfidence: number
): string {
  const direction = newConfidence > oldConfidence ? "increased" : "decreased";
  return `My confidence in "${model.title}" ${direction} from ${oldConfidence.toFixed(2)} to ${newConfidence.toFixed(2)}.`;
}

// =============================================================================
// Experience Narrations
// =============================================================================

export function narrateExperienceLearned(experience: Experience): string {
  return `I learned something actionable: "${experience.statement}"`;
}

export function narrateExperienceUsed(experience: Experience): string {
  return `Drawing on prior experience: "${experience.statement}"`;
}

// =============================================================================
// Run Narrations
// =============================================================================

export function narrateRunStarted(task: string): string {
  return `I'm beginning a new task: "${task.substring(0, 100)}"`;
}

export function narrateRunCompleted(
  _task: string,
  actionsCount: number,
  success: boolean
): string {
  if (success) {
    return `Task completed after ${actionsCount} action${actionsCount === 1 ? "" : "s"}.`;
  }
  return `Task ended after ${actionsCount} action${actionsCount === 1 ? "" : "s"}. Some actions did not succeed.`;
}

// =============================================================================
// Plan Narrations
// =============================================================================

export function narratePlanGenerated(plan: TestPlan): string {
  return `I've analyzed the task and created a test plan: "${plan.plan_title}" with ${plan.total_steps} steps. ${plan.plan_rationale}`;
}

export function narratePlanStepStarting(step: TestPlanStep, totalSteps: number): string {
  const substeps = step.test_steps && step.test_steps.length > 0
    ? ` [${step.test_steps.length} test steps: ${step.test_steps.slice(0, 2).join(", ")}${step.test_steps.length > 2 ? "..." : ""}]`
    : "";
  return `Test case ${step.step_id}/${totalSteps}: "${step.title}" — ${step.description.substring(0, 100)}${substeps}`;
}

export function narratePlanStepCompleted(step: TestPlanStep, passed: boolean): string {
  if (passed) {
    return `Step ${step.step_id} "${step.title}" passed. ${step.actual_outcome || step.expected_outcome}`;
  }
  return `Step ${step.step_id} "${step.title}" failed. ${step.actual_outcome || "Did not meet expected outcome."}`;
}

export function narratePlanSummary(plan: TestPlan): string {
  const passed = plan.steps.filter((s) => s.result === "pass").length;
  const failed = plan.steps.filter((s) => s.result === "fail").length;
  const skipped = plan.steps.filter((s) => s.result === "skipped").length;
  return `Plan execution complete: ${passed} passed, ${failed} failed${skipped > 0 ? `, ${skipped} skipped` : ""} out of ${plan.total_steps} planned steps.`;
}

// =============================================================================
// Improvement Narrations
// =============================================================================

export function narrateImprovement(
  currentSteps: number,
  previousSteps: number,
  taskType: string
): string {
  if (currentSteps < previousSteps) {
    return `I completed this ${taskType} task in ${currentSteps} steps, compared to ${previousSteps} previously. My accumulated experience is helping.`;
  }
  return `This ${taskType} task took ${currentSteps} steps.`;
}
