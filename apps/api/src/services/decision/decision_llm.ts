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
import { fetchWithRetry, extractJSON } from "../llm_utils.js";

export interface DecisionLLMConfig {
  provider: "gemini" | "openai";
  model?: string;
  apiKey?: string;
}

const DEFAULT_CONFIG: DecisionLLMConfig = {
  provider: "gemini",
  model: process.env.GEMINI_MODEL || "gemini-3-flash-preview",
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

  // Build visual context section if available
  const visualSection = input.visual_context
    ? `\n---\n\nCURRENT PAGE (from Gemini Vision):\n${input.visual_context}\n`
    : "";

  // Build credentials section if available (injected from env, never narrated)
  let credentialsSection = "";
  if (input.credentials) {
    const credParts: string[] = [];
    if (input.credentials.username) credParts.push(`  username: "${input.credentials.username}"`);
    if (input.credentials.password) credParts.push(`  password: "${input.credentials.password}"`);
    if (input.credentials.extras) {
      for (const [key, value] of Object.entries(input.credentials.extras)) {
        credParts.push(`  ${key}: "${value}"`);
      }
    }
    if (credParts.length > 0) {
      credentialsSection = `\n---\n\nTEST CREDENTIALS (use these when filling login/auth forms):\n${credParts.join("\n")}\nIMPORTANT: Use these exact credentials when the task requires filling login forms, authentication fields, or any credential inputs. Match field names like "username", "email", "password", "login" etc.\n`;
    }
  }

  // Build recent actions section (critical for avoiding repetition)
  let recentActionsSection = "";
  if (input.recent_actions && input.recent_actions.length > 0) {
    recentActionsSection = `\n---\n\nRECENT ACTIONS ALREADY PERFORMED (do NOT repeat the same action):\n`;
    for (let i = 0; i < input.recent_actions.length; i++) {
      const a = input.recent_actions[i];
      const parts = [`${i + 1}. ${a.action_type}`];
      if (a.selector) parts.push(`on "${a.selector}"`);
      if (a.value) parts.push(`with value "${a.value}"`);
      parts.push(`→ ${a.status}`);
      if (a.error_message) parts.push(`(${a.error_message})`);
      recentActionsSection += parts.join(" ") + "\n";
    }
    recentActionsSection += "\nIMPORTANT: Review the list above. Choose the NEXT logical step, not a repeat of what was already done.\n";
  }

  // Build the full prompt with browser-specific actions
  const userMessage = `
${promptTemplate}

---

AVAILABLE BROWSER ACTIONS:
${buildAvailableActionsDescription()}
${visualSection}${credentialsSection}${recentActionsSection}
---

INPUT:
${JSON.stringify({ ...input, visual_context: undefined, credentials: undefined, recent_actions: undefined }, null, 2)}

---

Choose ONE action from the available browser actions above.
${input.visual_context ? "Use the CURRENT PAGE description above to inform your decision — it describes what is currently visible in the browser." : ""}
${input.credentials ? "Test credentials are provided above — use them when filling login or authentication forms." : ""}
${input.recent_actions && input.recent_actions.length > 0 ? "CRITICAL: Review RECENT ACTIONS above. Do NOT repeat the same action on the same element. Choose the NEXT step in the sequence." : ""}
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

  const model = config.model || process.env.GEMINI_MODEL || "gemini-3-flash-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetchWithRetry(url, {
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
        maxOutputTokens: 4096,
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

  const response = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
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
      max_tokens: 4096,
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
  // Use robust JSON extractor that handles thinking text, truncation, etc.
  let parsed: unknown;
  try {
    parsed = extractJSON(response);
  } catch (error) {
    console.error("[DecisionLLM] Failed to parse response:", response.substring(0, 500));
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
  
  // Use recent_actions for smarter tracking (avoids the stuck loop bug)
  const recentActions = input.recent_actions || [];
  const hasNavigated = recentActions.some(
    (a) => a.action_type === "navigate_to_url" && a.status === "success"
  ) || input.recent_outcomes.some(
    (o) => o.action_type === "navigate_to_url" && o.status === "success"
  );
  const hasFilledUsername = recentActions.some(
    (a) => a.action_type === "fill_input" && a.selector?.includes("user") && a.status === "success"
  );
  const hasFilledPassword = recentActions.some(
    (a) => a.action_type === "fill_input" && a.selector?.includes("password") && a.status === "success"
  );
  const hasSubmitted = recentActions.some(
    (a) => (a.action_type === "submit_form" || a.action_type === "click_element") && a.status === "success"
  );
  const hasCapturedScreenshot = recentActions.some(
    (a) => a.action_type === "capture_screenshot" && a.status === "success"
  );

  // Check if this is a variation rollout
  const isVariationRollout = task.includes("different approach") || 
    task.includes("alternative strategy") ||
    task.includes("variation");

  if (isVariationRollout) {
    if (task.includes("screenshot") || task.includes("capture") || task.includes("evidence")) {
      return {
        action_type: "capture_screenshot",
        rationale: "Alternative approach: capture screenshot first to understand current state",
        inputs: { fullPage: true },
        expected_outcome: "Screenshot captured for analysis before navigation",
      };
    }
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
    const urlMatch = task.match(/https?:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : "https://example.com";
    return {
      action_type: "navigate_to_url",
      rationale: "Need to navigate to the target URL first",
      inputs: { url, waitUntil: "networkidle" },
      expected_outcome: "Browser navigates to the page and loads content",
    };
  }

  // If we've navigated but haven't captured a screenshot yet, do that
  if (hasNavigated && !hasCapturedScreenshot && recentActions.length < 2) {
    return {
      action_type: "capture_screenshot",
      rationale: "Capture the current page state for analysis",
      inputs: { fullPage: true },
      expected_outcome: "Screenshot captured showing page content",
    };
  }

  // If credentials are available and task involves login/auth, complete the full login sequence
  if (input.credentials && (task.includes("login") || task.includes("auth") || task.includes("credential") || task.includes("fill"))) {
    if (!hasFilledUsername && input.credentials.username) {
      return {
        action_type: "fill_input",
        rationale: "Filling username field with provided test credentials",
        inputs: { selector: "#user-name, input[name='username'], input[type='email'], input[name='email'], #username", value: input.credentials.username, clearFirst: true },
        expected_outcome: "Username field filled with test credentials",
      };
    }

    if (hasFilledUsername && !hasFilledPassword && input.credentials.password) {
      return {
        action_type: "fill_input",
        rationale: "Filling password field with provided test credentials (username already entered)",
        inputs: { selector: "#password, input[type='password'], input[name='password']", value: input.credentials.password, clearFirst: true },
        expected_outcome: "Password field filled with test credentials",
      };
    }

    if (hasFilledUsername && hasFilledPassword && !hasSubmitted) {
      return {
        action_type: "click_element",
        rationale: "Clicking login button after filling both username and password",
        inputs: { selector: "#login-button, button[type='submit'], input[type='submit']" },
        expected_outcome: "Login form submitted, user authenticated",
      };
    }
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
