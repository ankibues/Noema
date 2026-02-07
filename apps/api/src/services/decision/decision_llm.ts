/**
 * Decision LLM Client
 * 
 * Calls the LLM to select the next action based on beliefs.
 * Uses the prompt from prompts/decision.md
 * 
 * This component does NOT:
 * - Execute actions
 * - Update beliefs
 * - Plan multiple steps
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DecisionPromptInput } from "./types.js";
import type { DecisionOutput, BrowserActionType } from "./action_types.js";

export interface DecisionLLMConfig {
  provider: "gemini" | "openai";
  model?: string;
  apiKey?: string;
}

const DEFAULT_CONFIG: DecisionLLMConfig = {
  provider: "gemini",
  model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
};

/**
 * Load the decision prompt template
 */
async function loadPromptTemplate(): Promise<string> {
  const promptPath = join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "..",
    "..",
    "prompts",
    "decision.md"
  );
  return readFile(promptPath, "utf-8");
}

/**
 * Build the available actions description
 */
function buildAvailableActionsDescription(): string {
  const actionDescriptions = {
    navigate_to_url: "Navigate browser to a URL. Inputs: { url: string, waitUntil?: 'load'|'domcontentloaded'|'networkidle' }",
    click_element: "Click an element by CSS selector. Inputs: { selector: string, timeout?: number }",
    fill_input: "Fill an input field with text. Inputs: { selector: string, value: string, clearFirst?: boolean }",
    submit_form: "Submit a form by selector. Inputs: { selector: string, timeout?: number }",
    check_element_visible: "Check if an element is visible. Inputs: { selector: string, timeout?: number }",
    capture_screenshot: "Capture a screenshot. Inputs: { fullPage?: boolean, selector?: string }",
    wait_for_network_idle: "Wait for network to be idle. Inputs: { timeout?: number }",
    no_op: "Do nothing. Inputs: { reason?: string }",
  };

  return Object.entries(actionDescriptions)
    .map(([type, desc]) => `- ${type}: ${desc}`)
    .join("\n");
}

/**
 * Call the LLM to select the next action
 */
export async function callDecisionLLM(
  input: DecisionPromptInput,
  config: Partial<DecisionLLMConfig> = {}
): Promise<DecisionOutput> {
  const opts = { ...DEFAULT_CONFIG, ...config };

  // Load prompt template
  const promptTemplate = await loadPromptTemplate();

  // Build the full prompt with browser-specific actions
  const userMessage = `
${promptTemplate}

---

AVAILABLE BROWSER ACTIONS:
${buildAvailableActionsDescription()}

---

INPUT:
${JSON.stringify(input, null, 2)}

---

Choose ONE action from the available browser actions above.
Respond with valid JSON only. No markdown, no explanation.
Output format:
{
  "action_type": "one of the available actions",
  "rationale": "why this action helps",
  "inputs": { /* action-specific inputs */ },
  "expected_outcome": "what you expect to happen"
}
`;

  // Call the appropriate LLM
  let response: string;

  if (opts.provider === "gemini") {
    response = await callGemini(userMessage, opts);
  } else if (opts.provider === "openai") {
    response = await callOpenAI(userMessage, opts);
  } else {
    throw new Error(`Unknown LLM provider: ${opts.provider}`);
  }

  // Parse and validate response
  return parseDecisionResponse(response);
}

/**
 * Call Gemini API
 */
async function callGemini(
  prompt: string,
  config: DecisionLLMConfig
): Promise<string> {
  const apiKey = config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key not set (GEMINI_API_KEY or GOOGLE_API_KEY)");
  }

  const model = config.model || process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No text in Gemini response");
  }

  return text;
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  prompt: string,
  config: DecisionLLMConfig
): Promise<string> {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API key not set (OPENAI_API_KEY)");
  }

  const model = config.model || "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "You are a decision engine that selects browser actions. Output valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("No text in OpenAI response");
  }

  return text;
}

/**
 * Parse and validate LLM response
 */
function parseDecisionResponse(response: string): DecisionOutput {
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = response.trim();

  // Remove markdown code block if present
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (error) {
    console.error("[DecisionLLM] Failed to parse response:", jsonStr);
    throw new Error(`Invalid JSON in LLM response: ${error}`);
  }

  const result = parsed as Record<string, unknown>;

  // Validate and normalize
  const validActionTypes: BrowserActionType[] = [
    "navigate_to_url",
    "click_element",
    "fill_input",
    "submit_form",
    "check_element_visible",
    "capture_screenshot",
    "wait_for_network_idle",
    "no_op",
  ];

  let actionType = String(result.action_type || "no_op");
  
  // Map legacy action types to browser actions
  const actionTypeMapping: Record<string, BrowserActionType> = {
    "run_test": "no_op",
    "inspect_logs": "capture_screenshot",
    "ask_human": "no_op",
    "patch_code": "no_op",
  };

  if (actionTypeMapping[actionType]) {
    actionType = actionTypeMapping[actionType];
  }

  if (!validActionTypes.includes(actionType as BrowserActionType)) {
    console.warn(`[DecisionLLM] Unknown action type: ${actionType}, defaulting to no_op`);
    actionType = "no_op";
  }

  return {
    action_type: actionType as BrowserActionType,
    rationale: String(result.rationale || "No rationale provided"),
    inputs: (result.inputs as Record<string, unknown>) || {},
    expected_outcome: String(result.expected_outcome || "Unknown"),
  };
}

// =============================================================================
// Mock Decision LLM (for testing)
// =============================================================================

/**
 * Mock LLM that returns deterministic decisions based on input
 */
export async function callMockDecisionLLM(
  input: DecisionPromptInput
): Promise<DecisionOutput> {
  // Simple decision logic based on task and state
  const task = input.task.toLowerCase();
  const hasRecentFailure = input.recent_outcomes.some((o) => o.status === "failure");
  const hasNavigated = input.recent_outcomes.some(
    (o) => o.action_type === "navigate_to_url" && o.status === "success"
  );

  // Check if this is a variation rollout (task contains "different approach" or similar)
  const isVariationRollout = task.includes("different approach") || 
    task.includes("alternative strategy") ||
    task.includes("variation");

  // If variation rollout, try a different action
  if (isVariationRollout) {
    // For variation rollouts, prefer screenshot first
    if (task.includes("screenshot") || task.includes("capture") || task.includes("evidence")) {
      return {
        action_type: "capture_screenshot",
        rationale: "Alternative approach: capture screenshot first to understand current state",
        inputs: { fullPage: true },
        expected_outcome: "Screenshot captured for analysis before navigation",
      };
    }
    
    // Or check element visibility
    if (task.includes("verify") || task.includes("check")) {
      return {
        action_type: "check_element_visible",
        rationale: "Alternative approach: verify page state before proceeding",
        inputs: { selector: "body", timeout: 5000 },
        expected_outcome: "Page state verified",
      };
    }
  }

  // If task mentions a URL and we haven't navigated yet
  if ((task.includes("http") || task.includes("url") || task.includes("website")) && !hasNavigated) {
    // Extract URL from task
    const urlMatch = task.match(/https?:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : "https://example.com";

    return {
      action_type: "navigate_to_url",
      rationale: "Need to navigate to the target URL first",
      inputs: { url, waitUntil: "networkidle" },
      expected_outcome: "Browser navigates to the page and loads content",
    };
  }

  // If we've navigated, capture a screenshot
  if (hasNavigated && !input.recent_outcomes.some((o) => o.action_type === "capture_screenshot")) {
    return {
      action_type: "capture_screenshot",
      rationale: "Capture the current page state for analysis",
      inputs: { fullPage: true },
      expected_outcome: "Screenshot captured showing page content",
    };
  }

  // If there was a recent failure, wait and retry
  if (hasRecentFailure) {
    return {
      action_type: "wait_for_network_idle",
      rationale: "Previous action failed, waiting for page to stabilize",
      inputs: { timeout: 5000 },
      expected_outcome: "Page becomes stable for next action",
    };
  }

  // Check for specific element if task mentions checking
  if (task.includes("check") || task.includes("verify") || task.includes("visible")) {
    return {
      action_type: "check_element_visible",
      rationale: "Verify element presence as requested",
      inputs: { selector: "body", timeout: 5000 },
      expected_outcome: "Element visibility confirmed",
    };
  }

  // Default: no-op
  return {
    action_type: "no_op",
    rationale: "No clear next action based on current state",
    inputs: { reason: "Awaiting further instructions" },
    expected_outcome: "System remains idle",
  };
}
