/**
 * Playwright Action Runner
 * 
 * Executes browser actions using Playwright.
 * Each action is atomic and produces observable outcomes.
 * 
 * This component does NOT:
 * - Make decisions
 * - Update beliefs
 * - Retry on failure
 */

import type { Page } from "playwright";
import type {
  BrowserActionType,
  BrowserActionInput,
  NavigateToUrlInput,
  ClickElementInput,
  FillInputInput,
  SubmitFormInput,
  CheckElementVisibleInput,
  CaptureScreenshotInput,
  WaitForNetworkIdleInput,
  NoOpInput,
} from "./action_types.js";
import { BrowserSession } from "./browser_session.js";

export interface ActionRunResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

/**
 * Run a browser action
 */
export async function runAction(
  session: BrowserSession,
  actionType: BrowserActionType,
  inputs: BrowserActionInput
): Promise<ActionRunResult> {
  const page = session.getPage();

  switch (actionType) {
    case "navigate_to_url":
      return runNavigateToUrl(page, inputs as NavigateToUrlInput);
    case "click_element":
      return runClickElement(page, inputs as ClickElementInput);
    case "fill_input":
      return runFillInput(page, inputs as FillInputInput);
    case "submit_form":
      return runSubmitForm(page, inputs as SubmitFormInput);
    case "check_element_visible":
      return runCheckElementVisible(page, inputs as CheckElementVisibleInput);
    case "capture_screenshot":
      return runCaptureScreenshot(session, inputs as CaptureScreenshotInput);
    case "wait_for_network_idle":
      return runWaitForNetworkIdle(page, inputs as WaitForNetworkIdleInput);
    case "no_op":
      return runNoOp(inputs as NoOpInput);
    default:
      return { success: false, error: `Unknown action type: ${actionType}` };
  }
}

// =============================================================================
// Action Implementations
// =============================================================================

async function runNavigateToUrl(
  page: Page,
  inputs: NavigateToUrlInput
): Promise<ActionRunResult> {
  try {
    const waitUntil = inputs.waitUntil || "load";
    console.log(`[PlaywrightRunner] Navigating to: ${inputs.url}`);
    
    await page.goto(inputs.url, { waitUntil });
    
    return {
      success: true,
      data: {
        url: page.url(),
        title: await page.title(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Navigation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function runClickElement(
  page: Page,
  inputs: ClickElementInput
): Promise<ActionRunResult> {
  try {
    const timeout = inputs.timeout || 5000;
    console.log(`[PlaywrightRunner] Clicking: ${inputs.selector}`);
    
    await page.locator(inputs.selector).first().click({ timeout });
    
    return {
      success: true,
      data: { selector: inputs.selector },
    };
  } catch (error) {
    return {
      success: false,
      error: `Click failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function runFillInput(
  page: Page,
  inputs: FillInputInput
): Promise<ActionRunResult> {
  try {
    console.log(`[PlaywrightRunner] Filling: ${inputs.selector}`);
    
    const locator = page.locator(inputs.selector).first();
    
    if (inputs.clearFirst) {
      await locator.clear();
    }
    
    await locator.fill(inputs.value);
    
    return {
      success: true,
      data: {
        selector: inputs.selector,
        valueLength: inputs.value.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Fill failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function runSubmitForm(
  page: Page,
  inputs: SubmitFormInput
): Promise<ActionRunResult> {
  try {
    const timeout = inputs.timeout || 5000;
    console.log(`[PlaywrightRunner] Submitting form: ${inputs.selector}`);
    
    // Find the form and submit
    const form = page.locator(inputs.selector).first();
    
    // Try to find a submit button or press Enter
    const submitButton = form.locator('button[type="submit"], input[type="submit"]').first();
    
    if (await submitButton.count() > 0) {
      await submitButton.click({ timeout });
    } else {
      // Press Enter on the form
      await form.press("Enter");
    }
    
    return {
      success: true,
      data: { selector: inputs.selector },
    };
  } catch (error) {
    return {
      success: false,
      error: `Submit failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function runCheckElementVisible(
  page: Page,
  inputs: CheckElementVisibleInput
): Promise<ActionRunResult> {
  try {
    const timeout = inputs.timeout || 5000;
    console.log(`[PlaywrightRunner] Checking visibility: ${inputs.selector}`);
    
    const locator = page.locator(inputs.selector).first();
    const isVisible = await locator.isVisible({ timeout });
    
    return {
      success: true,
      data: {
        selector: inputs.selector,
        isVisible,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Visibility check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function runCaptureScreenshot(
  session: BrowserSession,
  inputs: CaptureScreenshotInput
): Promise<ActionRunResult> {
  try {
    console.log(`[PlaywrightRunner] Capturing screenshot`);
    
    const filepath = await session.takeScreenshot({
      fullPage: inputs.fullPage,
      selector: inputs.selector,
    });
    
    return {
      success: true,
      data: {
        filepath,
        fullPage: inputs.fullPage || false,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function runWaitForNetworkIdle(
  page: Page,
  inputs: WaitForNetworkIdleInput
): Promise<ActionRunResult> {
  try {
    const timeout = inputs.timeout || 30000;
    console.log(`[PlaywrightRunner] Waiting for network idle`);
    
    await page.waitForLoadState("networkidle", { timeout });
    
    return {
      success: true,
      data: { waited: true },
    };
  } catch (error) {
    return {
      success: false,
      error: `Wait failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function runNoOp(inputs: NoOpInput): Promise<ActionRunResult> {
  console.log(`[PlaywrightRunner] No-op: ${inputs.reason || "No action needed"}`);
  return {
    success: true,
    data: { reason: inputs.reason },
  };
}
