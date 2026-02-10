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

/** Convert a CSS selector into a human-readable element name */
function humanizeSelector(selector: string | undefined): string {
  if (!selector) return "element";
  // Try common patterns: #id, button text, aria-label, input[name], etc.
  // e.g. "#login-button" → "Login Button"
  // e.g. "button:has-text('Login')" → "Login button"
  // e.g. "[data-test='submit']" → "submit element"

  // Playwright text selectors: text=Login, button:has-text("Login")
  const textMatch = selector.match(/(?:has-text|text=)\(?['"]?([^'")\]]+)['"]?\)?/i);
  if (textMatch) return `"${textMatch[1]}" button`;

  // ID selectors: #login-btn → Login Btn
  const idMatch = selector.match(/^#([\w-]+)/);
  if (idMatch) {
    return idMatch[1].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Attribute selectors: [data-test="submit"], [name="username"]
  const attrMatch = selector.match(/\[(?:data-\w+|name|aria-label|placeholder)=['"]([^'"]+)['"]\]/);
  if (attrMatch) return `"${attrMatch[1]}" field`;

  // Tag + class: input.login-field → Login Field input
  const classMatch = selector.match(/(\w+)\.([\w-]+)/);
  if (classMatch) {
    return classMatch[2].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Fallback: if selector is short enough, show it; otherwise just "element"
  return selector.length <= 40 ? `'${selector}'` : "element";
}

export function narrateActionStarted(action: BrowserAction): string {
  const inputs = action.inputs as Record<string, unknown>;
  switch (action.type) {
    case "navigate_to_url":
      return `I'm navigating to ${inputs.url} to observe the page.`;
    case "click_element": {
      const name = humanizeSelector(inputs.selector as string);
      return `I'm clicking on ${name}.`;
    }
    case "fill_input": {
      const name = humanizeSelector(inputs.selector as string);
      const value = maskIfCredential(String(inputs.value || ""));
      return `I'm filling ${name} with "${value}".`;
    }
    case "submit_form":
      return `I'm submitting a form to trigger a response.`;
    case "check_element_visible": {
      const name = humanizeSelector(inputs.selector as string);
      return `I'm checking if ${name} is visible on the page.`;
    }
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
  const inputs = action.inputs as Record<string, unknown>;
  if (outcome.status === "success") {
    switch (action.type) {
      case "navigate_to_url":
        return `Successfully loaded ${inputs.url || "the page"} (${outcome.duration_ms}ms).`;
      case "click_element": {
        const name = humanizeSelector(inputs.selector as string);
        return `Clicked ${name} successfully.`;
      }
      case "fill_input": {
        const name = humanizeSelector(inputs.selector as string);
        return `Filled ${name} successfully.`;
      }
      case "submit_form":
        return `Form submitted successfully (${outcome.duration_ms}ms).`;
      case "capture_screenshot":
        return `Screenshot captured — ${outcome.artifacts.screenshots.length} image(s) saved.`;
      case "check_element_visible": {
        const name = humanizeSelector(inputs.selector as string);
        return `Confirmed ${name} is visible.`;
      }
      case "wait_for_network_idle":
        return `Network stabilized (${outcome.duration_ms}ms).`;
      default:
        return `Action completed successfully in ${outcome.duration_ms}ms.`;
    }
  } else {
    // Include element info in failure messages too
    if (action.type === "click_element" || action.type === "fill_input" || action.type === "check_element_visible") {
      const name = humanizeSelector(inputs.selector as string);
      return `Failed to interact with ${name}: ${outcome.error_message || "unknown error"}. I'll adjust my approach.`;
    }
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
  return `Now testing: ${step.title} (${step.step_id}/${totalSteps}) — ${step.description.substring(0, 120)}`;
}

export function narratePlanStepCompleted(step: TestPlanStep, _passed: boolean): string {
  const actions = step.actions_taken || 0;
  return `Finished "${step.title}" after ${actions} action${actions === 1 ? "" : "s"}.`;
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
