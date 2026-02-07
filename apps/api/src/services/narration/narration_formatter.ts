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

// =============================================================================
// Action Narrations
// =============================================================================

export function narrateActionStarted(action: BrowserAction): string {
  switch (action.type) {
    case "navigate_to_url":
      return `I'm navigating to ${(action.inputs as any).url} to observe the page.`;
    case "click_element":
      return `I'm clicking on element '${(action.inputs as any).selector}'.`;
    case "fill_input":
      return `I'm filling the input '${(action.inputs as any).selector}' with a value.`;
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
