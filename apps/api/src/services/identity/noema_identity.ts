/**
 * NOEMA Identity
 * 
 * A persistent identity record for this NOEMA instance.
 * Tracks lifetime statistics: total runs, observations, models, experiences.
 * 
 * Enables statements like:
 *   "This NOEMA instance has lived through 12 runs and learned 4 reusable experiences."
 * 
 * Persists across restarts via data/identity.json.
 */

import { v4 as uuidv4 } from "uuid";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir } from "../../storage/base.js";

// =============================================================================
// Identity Schema
// =============================================================================

export interface NoemaIdentity {
  /** Unique ID for this NOEMA instance */
  id: string;
  /** When this instance was first created */
  created_at: string;
  /** Total runs completed */
  total_runs: number;
  /** Total observations ingested */
  total_observations: number;
  /** Total mental models formed */
  total_models: number;
  /** Total experiences learned */
  total_experiences: number;
  /** All domains this instance has seen */
  domains_seen: string[];
  /** Last activity timestamp */
  last_active_at: string;
}

// =============================================================================
// Identity Manager
// =============================================================================

const IDENTITY_FILE = "identity.json";

let cachedIdentity: NoemaIdentity | null = null;

function getIdentityPath(): string {
  return join(getDataDir(), IDENTITY_FILE);
}

/**
 * Load identity from disk, or create a new one if none exists.
 */
export async function loadIdentity(): Promise<NoemaIdentity> {
  if (cachedIdentity) return cachedIdentity;

  const filePath = getIdentityPath();
  const dir = dirname(filePath);

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  if (existsSync(filePath)) {
    try {
      const content = await readFile(filePath, "utf-8");
      cachedIdentity = JSON.parse(content) as NoemaIdentity;
      return cachedIdentity;
    } catch {
      console.warn("[Identity] Failed to load identity, creating new one");
    }
  }

  // Create new identity
  const now = new Date().toISOString();
  cachedIdentity = {
    id: uuidv4(),
    created_at: now,
    total_runs: 0,
    total_observations: 0,
    total_models: 0,
    total_experiences: 0,
    domains_seen: [],
    last_active_at: now,
  };

  await persistIdentity();
  console.log(`[Identity] Created new NOEMA instance: ${cachedIdentity.id.substring(0, 8)}...`);
  return cachedIdentity;
}

/**
 * Persist identity to disk.
 */
async function persistIdentity(): Promise<void> {
  if (!cachedIdentity) return;
  const filePath = getIdentityPath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, JSON.stringify(cachedIdentity, null, 2), "utf-8");
}

/**
 * Update identity with new counts from current storage state.
 */
export async function refreshIdentity(): Promise<NoemaIdentity> {
  const identity = await loadIdentity();

  // Lazy imports to avoid circular dependencies
  const { getObservationRepository, getMentalModelRepository, getExperienceRepository, getRunRecordRepository } = await import("../../storage/index.js");
  const { getAllRunMetrics } = await import("../reflection/index.js");

  const observations = await getObservationRepository().list();
  const models = await getMentalModelRepository().list();
  const experiences = await getExperienceRepository().list();
  const runs = await getRunRecordRepository().list();
  const metrics = await getAllRunMetrics();

  identity.total_observations = observations.length;
  identity.total_models = models.length;
  identity.total_experiences = experiences.length;
  // Use the highest count: cached identity (from recordRunStart), RunRecordRepo, or metrics
  identity.total_runs = Math.max(identity.total_runs, runs.length, metrics.length);
  identity.last_active_at = new Date().toISOString();

  // Collect all unique domains from models
  const domains = new Set(identity.domains_seen);
  for (const model of models) {
    domains.add(model.domain);
  }
  identity.domains_seen = Array.from(domains);

  await persistIdentity();
  return identity;
}

/**
 * Record that a new run started.
 */
export async function recordRunStart(): Promise<NoemaIdentity> {
  const identity = await loadIdentity();
  identity.total_runs++;
  identity.last_active_at = new Date().toISOString();
  await persistIdentity();
  return identity;
}

/**
 * Get the age of this NOEMA instance in human-readable form.
 */
export function getAge(identity: NoemaIdentity): string {
  const created = new Date(identity.created_at);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days === 1 ? "" : "s"}`;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

/**
 * Format an identity statement for narration.
 */
export function formatIdentityStatement(identity: NoemaIdentity): string {
  const age = getAge(identity);
  const parts: string[] = [];

  parts.push(`This NOEMA instance has been active for ${age}`);

  if (identity.total_runs > 0) {
    parts.push(`completed ${identity.total_runs} run${identity.total_runs === 1 ? "" : "s"}`);
  }

  if (identity.total_experiences > 0) {
    parts.push(`learned ${identity.total_experiences} reusable experience${identity.total_experiences === 1 ? "" : "s"}`);
  }

  if (identity.total_models > 0) {
    parts.push(`formed ${identity.total_models} mental model${identity.total_models === 1 ? "" : "s"}`);
  }

  return parts.join(", ") + ".";
}
