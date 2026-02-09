/**
 * Action Sequence Store
 * 
 * Records successful sequences of browser actions for specific plan step types.
 * When NOEMA encounters a similar step on a future run, it can replay the
 * known sequence directly — WITHOUT calling the decision LLM.
 * 
 * This is the core mechanism for "persistent memory reduces LLM usage":
 * - Run 1: LLM decides each action → sequence recorded
 * - Run 2: Same step type + URL → replay from memory, zero LLM calls
 * 
 * Key Design:
 * - Sequences are keyed by (url_domain, step_type_keywords)
 * - Only sequences that LED TO SUCCESS are stored
 * - Confidence increases with each successful reuse
 * - Confidence decreases if a replayed sequence fails
 * 
 * Persistence: data/action_sequences.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir } from "../../storage/base.js";
import type { BrowserActionType } from "../decision/action_types.js";

// =============================================================================
// Types
// =============================================================================

/** A single action in a recorded sequence */
export interface SequenceAction {
  /** Action type (e.g., "fill_input", "click_element") */
  action_type: BrowserActionType;
  /** CSS selector used */
  selector?: string;
  /** Value used — tokenized for credentials (e.g., "${username}") */
  value_template?: string;
  /** Full inputs object */
  inputs: Record<string, unknown>;
  /** What this action accomplished */
  rationale: string;
}

/** A complete recorded action sequence */
export interface ActionSequence {
  /** Unique ID */
  sequence_id: string;
  /** Normalized URL domain */
  url_domain: string;
  /** Keywords extracted from the step description */
  step_keywords: string[];
  /** The original step title */
  step_title: string;
  /** Ordered list of actions */
  actions: SequenceAction[];
  /** How many times this sequence was executed successfully */
  success_count: number;
  /** How many times it failed when replayed */
  failure_count: number;
  /** Confidence score (0-1), increases with success */
  confidence: number;
  /** Whether this sequence requires credentials */
  requires_credentials: boolean;
  /** Source run that first recorded this */
  source_run_id: string;
  /** When first recorded */
  created_at: string;
  /** When last used */
  last_used_at: string;
}

/** Result of looking up a sequence */
export interface SequenceLookup {
  /** The matched sequence */
  sequence: ActionSequence;
  /** Match score (0-1) */
  score: number;
  /** Why this was matched */
  reason: string;
}

// =============================================================================
// Storage
// =============================================================================

const STORE_FILE = "action_sequences.json";

function getStorePath(): string {
  return join(getDataDir(), STORE_FILE);
}

let store: ActionSequence[] | null = null;

async function loadStore(): Promise<ActionSequence[]> {
  if (store) return store;

  const filePath = getStorePath();
  if (existsSync(filePath)) {
    try {
      const content = await readFile(filePath, "utf-8");
      store = JSON.parse(content) as ActionSequence[];
      return store;
    } catch {
      store = [];
      return store;
    }
  }

  store = [];
  return store;
}

async function persistStore(): Promise<void> {
  if (!store) return;
  const filePath = getStorePath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
}

// =============================================================================
// Keyword Extraction
// =============================================================================

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "during", "before", "after", "and", "but", "if", "or", "because",
  "this", "that", "these", "those", "it", "its", "test", "step",
  "verify", "check", "ensure", "validate",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .sort();
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url.toLowerCase().replace(/[^a-z0-9.]/g, "");
  }
}

function keywordOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  let overlap = 0;
  for (const w of b) {
    if (setA.has(w)) overlap++;
  }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? overlap / union : 0;
}

// =============================================================================
// Credential Tokenization
// =============================================================================

/**
 * Replace actual credential values with tokens for safe storage.
 * e.g., "standard_user" → "${username}", "secret_sauce" → "${password}"
 */
function tokenizeValue(
  value: string | undefined,
  credentials?: { username?: string; password?: string }
): string | undefined {
  if (!value || !credentials) return value;

  let tokenized = value;
  if (credentials.username && tokenized.includes(credentials.username)) {
    tokenized = tokenized.replace(credentials.username, "${username}");
  }
  if (credentials.password && tokenized.includes(credentials.password)) {
    tokenized = tokenized.replace(credentials.password, "${password}");
  }
  return tokenized;
}

/**
 * Replace tokens with actual credential values for replay.
 */
function detokenizeValue(
  template: string | undefined,
  credentials?: { username?: string; password?: string }
): string | undefined {
  if (!template || !credentials) return template;

  let value = template;
  if (credentials.username) {
    value = value.replace("${username}", credentials.username);
  }
  if (credentials.password) {
    value = value.replace("${password}", credentials.password);
  }
  return value;
}

// =============================================================================
// Public API
// =============================================================================

/** Minimum confidence to use a cached sequence (skip LLM) */
const MIN_REPLAY_CONFIDENCE = 0.7;

/**
 * Look up a known action sequence for a given step + URL.
 * Returns the best match above the confidence threshold, or null.
 */
export async function findActionSequence(
  stepTitle: string,
  url: string,
  minConfidence: number = MIN_REPLAY_CONFIDENCE
): Promise<SequenceLookup | null> {
  const sequences = await loadStore();
  if (sequences.length === 0) return null;

  const domain = extractDomain(url);
  const keywords = extractKeywords(stepTitle);

  let bestMatch: SequenceLookup | null = null;

  for (const seq of sequences) {
    // Must match domain
    if (seq.url_domain !== domain) continue;

    // Must meet confidence threshold
    if (seq.confidence < minConfidence) continue;

    // Compute keyword similarity
    const kwSim = keywordOverlap(keywords, seq.step_keywords);
    if (kwSim < 0.3) continue; // Too different

    const score = kwSim * 0.6 + seq.confidence * 0.4;
    const reason = `Domain: ${domain}, keyword similarity: ${(kwSim * 100).toFixed(0)}%, confidence: ${(seq.confidence * 100).toFixed(0)}%`;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { sequence: seq, score, reason };
    }
  }

  if (bestMatch) {
    console.log(
      `[ActionSequenceStore] Found cached sequence "${bestMatch.sequence.step_title}" ` +
      `(${bestMatch.sequence.actions.length} actions, confidence: ${(bestMatch.sequence.confidence * 100).toFixed(0)}%) — ` +
      `will skip LLM for this step`
    );
  }

  return bestMatch;
}

/**
 * Replay a cached sequence, replacing credential tokens with actual values.
 * Returns the actions ready for execution.
 */
export function replaySequence(
  sequence: ActionSequence,
  credentials?: { username?: string; password?: string }
): SequenceAction[] {
  return sequence.actions.map((action) => {
    const inputs = { ...action.inputs };

    // Detokenize credential values in inputs
    if (inputs.value && typeof inputs.value === "string") {
      inputs.value = detokenizeValue(inputs.value, credentials) || inputs.value;
    }

    return {
      ...action,
      inputs,
    };
  });
}

/**
 * Record a successful action sequence after a plan step completes.
 * Only records if the step passed and had meaningful actions.
 */
export async function recordActionSequence(
  stepTitle: string,
  url: string,
  actions: {
    action_type: BrowserActionType;
    selector?: string;
    value?: string;
    inputs: Record<string, unknown>;
    rationale: string;
    status: "success" | "failure";
  }[],
  runId: string,
  credentials?: { username?: string; password?: string }
): Promise<void> {
  // Only record if we have successful actions
  const successfulActions = actions.filter((a) => a.status === "success" && a.action_type !== "no_op");
  if (successfulActions.length === 0) return;

  const sequences = await loadStore();
  const domain = extractDomain(url);
  const keywords = extractKeywords(stepTitle);
  const requiresCreds = successfulActions.some(
    (a) =>
      a.value &&
      credentials &&
      ((credentials.username && a.value.includes(credentials.username)) ||
        (credentials.password && a.value.includes(credentials.password)))
  );

  // Check if a similar sequence already exists
  const existingIdx = sequences.findIndex(
    (s) => s.url_domain === domain && keywordOverlap(s.step_keywords, keywords) > 0.5
  );

  if (existingIdx >= 0) {
    // Update existing sequence
    const existing = sequences[existingIdx];
    existing.success_count += 1;
    existing.confidence = Math.min(
      1.0,
      existing.confidence + 0.1 // Increase confidence with each success
    );
    existing.last_used_at = new Date().toISOString();

    // Update actions if the new sequence is shorter (more efficient)
    if (successfulActions.length < existing.actions.length) {
      existing.actions = successfulActions.map((a) => ({
        action_type: a.action_type,
        selector: a.selector,
        value_template: tokenizeValue(a.value, credentials),
        inputs: tokenizeInputs(a.inputs, credentials),
        rationale: a.rationale,
      }));
    }

    console.log(
      `[ActionSequenceStore] Updated sequence "${existing.step_title}" ` +
      `(success: ${existing.success_count}, confidence: ${(existing.confidence * 100).toFixed(0)}%)`
    );
  } else {
    // Create new sequence
    const newSeq: ActionSequence = {
      sequence_id: `seq_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      url_domain: domain,
      step_keywords: keywords,
      step_title: stepTitle,
      actions: successfulActions.map((a) => ({
        action_type: a.action_type,
        selector: a.selector,
        value_template: tokenizeValue(a.value, credentials),
        inputs: tokenizeInputs(a.inputs, credentials),
        rationale: a.rationale,
      })),
      success_count: 1,
      failure_count: 0,
      confidence: 0.6, // Start at 0.6 — needs at least one more success to reach replay threshold
      requires_credentials: requiresCreds,
      source_run_id: runId,
      created_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
    };

    sequences.push(newSeq);
    console.log(
      `[ActionSequenceStore] Recorded new sequence "${stepTitle}" ` +
      `(${successfulActions.length} actions, confidence: 60%)`
    );
  }

  await persistStore();
}

/**
 * Mark a replayed sequence as having failed.
 * Reduces confidence so it's less likely to be reused.
 */
export async function recordSequenceFailure(sequenceId: string): Promise<void> {
  const sequences = await loadStore();
  const seq = sequences.find((s) => s.sequence_id === sequenceId);
  if (!seq) return;

  seq.failure_count += 1;
  seq.confidence = Math.max(0.1, seq.confidence - 0.2); // Decrease confidence on failure
  seq.last_used_at = new Date().toISOString();

  console.log(
    `[ActionSequenceStore] Sequence "${seq.step_title}" failed during replay — ` +
    `confidence reduced to ${(seq.confidence * 100).toFixed(0)}%`
  );

  await persistStore();
}

/**
 * Get all stored sequences (for display / debug).
 */
export async function getAllActionSequences(): Promise<ActionSequence[]> {
  return loadStore();
}

/**
 * Get summary stats about the action sequence store.
 */
export async function getSequenceStats(): Promise<{
  total_sequences: number;
  total_successes: number;
  total_failures: number;
  domains_covered: string[];
  avg_confidence: number;
}> {
  const sequences = await loadStore();
  const domains = [...new Set(sequences.map((s) => s.url_domain))];
  const totalSuccesses = sequences.reduce((sum, s) => sum + s.success_count, 0);
  const totalFailures = sequences.reduce((sum, s) => sum + s.failure_count, 0);
  const avgConfidence =
    sequences.length > 0
      ? sequences.reduce((sum, s) => sum + s.confidence, 0) / sequences.length
      : 0;

  return {
    total_sequences: sequences.length,
    total_successes: totalSuccesses,
    total_failures: totalFailures,
    domains_covered: domains,
    avg_confidence: avgConfidence,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Tokenize credential values inside an inputs object.
 */
function tokenizeInputs(
  inputs: Record<string, unknown>,
  credentials?: { username?: string; password?: string }
): Record<string, unknown> {
  if (!credentials) return inputs;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === "string") {
      result[key] = tokenizeValue(value, credentials) || value;
    } else {
      result[key] = value;
    }
  }
  return result;
}
