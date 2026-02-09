/**
 * Shared LLM Utilities
 * 
 * Provides retry logic with exponential backoff for Gemini API calls
 * and robust JSON extraction from LLM responses.
 * 
 * Used by: decision_llm, plan_generator, experience_extractor, llm_client, vision_client
 */

// =============================================================================
// Retry with Exponential Backoff
// =============================================================================

export interface RetryConfig {
  /** Max number of retries (default: 3) */
  maxRetries?: number;
  /** Base delay in ms (default: 2000) */
  baseDelay?: number;
  /** Maximum delay in ms (default: 60000) */
  maxDelay?: number;
}

const DEFAULT_RETRY: Required<RetryConfig> = {
  maxRetries: 3,
  baseDelay: 2000,
  maxDelay: 60000,
};

/**
 * Fetch with automatic retry on 429 (rate limit) and 503 (overloaded).
 * Respects Retry-After / retryDelay hints from the API.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  config: RetryConfig = {}
): Promise<Response> {
  const opts = { ...DEFAULT_RETRY, ...config };

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const response = await fetch(url, init);

    // Success or non-retryable error → return immediately
    if (response.ok || (response.status !== 429 && response.status !== 503)) {
      return response;
    }

    // Retryable error (429 or 503)
    if (attempt === opts.maxRetries) {
      // Last attempt — return the error response as-is
      return response;
    }

    // Calculate delay
    let delay = Math.min(opts.baseDelay * Math.pow(2, attempt), opts.maxDelay);

    // Try to parse retryDelay from the error response body
    try {
      const cloned = response.clone();
      const errorBody = await cloned.json() as {
        error?: {
          details?: Array<{
            "@type"?: string;
            retryDelay?: string;
          }>;
        };
      };
      const retryInfo = errorBody.error?.details?.find(
        (d) => d["@type"]?.includes("RetryInfo")
      );
      if (retryInfo?.retryDelay) {
        const retrySeconds = parseFloat(retryInfo.retryDelay.replace("s", ""));
        if (!isNaN(retrySeconds) && retrySeconds > 0) {
          delay = Math.min(retrySeconds * 1000 + 1000, opts.maxDelay); // +1s buffer
        }
      }
    } catch {
      // Ignore parse errors, use calculated delay
    }

    // Also check Retry-After header
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
      const retrySeconds = parseInt(retryAfter, 10);
      if (!isNaN(retrySeconds)) {
        delay = Math.min(retrySeconds * 1000 + 1000, opts.maxDelay);
      }
    }

    console.log(
      `[LLM] ${response.status} on attempt ${attempt + 1}/${opts.maxRetries + 1}. ` +
      `Retrying in ${Math.round(delay / 1000)}s...`
    );
    await sleep(delay);
  }

  // Should never reach here, but TypeScript needs it
  throw new Error("Retry loop exhausted");
}

// =============================================================================
// Robust JSON Extraction
// =============================================================================

/**
 * Extract valid JSON from an LLM response that may contain:
 * - Markdown code blocks (```json ... ```)
 * - Thinking/reasoning text before the JSON
 * - Truncated JSON (attempts repair)
 */
export function extractJSON(response: string): unknown {
  let text = response.trim();

  // Step 1: Remove markdown code blocks
  if (text.includes("```json")) {
    const start = text.indexOf("```json") + 7;
    const end = text.lastIndexOf("```");
    if (end > start) {
      text = text.substring(start, end).trim();
    } else {
      text = text.substring(start).trim();
    }
  } else if (text.startsWith("```")) {
    text = text.slice(3);
    if (text.endsWith("```")) {
      text = text.slice(0, -3);
    }
    text = text.trim();
  }

  // Step 2: Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Continue to repair strategies
  }

  // Step 3: Find the first { or [ and extract from there
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  let jsonStart = -1;

  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
    jsonStart = firstBrace;
  } else if (firstBracket >= 0) {
    jsonStart = firstBracket;
  }

  if (jsonStart > 0) {
    const extracted = text.substring(jsonStart);
    try {
      return JSON.parse(extracted);
    } catch {
      // Try to repair truncated JSON
      return repairAndParse(extracted);
    }
  }

  if (jsonStart === 0) {
    // Already starts with { or [, try repair
    return repairAndParse(text);
  }

  throw new Error(`No JSON object found in response: ${text.substring(0, 200)}...`);
}

/**
 * Attempt to repair truncated JSON by closing open structures.
 * Handles common truncation patterns:
 * - Unterminated strings
 * - Missing closing braces/brackets
 */
function repairAndParse(text: string): unknown {
  let repaired = text.trim();

  // If it ends mid-string (unterminated), close the string
  // Count unescaped quotes
  let inString = false;
  let lastQuoteIdx = -1;
  for (let i = 0; i < repaired.length; i++) {
    if (repaired[i] === '"' && (i === 0 || repaired[i - 1] !== "\\")) {
      inString = !inString;
      if (inString) lastQuoteIdx = i;
    }
  }

  if (inString) {
    // We're inside an unterminated string — close it
    repaired += '"';
  }

  // Remove trailing commas before we add closing structures
  repaired = repaired.replace(/,\s*$/, "");

  // Count open/close braces and brackets
  let openBraces = 0;
  let openBrackets = 0;
  inString = false;
  for (let i = 0; i < repaired.length; i++) {
    if (repaired[i] === '"' && (i === 0 || repaired[i - 1] !== "\\")) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (repaired[i] === "{") openBraces++;
    if (repaired[i] === "}") openBraces--;
    if (repaired[i] === "[") openBrackets++;
    if (repaired[i] === "]") openBrackets--;
  }

  // Close any unclosed structures
  for (let i = 0; i < openBrackets; i++) repaired += "]";
  for (let i = 0; i < openBraces; i++) repaired += "}";

  try {
    return JSON.parse(repaired);
  } catch (error) {
    throw new Error(
      `Failed to parse or repair JSON: ${(error as Error).message}\n` +
      `Original (first 300 chars): ${text.substring(0, 300)}`
    );
  }
}

// =============================================================================
// Helpers
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
