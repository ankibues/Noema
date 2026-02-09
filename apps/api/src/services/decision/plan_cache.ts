/**
 * Plan Cache
 * 
 * Stores executed test plans indexed by URL domain + goal keywords.
 * On subsequent runs against the same (or similar) target, the cached plan
 * can be reused directly — skipping the LLM plan-generation call entirely.
 * 
 * This is a key component of NOEMA's "persistent memory reduces LLM usage"
 * architecture: once NOEMA has planned for a target, it remembers the plan.
 * 
 * Persistence: data/plan_cache.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir } from "../../storage/base.js";
import type { TestPlan, TestPlanStep } from "./types.js";

// =============================================================================
// Types
// =============================================================================

export interface CachedPlan {
  /** Cache entry ID */
  cache_id: string;
  /** The full test plan */
  plan: TestPlan;
  /** Normalized URL domain (e.g. "saucedemo.com") */
  url_domain: string;
  /** Original full URL */
  url: string;
  /** Goal keywords (lowercased, sorted) */
  goal_keywords: string[];
  /** Original goal text */
  goal: string;
  /** How many times this plan was executed */
  times_executed: number;
  /** How many steps passed last time */
  last_passed: number;
  /** How many steps failed last time */
  last_failed: number;
  /** Success rate across all uses (0-1) */
  success_rate: number;
  /** Source run that created this plan */
  source_run_id: string;
  /** When first cached */
  created_at: string;
  /** When last used */
  last_used_at: string;
}

export interface PlanCacheMatch {
  /** The cached plan */
  cached: CachedPlan;
  /** Match score (0-1) */
  score: number;
  /** Why this was matched */
  reason: string;
}

// =============================================================================
// Storage
// =============================================================================

const CACHE_FILE = "plan_cache.json";

function getCachePath(): string {
  return join(getDataDir(), CACHE_FILE);
}

let cache: CachedPlan[] | null = null;

async function loadCache(): Promise<CachedPlan[]> {
  if (cache) return cache;

  const filePath = getCachePath();
  if (existsSync(filePath)) {
    try {
      const content = await readFile(filePath, "utf-8");
      cache = JSON.parse(content) as CachedPlan[];
      return cache;
    } catch {
      cache = [];
      return cache;
    }
  }

  cache = [];
  return cache;
}

async function persistCache(): Promise<void> {
  if (!cache) return;
  const filePath = getCachePath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, JSON.stringify(cache, null, 2), "utf-8");
}

// =============================================================================
// URL & Goal Normalization
// =============================================================================

/**
 * Extract the domain from a URL (e.g. "https://www.saucedemo.com/v1" → "saucedemo.com")
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url.toLowerCase().replace(/[^a-z0-9.]/g, "");
  }
}

/**
 * Extract meaningful keywords from a goal string.
 */
function extractGoalKeywords(goal: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "to", "of", "in",
    "for", "on", "with", "at", "by", "from", "as", "into", "through",
    "during", "before", "after", "and", "but", "if", "or", "because",
    "this", "that", "these", "those", "it", "its",
  ]);

  return goal
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .sort();
}

/**
 * Compute similarity between two keyword sets (Jaccard-like).
 */
function keywordSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Find a cached plan matching the given URL and goal.
 * Returns the best match above the threshold, or null.
 */
export async function findCachedPlan(
  url: string,
  goal: string,
  minScore: number = 0.4
): Promise<PlanCacheMatch | null> {
  const entries = await loadCache();
  if (entries.length === 0) return null;

  const domain = extractDomain(url);
  const keywords = extractGoalKeywords(goal);

  let bestMatch: PlanCacheMatch | null = null;

  for (const entry of entries) {
    let score = 0;
    const reasons: string[] = [];

    // Domain match is the strongest signal
    if (entry.url_domain === domain) {
      score += 0.5;
      reasons.push(`Same domain: ${domain}`);
    }

    // Exact URL match adds more
    if (extractDomain(entry.url) === domain && entry.url === url) {
      score += 0.2;
      reasons.push("Exact URL match");
    }

    // Goal keyword similarity
    const kwSim = keywordSimilarity(keywords, entry.goal_keywords);
    score += kwSim * 0.3;
    if (kwSim > 0.3) {
      reasons.push(`Goal similarity: ${(kwSim * 100).toFixed(0)}%`);
    }

    // Bonus for successful plans
    if (entry.success_rate > 0.5) {
      score += 0.05;
      reasons.push(`Previously successful (${(entry.success_rate * 100).toFixed(0)}%)`);
    }

    if (score >= minScore && (!bestMatch || score > bestMatch.score)) {
      bestMatch = {
        cached: entry,
        score,
        reason: reasons.join("; "),
      };
    }
  }

  if (bestMatch) {
    console.log(
      `[PlanCache] Found cached plan (score=${bestMatch.score.toFixed(2)}): ${bestMatch.reason}`
    );
  } else {
    console.log(`[PlanCache] No cached plan found for ${domain} (${entries.length} entries checked)`);
  }

  return bestMatch;
}

/**
 * Save a plan to the cache after execution.
 * If a plan for the same domain + similar goal already exists, update it.
 */
export async function savePlanToCache(
  plan: TestPlan,
  url: string,
  goal: string,
  runId: string
): Promise<void> {
  const entries = await loadCache();
  const domain = extractDomain(url);
  const keywords = extractGoalKeywords(goal);

  const passed = plan.steps.filter((s) => s.result === "pass").length;
  const failed = plan.steps.filter((s) => s.result === "fail").length;
  const total = passed + failed;

  // Check if we already have an entry for this domain + similar goal
  const existingIdx = entries.findIndex(
    (e) => e.url_domain === domain && keywordSimilarity(e.goal_keywords, keywords) > 0.6
  );

  if (existingIdx >= 0) {
    // Update existing entry
    const existing = entries[existingIdx];
    existing.plan = stripPlanResults(plan); // Store clean plan for reuse
    existing.times_executed += 1;
    existing.last_passed = passed;
    existing.last_failed = failed;
    existing.success_rate = total > 0
      ? ((existing.success_rate * (existing.times_executed - 1)) + (passed / total)) / existing.times_executed
      : existing.success_rate;
    existing.last_used_at = new Date().toISOString();

    console.log(
      `[PlanCache] Updated existing plan for ${domain} (executed ${existing.times_executed} times, ` +
      `success rate: ${(existing.success_rate * 100).toFixed(0)}%)`
    );
  } else {
    // Create new entry
    const newEntry: CachedPlan = {
      cache_id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      plan: stripPlanResults(plan),
      url_domain: domain,
      url,
      goal_keywords: keywords,
      goal,
      times_executed: 1,
      last_passed: passed,
      last_failed: failed,
      success_rate: total > 0 ? passed / total : 0,
      source_run_id: runId,
      created_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
    };

    entries.push(newEntry);
    console.log(`[PlanCache] Saved new plan for ${domain} (${plan.total_steps} steps)`);
  }

  await persistCache();
}

/**
 * Record that a cached plan was reused for a new run.
 */
export async function recordPlanReuse(
  cacheId: string,
  passed: number,
  failed: number
): Promise<void> {
  const entries = await loadCache();
  const entry = entries.find((e) => e.cache_id === cacheId);
  if (!entry) return;

  entry.times_executed += 1;
  entry.last_passed = passed;
  entry.last_failed = failed;
  const total = passed + failed;
  if (total > 0) {
    entry.success_rate =
      ((entry.success_rate * (entry.times_executed - 1)) + (passed / total)) / entry.times_executed;
  }
  entry.last_used_at = new Date().toISOString();

  await persistCache();
}

/**
 * Get all cached plans (for display / debug).
 */
export async function getAllCachedPlans(): Promise<CachedPlan[]> {
  return loadCache();
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Strip execution results from a plan so it can be reused cleanly.
 * Keeps the structure (steps, descriptions) but resets results.
 */
function stripPlanResults(plan: TestPlan): TestPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => ({
      ...step,
      result: undefined as any,
      actual_outcome: undefined as any,
      actions_taken: undefined as any,
      screenshots: undefined as any,
    })),
  };
}
