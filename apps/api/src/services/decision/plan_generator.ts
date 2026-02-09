/**
 * Plan Generator
 * 
 * Generates a structured test plan before NOEMA begins acting.
 * Uses Gemini to analyze the task, URL, scenarios, beliefs, and experiences
 * to produce an ordered list of test steps.
 * 
 * This is the "Think before you act" layer.
 * 
 * Falls back to the built-in rule engine when no API key is available.
 * The built-in planner uses keyword analysis to generate QA-grade test cases
 * covering login, product listing, cart, checkout, forms, navigation, and logout.
 * 
 * This component does NOT:
 * - Execute actions
 * - Update beliefs
 * - Make per-step decisions (that's the DecisionEngine's job)
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MentalModel, Experience } from "../../schemas/index.js";
import type { TestPlan, TestPlanStep } from "./types.js";
import { fetchWithRetry, extractJSON } from "../llm_utils.js";

// =============================================================================
// Configuration
// =============================================================================

export interface PlanGeneratorConfig {
  /** Use mock plan (no LLM) */
  mockLLM?: boolean;
  /** LLM provider */
  provider?: "gemini" | "openai";
  /** Model name */
  model?: string;
  /** API key override */
  apiKey?: string;
}

export interface PlanInput {
  /** High-level goal */
  goal: string;
  /** Target URL */
  url: string;
  /** Critical scenarios from the user */
  critical_scenarios: string[];
  /** Current mental models (beliefs) */
  beliefs: MentalModel[];
  /** Past experiences */
  experiences: Experience[];
  /** Whether test credentials are available (never include actual values in plan) */
  hasCredentials?: boolean;
  /** Max total actions budget — plan should fit within this */
  maxTotalActions?: number;
  /** Max actions per step */
  maxCyclesPerStep?: number;
}

// =============================================================================
// Plan Generator
// =============================================================================

/**
 * Generate a test plan from the task input.
 * Uses Gemini LLM in real mode, falls back to mock in test mode.
 */
export async function generateTestPlan(
  input: PlanInput,
  config: PlanGeneratorConfig = {}
): Promise<TestPlan> {
  const mockLLM = config.mockLLM ?? false;

  if (mockLLM) {
    console.log("[PlanGenerator] Using built-in plan generator");
    return generateBuiltInPlan(input);
  }

  try {
    console.log("[PlanGenerator] Generating plan via Gemini...");
    return await generateLLMPlan(input, config);
  } catch (error) {
    console.error("[PlanGenerator] LLM plan generation failed, falling back to built-in planner:", error);
    return generateBuiltInPlan(input);
  }
}

// =============================================================================
// LLM Plan Generation
// =============================================================================

async function generateLLMPlan(
  input: PlanInput,
  config: PlanGeneratorConfig
): Promise<TestPlan> {
  const apiKey = config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("No API key for plan generation");
  }

  const model = config.model || process.env.GEMINI_MODEL || "gemini-3-flash-preview";

  // Load planning prompt template
  const promptTemplate = await loadPlanningPrompt();

  // Build the full prompt
  const prompt = `
${promptTemplate}

---

TASK INPUT:
Goal: ${input.goal}
URL: ${input.url}
Critical Scenarios: ${input.critical_scenarios.length > 0 ? input.critical_scenarios.join(", ") : "None specified — test general functionality"}

EXISTING BELIEFS (${input.beliefs.length} mental models):
${input.beliefs.length > 0
    ? input.beliefs.map((b) => `- "${b.title}" (confidence: ${b.confidence.toFixed(2)}): ${b.summary}`).join("\n")
    : "No prior beliefs about this target."}

PAST EXPERIENCES (${input.experiences.length} learned):
${input.experiences.length > 0
    ? input.experiences.map((e) => `- [${e.confidence.toFixed(2)}] ${e.statement}`).join("\n")
    : "No prior experiences. This is the first run."}

TEST CREDENTIALS: ${input.hasCredentials ? "Available — the system has test username and password loaded from environment. Include login/authentication steps that use these credentials." : "Not configured — skip login steps or note that credentials are needed."}

ACTION BUDGET: ${input.maxTotalActions || 40} total actions available, up to ${input.maxCyclesPerStep || 5} actions per step.
IMPORTANT: Design no more than ${Math.max(3, Math.floor((input.maxTotalActions || 40) / (input.maxCyclesPerStep || 5)))} steps so the plan fits within the budget. Prioritize critical tests.

---

Generate a test plan. Respond with valid JSON only. No markdown, no explanation.
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
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
    throw new Error("No text in Gemini plan response");
  }

  // Use robust JSON extractor
  const parsed = extractJSON(text) as {
    plan_title?: string;
    plan_rationale?: string;
    steps?: Array<{
      step_id?: number;
      title?: string;
      description?: string;
      test_steps?: string[];
      expected_results?: string[];
      action_hint?: string;
      expected_outcome?: string;
      failure_indicator?: string;
      priority?: string;
    }>;
    total_steps?: number;
    estimated_actions?: number;
  };

  // Validate and normalize
  const steps: TestPlanStep[] = (parsed.steps || []).map((s, i) => ({
    step_id: s.step_id || i + 1,
    title: s.title || `Step ${i + 1}`,
    description: s.description || "",
    test_steps: Array.isArray(s.test_steps) ? s.test_steps.map(String) : undefined,
    expected_results: Array.isArray(s.expected_results) ? s.expected_results.map(String) : undefined,
    action_hint: s.action_hint || "no_op",
    expected_outcome: s.expected_outcome || "",
    failure_indicator: s.failure_indicator || "",
    priority: (s.priority as TestPlanStep["priority"]) || "important",
  }));

  console.log(`[PlanGenerator] Generated plan: "${parsed.plan_title}" with ${steps.length} steps`);

  return {
    plan_title: parsed.plan_title || input.goal,
    plan_rationale: parsed.plan_rationale || "Plan generated by Gemini",
    steps,
    total_steps: steps.length,
    estimated_actions: parsed.estimated_actions || steps.length * 2,
    generated_by: "gemini",
    created_at: new Date().toISOString(),
  };
}

// =============================================================================
// Built-In Plan Generation — QA-Grade Test Cases (Rule Engine)
// =============================================================================

function generateBuiltInPlan(input: PlanInput): TestPlan {
  const steps: TestPlanStep[] = [];
  let stepId = 0;

  const goalLower = input.goal.toLowerCase();
  const scenariosLower = input.critical_scenarios.map((s) => s.toLowerCase());
  const allText = [goalLower, ...scenariosLower].join(" ");

  // Detect task categories from goal + scenarios
  const hasLogin = allText.includes("login") || allText.includes("auth") || allText.includes("credential") || allText.includes("sign in");
  const hasCart = allText.includes("cart") || allText.includes("add to") || allText.includes("shopping");
  const hasCheckout = allText.includes("checkout") || allText.includes("purchase") || allText.includes("buy") || allText.includes("order");
  const hasProduct = allText.includes("product") || allText.includes("catalog") || allText.includes("item") || allText.includes("listing");
  const hasForm = allText.includes("form") || allText.includes("input") || allText.includes("submit") || allText.includes("registration");
  const hasNav = allText.includes("nav") || allText.includes("menu") || allText.includes("link") || allText.includes("page");
  const hasLogout = allText.includes("logout") || allText.includes("sign out");

  // ─── Step 1: Navigate and verify page loads ────────────────────────
  steps.push({
    step_id: ++stepId,
    title: "Navigate to application and verify page loads",
    description: `Navigate to ${input.url} and verify the page loads without errors. Capture initial page state.`,
    test_steps: [
      `Navigate to ${input.url}`,
      "Wait for the page to fully load",
      "Capture a screenshot of the initial state",
      "Verify no error messages or blank pages",
    ],
    expected_results: [
      "Page loads successfully (HTTP 200)",
      "Page content is visible (headings, forms, or interactive elements)",
      "No JavaScript errors or broken layout",
    ],
    action_hint: "navigate_to_url",
    expected_outcome: "Application loads and displays its initial page",
    failure_indicator: "Page fails to load, shows error, or is blank",
    priority: "critical",
  });

  // ─── Login tests (if applicable) ──────────────────────────────────
  if (hasLogin || input.hasCredentials) {
    // Invalid login
    steps.push({
      step_id: ++stepId,
      title: "Login with invalid credentials",
      description: "Verify the application correctly rejects invalid login attempts and displays appropriate error messages.",
      test_steps: [
        "Locate the login form (username/email and password fields)",
        "Enter an invalid username (e.g., 'invalid_user')",
        "Enter an invalid password (e.g., 'wrong_password')",
        "Click the Login/Sign In button",
      ],
      expected_results: [
        "An error message is displayed (e.g., 'Invalid credentials')",
        "User is NOT logged in",
        "User remains on the login page",
        "Password field is cleared",
      ],
      action_hint: "fill_input",
      expected_outcome: "Login is rejected with a visible error message",
      failure_indicator: "No error shown, user is unexpectedly logged in, or application crashes",
      priority: "critical",
    });

    // Valid login
    if (input.hasCredentials) {
      steps.push({
        step_id: ++stepId,
        title: "Login with valid credentials",
        description: "Verify user can successfully log in with valid test credentials and is redirected to the main application page.",
        test_steps: [
          "Navigate to the login page (if not already there)",
          "Enter the valid test username",
          "Enter the valid test password",
          "Click the Login/Sign In button",
          "Wait for page redirect",
        ],
        expected_results: [
          "User is successfully logged in",
          "User is redirected to the main page (e.g., Products, Dashboard)",
          "Login form is no longer visible",
          "No error messages are displayed",
        ],
        action_hint: "fill_input",
        expected_outcome: "Successful authentication and redirect to main application page",
        failure_indicator: "Login fails, error message shown, or stays on login page",
        priority: "critical",
      });
    }
  }

  // ─── Product / Listing tests ──────────────────────────────────────
  if (hasProduct || hasCart || hasCheckout) {
    steps.push({
      step_id: ++stepId,
      title: "Verify product listing is displayed",
      description: "Ensure the product catalog or main content is visible after successful authentication (or on the public page).",
      test_steps: [
        "Observe the main content area after login or page load",
        "Verify products or items are listed",
        "Check that product details are visible (name, price, image, description)",
        "Capture a screenshot of the product listing",
      ],
      expected_results: [
        "Product list is visible with multiple items",
        "Each product shows name and price at minimum",
        "Add to cart or action buttons are present",
        "No empty states or error messages",
      ],
      action_hint: "check_element_visible",
      expected_outcome: "Product listing page displays items correctly",
      failure_indicator: "No products shown, empty list, or missing product details",
      priority: "critical",
    });
  }

  // ─── Add to Cart tests ─────────────────────────────────────────────
  if (hasCart || hasCheckout) {
    steps.push({
      step_id: ++stepId,
      title: "Add a product to cart",
      description: "Verify user can add a product to the shopping cart and the cart indicator updates.",
      test_steps: [
        "Locate an 'Add to cart' button on any product",
        "Click the Add to cart button",
        "Observe the cart icon or badge",
        "Capture a screenshot showing the updated cart",
      ],
      expected_results: [
        "Cart icon or badge shows updated count (e.g., 1)",
        "Add to cart button changes state (e.g., becomes 'Remove')",
        "No error messages or unexpected behavior",
      ],
      action_hint: "click_element",
      expected_outcome: "Product is added to cart and cart count updates",
      failure_indicator: "Cart count doesn't update, button doesn't change, or error occurs",
      priority: "critical",
    });

    steps.push({
      step_id: ++stepId,
      title: "Verify cart contents",
      description: "Navigate to the cart and verify the added product appears with correct details.",
      test_steps: [
        "Click the cart icon to navigate to the cart page",
        "Verify the added product is listed in the cart",
        "Check product name, quantity, and price",
        "Capture a screenshot of the cart contents",
      ],
      expected_results: [
        "Cart page displays the correct product",
        "Product name matches what was added",
        "Quantity shows 1",
        "Price is displayed correctly",
      ],
      action_hint: "click_element",
      expected_outcome: "Cart shows the correct product with accurate details",
      failure_indicator: "Cart is empty, wrong product shown, or incorrect quantity/price",
      priority: "critical",
    });

    steps.push({
      step_id: ++stepId,
      title: "Remove product from cart",
      description: "Verify user can remove an item from the shopping cart.",
      test_steps: [
        "On the cart page, locate the Remove button for the product",
        "Click the Remove button",
        "Verify the product is removed",
        "Check that the cart badge is cleared",
      ],
      expected_results: [
        "Product is removed from the cart",
        "Cart shows empty state or no items",
        "Cart badge count is cleared or decremented",
      ],
      action_hint: "click_element",
      expected_outcome: "Product is successfully removed from cart",
      failure_indicator: "Product remains in cart, Remove button doesn't work, or error occurs",
      priority: "important",
    });
  }

  // ─── Checkout tests ───────────────────────────────────────────────
  if (hasCheckout) {
    steps.push({
      step_id: ++stepId,
      title: "Proceed to checkout and fill user information",
      description: "Add a product to cart, proceed to checkout, and fill in required shipping/billing information.",
      test_steps: [
        "Ensure at least one product is in the cart (add one if needed)",
        "Navigate to cart and click Checkout",
        "Fill in required fields (First Name, Last Name, Postal/Zip Code)",
        "Click Continue to proceed",
      ],
      expected_results: [
        "Checkout information form is displayed",
        "All fields accept valid input",
        "User proceeds to the checkout overview/summary page",
        "No validation errors for valid input",
      ],
      action_hint: "fill_input",
      expected_outcome: "Checkout form accepts valid data and proceeds to overview",
      failure_indicator: "Form shows validation errors for valid input, or fails to proceed",
      priority: "critical",
    });

    steps.push({
      step_id: ++stepId,
      title: "Checkout with missing information (negative test)",
      description: "Verify that the checkout form shows validation errors when required fields are empty.",
      test_steps: [
        "Start the checkout process",
        "Leave one or more required fields empty",
        "Click Continue",
      ],
      expected_results: [
        "An appropriate error message is displayed",
        "User cannot proceed to the next step",
        "Error message indicates which field is missing",
      ],
      action_hint: "submit_form",
      expected_outcome: "Validation errors displayed for missing required fields",
      failure_indicator: "No validation error, or user proceeds with missing data",
      priority: "important",
    });

    steps.push({
      step_id: ++stepId,
      title: "Verify checkout overview and complete purchase",
      description: "Verify the checkout overview shows correct product and price details, then complete the purchase.",
      test_steps: [
        "Review the checkout overview/summary page",
        "Verify product name, price, subtotal, tax, and total",
        "Click Finish/Complete/Place Order",
        "Verify the confirmation page appears",
      ],
      expected_results: [
        "Checkout overview shows correct product details",
        "Price calculations (subtotal, tax, total) are correct",
        "Confirmation/success page is displayed",
        "Success message is shown (e.g., 'Thank you for your order')",
      ],
      action_hint: "click_element",
      expected_outcome: "Purchase completes successfully with confirmation",
      failure_indicator: "Wrong totals, purchase fails, or no confirmation shown",
      priority: "critical",
    });

    steps.push({
      step_id: ++stepId,
      title: "Post-purchase navigation",
      description: "After completing a purchase, verify the user can return to the main page with an empty cart.",
      test_steps: [
        "On the confirmation page, click 'Back Home' or equivalent",
        "Verify the main product page is displayed",
        "Check that the cart is empty (badge cleared)",
      ],
      expected_results: [
        "User is redirected to the main/products page",
        "Cart badge shows 0 or is cleared",
        "No error messages",
      ],
      action_hint: "click_element",
      expected_outcome: "User returns to products page with empty cart",
      failure_indicator: "Navigation fails, cart still shows items, or error page",
      priority: "important",
    });
  }

  // ─── Form tests (generic) ─────────────────────────────────────────
  if (hasForm && !hasLogin && !hasCheckout) {
    steps.push({
      step_id: ++stepId,
      title: "Fill and submit form with valid data",
      description: "Locate the primary form on the page. Fill in all required fields with valid data and submit.",
      test_steps: [
        "Identify the main form and its required fields",
        "Fill in each field with valid test data",
        "Click the Submit/Save button",
        "Verify the success response",
      ],
      expected_results: [
        "Form accepts all valid inputs",
        "Success message or redirect occurs after submission",
        "No validation errors for valid data",
      ],
      action_hint: "fill_input",
      expected_outcome: "Form submits successfully with valid data",
      failure_indicator: "Validation errors for valid input, or submission fails",
      priority: "critical",
    });

    steps.push({
      step_id: ++stepId,
      title: "Submit form with missing/invalid data (negative test)",
      description: "Attempt to submit the form with empty or invalid fields to verify validation.",
      test_steps: [
        "Leave required fields empty",
        "Click the Submit button",
        "Observe error messages",
      ],
      expected_results: [
        "Appropriate validation errors are displayed",
        "Form is not submitted",
        "Error messages are clear and specific",
      ],
      action_hint: "submit_form",
      expected_outcome: "Validation errors shown for invalid/missing data",
      failure_indicator: "No validation, form submits with bad data, or generic error",
      priority: "important",
    });
  }

  // ─── Navigation tests ─────────────────────────────────────────────
  if (hasNav || (!hasCart && !hasCheckout && !hasForm && !hasLogin)) {
    steps.push({
      step_id: ++stepId,
      title: "Verify page navigation and links",
      description: "Test main navigation elements (menu, links, buttons) to verify they lead to correct destinations.",
      test_steps: [
        "Identify the main navigation elements on the page",
        "Click each major navigation link",
        "Verify the destination page loads correctly",
        "Use browser back to return and test the next link",
      ],
      expected_results: [
        "All navigation links are functional",
        "Destination pages load without errors",
        "No broken links or 404 pages",
      ],
      action_hint: "click_element",
      expected_outcome: "All navigation links lead to valid, loaded pages",
      failure_indicator: "Broken links, 404 errors, or navigation failures",
      priority: "important",
    });
  }

  // ─── Logout test ──────────────────────────────────────────────────
  if (hasLogout || hasLogin || input.hasCredentials) {
    steps.push({
      step_id: ++stepId,
      title: "Logout from application",
      description: "Verify user can successfully log out and is returned to the login page.",
      test_steps: [
        "Open the application menu or user profile dropdown",
        "Click the Logout/Sign Out option",
        "Verify the user is redirected to the login page",
      ],
      expected_results: [
        "User is logged out",
        "Login page is displayed",
        "Protected pages are no longer accessible",
      ],
      action_hint: "click_element",
      expected_outcome: "User is logged out and returned to login page",
      failure_indicator: "Logout fails, user remains logged in, or error occurs",
      priority: "important",
    });
  }

  // ─── Scenario-specific steps (for any critical_scenarios not already covered) ─
  for (const scenario of input.critical_scenarios) {
    const scenarioLower = scenario.toLowerCase();
    // Skip if already covered by the above categories
    if (hasLogin && (scenarioLower.includes("login") || scenarioLower.includes("auth"))) continue;
    if (hasCart && (scenarioLower.includes("cart") || scenarioLower.includes("add"))) continue;
    if (hasCheckout && (scenarioLower.includes("checkout") || scenarioLower.includes("purchase"))) continue;
    if (hasProduct && (scenarioLower.includes("product") || scenarioLower.includes("catalog"))) continue;

    steps.push({
      step_id: ++stepId,
      title: `Test: ${scenario}`,
      description: `Verify the scenario "${scenario}" functions correctly. Interact with relevant elements and validate behavior.`,
      test_steps: [
        `Identify elements related to "${scenario}"`,
        "Interact with the primary element (click, fill, submit)",
        "Observe the response and capture a screenshot",
        "Verify the expected behavior occurs",
      ],
      expected_results: [
        `"${scenario}" works as expected`,
        "No error messages or unexpected behavior",
        "Page state is consistent after interaction",
      ],
      action_hint: "check_element_visible",
      expected_outcome: `Scenario "${scenario}" completes successfully`,
      failure_indicator: `Elements for "${scenario}" not found, interaction fails, or unexpected result`,
      priority: "important",
    });
  }

  // ─── Final verification ───────────────────────────────────────────
  steps.push({
    step_id: ++stepId,
    title: "Final state verification",
    description: "Capture a final screenshot and verify the application is in a clean, error-free state.",
    test_steps: [
      "Capture a full-page screenshot",
      "Check for any visible error messages or broken elements",
      "Verify the page layout is consistent",
    ],
    expected_results: [
      "No error messages visible",
      "Page layout is intact and functional",
      "Application is in a clean state",
    ],
    action_hint: "capture_screenshot",
    expected_outcome: "Application is in a consistent, error-free state",
    failure_indicator: "Error messages visible, layout broken, or unexpected state",
    priority: "important",
  });

  // ─── Budget-aware step trimming ────────────────────────────────────
  // Trim steps to fit within the action budget, keeping critical steps first
  const maxActions = input.maxTotalActions || 40;
  const actionsPerStep = input.maxCyclesPerStep || 5;
  const maxSteps = Math.max(3, Math.floor(maxActions / actionsPerStep));

  if (steps.length > maxSteps) {
    // Sort by priority: critical first, then important, then nice_to_have
    const priorityOrder = { critical: 0, important: 1, nice_to_have: 2 };
    // Keep the first step (navigation) and last step (final verification)
    const first = steps[0];
    const last = steps[steps.length - 1];
    const middle = steps.slice(1, -1);
    middle.sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));
    const trimmedMiddle = middle.slice(0, maxSteps - 2);
    // Re-assign step IDs
    const trimmed = [first, ...trimmedMiddle, last];
    steps.length = 0;
    trimmed.forEach((step, i) => {
      step.step_id = i + 1;
      steps.push(step);
    });
    console.log(`[PlanGenerator] Trimmed plan from ${stepId} to ${steps.length} steps to fit action budget (${maxActions} max actions, ${actionsPerStep}/step)`);
  }

  // Build rationale
  const categories: string[] = [];
  if (hasLogin || input.hasCredentials) categories.push("authentication");
  if (hasProduct) categories.push("product listing");
  if (hasCart) categories.push("cart management");
  if (hasCheckout) categories.push("checkout flow");
  if (hasForm) categories.push("form validation");
  if (hasNav) categories.push("navigation");
  if (hasLogout) categories.push("logout");

  let rationale = `Comprehensive QA test suite covering: ${categories.length > 0 ? categories.join(", ") : "general functionality"}.`;
  rationale += " Includes both happy paths and negative validation.";
  if (input.experiences.length > 0) {
    rationale += ` Informed by ${input.experiences.length} prior experience(s).`;
  }

  return {
    plan_title: `Test Suite: ${input.goal.substring(0, 80)}`,
    plan_rationale: rationale,
    steps,
    total_steps: steps.length,
    estimated_actions: steps.length * 3,
    generated_by: "built_in",
    created_at: new Date().toISOString(),
  };
}

// =============================================================================
// Prompt Loading
// =============================================================================

async function loadPlanningPrompt(): Promise<string> {
  const promptPath = join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "..",
    "..",
    "prompts",
    "planning.md"
  );
  return readFile(promptPath, "utf-8");
}
