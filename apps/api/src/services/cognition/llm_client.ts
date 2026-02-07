/**
 * LLM Client for Model Updates
 * 
 * Calls the LLM to generate model updates based on observations.
 * Uses the prompt from prompts/model_update.md
 * 
 * This component does NOT:
 * - Make decisions (it generates suggestions)
 * - Persist anything
 * - Execute actions
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ModelUpdatePromptInput,
  ModelUpdatePromptOutput,
  ModelCreateInstruction,
  ModelUpdateInstruction,
} from "./types.js";

export interface LLMClientConfig {
  provider: "gemini" | "openai";
  model?: string;
  apiKey?: string;
}

const DEFAULT_CONFIG: LLMClientConfig = {
  provider: "gemini",
  model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
};

/**
 * Load the model update prompt template
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
    "model_update.md"
  );
  return readFile(promptPath, "utf-8");
}

/**
 * Call the LLM to generate model updates
 */
export async function callModelUpdateLLM(
  input: ModelUpdatePromptInput,
  config: Partial<LLMClientConfig> = {}
): Promise<ModelUpdatePromptOutput> {
  const opts = { ...DEFAULT_CONFIG, ...config };

  // Load prompt template
  const promptTemplate = await loadPromptTemplate();

  // Build the full prompt
  const userMessage = `
${promptTemplate}

---

INPUT:
${JSON.stringify(input, null, 2)}

---

Respond with valid JSON only. No markdown, no explanation.
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
  return parseModelUpdateResponse(response);
}

/**
 * Call Gemini API
 */
async function callGemini(
  prompt: string,
  config: LLMClientConfig
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
        temperature: 0.2,
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
  config: LLMClientConfig
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
          content: "You are a cognitive system that updates mental models based on observations. Output valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
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
function parseModelUpdateResponse(response: string): ModelUpdatePromptOutput {
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
    console.error("[LLMClient] Failed to parse response:", jsonStr);
    throw new Error(`Invalid JSON in LLM response: ${error}`);
  }

  // Validate structure
  const result = parsed as Record<string, unknown>;

  // Ensure required fields exist with defaults
  const output: ModelUpdatePromptOutput = {
    create_models: Array.isArray(result.create_models)
      ? validateCreateModels(result.create_models)
      : [],
    update_models: Array.isArray(result.update_models)
      ? validateUpdateModels(result.update_models)
      : [],
    contradictions: Array.isArray(result.contradictions)
      ? (result.contradictions as ModelUpdatePromptOutput["contradictions"])
      : [],
  };

  return output;
}

/**
 * Validate create model instructions
 */
function validateCreateModels(models: unknown[]): ModelCreateInstruction[] {
  return models.map((m) => {
    const model = m as Record<string, unknown>;
    return {
      title: String(model.title || "Untitled Model"),
      domain: validateDomain(model.domain),
      tags: Array.isArray(model.tags) ? model.tags.map(String) : [],
      summary: String(model.summary || ""),
      core_principles: Array.isArray(model.core_principles)
        ? model.core_principles.map(String)
        : [],
      assumptions: Array.isArray(model.assumptions)
        ? model.assumptions.map(String)
        : [],
      procedures: Array.isArray(model.procedures)
        ? model.procedures.map(String)
        : [],
      failure_modes: Array.isArray(model.failure_modes)
        ? model.failure_modes.map(String)
        : [],
      diagnostics: Array.isArray(model.diagnostics)
        ? model.diagnostics.map(String)
        : [],
      examples: Array.isArray(model.examples)
        ? model.examples.map(String)
        : [],
      confidence: clampConfidence(Number(model.confidence) || 0.5),
      evidence_ids: Array.isArray(model.evidence_ids)
        ? model.evidence_ids.map(String)
        : [],
    };
  });
}

/**
 * Validate update model instructions
 */
function validateUpdateModels(updates: unknown[]): ModelUpdateInstruction[] {
  return updates.map((u) => {
    const update = u as Record<string, unknown>;
    const patch = (update.patch || {}) as Record<string, unknown>;

    return {
      model_id: String(update.model_id || ""),
      patch: {
        summary: patch.summary ? String(patch.summary) : undefined,
        core_principles: Array.isArray(patch.core_principles)
          ? patch.core_principles.map(String)
          : undefined,
        assumptions: Array.isArray(patch.assumptions)
          ? patch.assumptions.map(String)
          : undefined,
        procedures: Array.isArray(patch.procedures)
          ? patch.procedures.map(String)
          : undefined,
        failure_modes: Array.isArray(patch.failure_modes)
          ? patch.failure_modes.map(String)
          : undefined,
        diagnostics: Array.isArray(patch.diagnostics)
          ? patch.diagnostics.map(String)
          : undefined,
        examples: Array.isArray(patch.examples)
          ? patch.examples.map(String)
          : undefined,
      },
      change_summary: String(update.change_summary || "Model updated"),
      delta_confidence: clampDeltaConfidence(Number(update.delta_confidence) || 0),
      evidence_ids: Array.isArray(update.evidence_ids)
        ? update.evidence_ids.map(String)
        : [],
      graph_updates: Array.isArray(update.graph_updates)
        ? (update.graph_updates as ModelUpdateInstruction["graph_updates"])
        : undefined,
    };
  });
}

/**
 * Validate domain value
 */
function validateDomain(domain: unknown): "software_QA" | "programming" | "research" | "general" {
  const valid = ["software_QA", "programming", "research", "general"];
  const d = String(domain);
  return valid.includes(d) ? (d as "software_QA" | "programming" | "research" | "general") : "general";
}

/**
 * Clamp confidence to valid range
 */
function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Clamp delta confidence to allowed range [-0.25, +0.15]
 */
function clampDeltaConfidence(value: number): number {
  return Math.max(-0.25, Math.min(0.15, value));
}
