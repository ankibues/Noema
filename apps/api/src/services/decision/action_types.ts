/**
 * Action Types for NOEMA Decision Engine
 * 
 * MVP Browser-Based Actions Only:
 * - navigate_to_url
 * - click_element
 * - fill_input
 * - submit_form
 * - check_element_visible
 * - capture_screenshot
 * - wait_for_network_idle
 * 
 * Each action is:
 * - Deterministic
 * - Single-step
 * - Reversible (no destructive actions)
 */

// =============================================================================
// Browser Action Types
// =============================================================================

export type BrowserActionType =
  | "navigate_to_url"
  | "click_element"
  | "fill_input"
  | "submit_form"
  | "check_element_visible"
  | "capture_screenshot"
  | "wait_for_network_idle"
  | "no_op";

// =============================================================================
// Action Input Types
// =============================================================================

export interface NavigateToUrlInput {
  url: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
}

export interface ClickElementInput {
  selector: string;
  timeout?: number;
}

export interface FillInputInput {
  selector: string;
  value: string;
  clearFirst?: boolean;
}

export interface SubmitFormInput {
  selector: string;
  timeout?: number;
}

export interface CheckElementVisibleInput {
  selector: string;
  timeout?: number;
}

export interface CaptureScreenshotInput {
  fullPage?: boolean;
  selector?: string; // Optional: capture specific element
}

export interface WaitForNetworkIdleInput {
  timeout?: number;
}

export interface NoOpInput {
  reason?: string;
}

export type BrowserActionInput =
  | NavigateToUrlInput
  | ClickElementInput
  | FillInputInput
  | SubmitFormInput
  | CheckElementVisibleInput
  | CaptureScreenshotInput
  | WaitForNetworkIdleInput
  | NoOpInput;

// =============================================================================
// Action Definition
// =============================================================================

export interface BrowserAction {
  action_id: string;
  type: BrowserActionType;
  rationale: string;
  inputs: BrowserActionInput;
  expected_outcome: string;
  created_at: string;
}

// =============================================================================
// Action Outcome
// =============================================================================

export interface ActionArtifacts {
  screenshots: string[];      // File paths
  logs: string[];            // Console logs
  network_errors: string[];  // Network error messages
  dom_snapshot?: string;     // Minimal DOM state
}

export interface BrowserActionOutcome {
  action_id: string;
  status: "success" | "failure";
  error_message?: string;
  artifacts: ActionArtifacts;
  duration_ms: number;
  timestamp: string;
}

// =============================================================================
// Decision Output (from LLM)
// =============================================================================

export interface DecisionOutput {
  action_type: BrowserActionType;
  rationale: string;
  inputs: Record<string, unknown>;
  expected_outcome: string;
}

// =============================================================================
// Action Descriptions (for LLM context)
// =============================================================================

export const ACTION_DESCRIPTIONS: Record<BrowserActionType, string> = {
  navigate_to_url: "Navigate browser to a URL. Inputs: { url: string, waitUntil?: 'load'|'domcontentloaded'|'networkidle' }",
  click_element: "Click an element by CSS selector. Inputs: { selector: string, timeout?: number }",
  fill_input: "Fill an input field with text. Inputs: { selector: string, value: string, clearFirst?: boolean }",
  submit_form: "Submit a form by selector. Inputs: { selector: string, timeout?: number }",
  check_element_visible: "Check if an element is visible. Inputs: { selector: string, timeout?: number }",
  capture_screenshot: "Capture a screenshot. Inputs: { fullPage?: boolean, selector?: string }",
  wait_for_network_idle: "Wait for network to be idle. Inputs: { timeout?: number }",
  no_op: "Do nothing. Inputs: { reason?: string }",
};
