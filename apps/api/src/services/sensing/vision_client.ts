/**
 * Vision Client
 * 
 * Calls Gemini Vision API to analyze screenshots.
 * Used by the ScreenshotAdapter to replace the OCR stub with real visual understanding.
 * 
 * Uses gemini-3-pro-image-preview (configurable via GEMINI_VISION_MODEL).
 * Falls back to a text stub if no API key is available.
 * 
 * IMPORTANT: Vision analysis is NON-BLOCKING.
 * If the API call fails (429, timeout, etc.), it returns a stub result immediately.
 * This ensures the decision loop is never stalled by vision failures.
 * 
 * This component does NOT:
 * - Make decisions
 * - Update beliefs
 * - Persist anything
 */

import { readFile } from "node:fs/promises";

// =============================================================================
// Configuration
// =============================================================================

export interface VisionConfig {
  /** Vision model to use (default: gemini-3-pro-image-preview) */
  model?: string;
  /** API key override */
  apiKey?: string;
  /** Max tokens for response */
  maxOutputTokens?: number;
  /** Timeout in ms for vision call (default: 15000) */
  timeout?: number;
}

const DEFAULT_VISION_MODEL = "gemini-3-pro-image-preview";
/** Vision calls must complete within this window or fall back to stub */
const DEFAULT_VISION_TIMEOUT = 8_000; // 8 seconds — fast enough for value, not slow enough to block

function getVisionModel(): string {
  return process.env.GEMINI_VISION_MODEL || DEFAULT_VISION_MODEL;
}

function getApiKey(config?: VisionConfig): string | undefined {
  return config?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

/**
 * Check if vision analysis is available (API key present)
 */
export function isVisionAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

// =============================================================================
// Vision Analysis (Non-Blocking)
// =============================================================================

/**
 * Analyze a screenshot using Gemini Vision.
 * Returns a structured text description of the page content.
 * 
 * NON-BLOCKING: This will NEVER stall the run. If the API call fails,
 * times out, or returns an error, it falls back to a stub result immediately.
 * No retries — fail fast and continue.
 */
export async function analyzeScreenshot(
  imageSource: { base64?: string; filePath?: string },
  context?: string,
  config?: VisionConfig
): Promise<VisionAnalysisResult> {
  const apiKey = getApiKey(config);

  if (!apiKey) {
    return stubAnalysis(imageSource, context);
  }

  const timeout = config?.timeout ?? DEFAULT_VISION_TIMEOUT;

  try {
    // Race the vision call against a timeout
    const result = await Promise.race([
      callGeminiVision(imageSource, context, { ...config, apiKey }),
      timeoutPromise<VisionAnalysisResult>(timeout, `Vision call timed out after ${timeout}ms`),
    ]);
    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    // Log concisely — don't dump the whole error
    const shortMsg = errMsg.length > 200 ? errMsg.substring(0, 200) + "..." : errMsg;
    console.warn(`[VisionClient] Vision failed (non-blocking): ${shortMsg}`);
    // Graceful fallback to stub — run continues without vision
    return stubAnalysis(imageSource, context);
  }
}

function timeoutPromise<T>(ms: number, message: string): Promise<T> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
}

/**
 * Analyze a screenshot specifically for decision-making context.
 * Returns a concise description focused on actionable UI elements.
 */
export async function analyzeScreenshotForDecision(
  imageSource: { base64?: string; filePath?: string },
  task: string,
  config?: VisionConfig
): Promise<string> {
  const result = await analyzeScreenshot(
    imageSource,
    `You are helping a QA system decide what to do next on this webpage. The task is: "${task}". ` +
    `Focus on: interactive elements (buttons, links, forms, inputs), their labels and selectors, ` +
    `any error messages or alerts visible, and the overall page state. ` +
    `Be specific about CSS selectors when possible (e.g., "#login-button", ".error-message").`,
    config
  );
  return result.description;
}

// =============================================================================
// Types
// =============================================================================

export interface VisionAnalysisResult {
  /** Full text description of the screenshot */
  description: string;
  /** Whether real vision was used (vs stub) */
  visionUsed: boolean;
  /** Model used for analysis */
  model: string;
  /** Tokens used (if available) */
  tokensUsed?: number;
}

// =============================================================================
// Gemini Vision API Call
// =============================================================================

async function callGeminiVision(
  imageSource: { base64?: string; filePath?: string },
  context?: string,
  config?: VisionConfig & { apiKey: string }
): Promise<VisionAnalysisResult> {
  const model = config?.model || getVisionModel();
  const apiKey = config!.apiKey;
  const maxTokens = config?.maxOutputTokens || 2048;

  // Get image data as base64
  let imageBase64: string;
  if (imageSource.base64) {
    imageBase64 = imageSource.base64.replace(/^data:image\/\w+;base64,/, "");
  } else if (imageSource.filePath) {
    const imageBuffer = await readFile(imageSource.filePath);
    imageBase64 = imageBuffer.toString("base64");
  } else {
    throw new Error("Either base64 or filePath must be provided");
  }

  // Build prompt
  const systemPrompt = context ||
    `Analyze this webpage screenshot. Describe:\n` +
    `1. Page layout and structure\n` +
    `2. All visible text content (headings, labels, messages)\n` +
    `3. Interactive elements (buttons, links, input fields, forms) with their approximate CSS selectors\n` +
    `4. Any error messages, alerts, or notifications\n` +
    `5. Current page state (loaded, loading, error page, etc.)\n\n` +
    `Be factual and specific. Focus on what a QA tester would need to know.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  console.log(`[VisionClient] Calling ${model} for screenshot analysis`);

  // NO retries for vision — fail fast to keep the run moving
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/png",
                data: imageBase64,
              },
            },
            {
              text: systemPrompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: maxTokens,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Vision API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { totalTokenCount?: number };
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("No text in Gemini Vision response");
  }

  console.log(`[VisionClient] Analysis complete (${text.length} chars)`);

  return {
    description: text,
    visionUsed: true,
    model,
    tokensUsed: data.usageMetadata?.totalTokenCount,
  };
}

// =============================================================================
// Stub Fallback
// =============================================================================

function stubAnalysis(
  imageSource: { base64?: string; filePath?: string },
  _context?: string
): VisionAnalysisResult {
  const source = imageSource.base64 ? "base64 image" : `file: ${imageSource.filePath}`;
  const timestamp = new Date().toISOString();

  return {
    description:
      `[Screenshot Analysis - ${timestamp}]\n` +
      `Source: ${source}\n` +
      `Status: Vision API unavailable — using stub analysis\n\n` +
      `[Page Description]\n` +
      `Screenshot captured. Set GEMINI_API_KEY to enable Gemini Vision analysis.\n` +
      `With vision enabled, NOEMA will describe UI elements, text content,\n` +
      `interactive elements, error messages, and page state from screenshots.`,
    visionUsed: false,
    model: "stub",
  };
}
