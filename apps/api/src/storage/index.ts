/**
 * Storage Layer - Main Export
 * 
 * This module provides access to all NOEMA repositories.
 * Each repository is a dumb state container with JSON file persistence.
 * 
 * No cognition, sensing, or decision logic lives here.
 */

// Base utilities
export { BaseRepository, getDataDir, getCollectionPath, nowISO } from "./base.js";

// Re-export repositories
export {
  ObservationRepository,
  getObservationRepository,
} from "./observations.js";

export {
  MentalModelRepository,
  getMentalModelRepository,
  type UpdateMentalModelInput,
} from "./mental-models.js";

export {
  ExperienceRepository,
  getExperienceRepository,
  type UpdateExperienceInput,
} from "./experiences.js";

export {
  GraphRepository,
  getGraphRepository,
  type UpdateGraphEdgeInput,
} from "./graph.js";

export {
  ActionRepository,
  ActionOutcomeRepository,
  getActionRepository,
  getActionOutcomeRepository,
} from "./actions.js";

export {
  RunRecordRepository,
  getRunRecordRepository,
  type UpdateRunRecordInput,
} from "./runs.js";

// Local imports for initializeStorage and getAllRepositories
import { getObservationRepository } from "./observations.js";
import { getMentalModelRepository } from "./mental-models.js";
import { getExperienceRepository } from "./experiences.js";
import { getGraphRepository } from "./graph.js";
import { getActionRepository, getActionOutcomeRepository } from "./actions.js";
import { getRunRecordRepository } from "./runs.js";

/**
 * Initialize all repositories
 * Call this at startup to ensure all data files are loaded
 */
export async function initializeStorage(): Promise<void> {
  await Promise.all([
    getObservationRepository().init(),
    getMentalModelRepository().init(),
    getExperienceRepository().init(),
    getGraphRepository().init(),
    getActionRepository().init(),
    getActionOutcomeRepository().init(),
    getRunRecordRepository().init(),
  ]);
}

/**
 * Get all repository instances
 * Useful for bulk operations or testing
 */
export function getAllRepositories() {
  return {
    observations: getObservationRepository(),
    mentalModels: getMentalModelRepository(),
    experiences: getExperienceRepository(),
    graph: getGraphRepository(),
    actions: getActionRepository(),
    actionOutcomes: getActionOutcomeRepository(),
    runs: getRunRecordRepository(),
  };
}
