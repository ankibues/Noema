/**
 * Narration Service - Main Export
 * 
 * NOEMA's self-narration system.
 * Streams first-person descriptions of cognition and actions.
 */

export {
  NarrationEmitter,
  getNarrationEmitter,
  type NarrationEvent,
  type NarrationEventType,
} from "./narration_emitter.js";

export {
  narrateActionStarted,
  narrateActionCompleted,
  narrateObservation,
  narrateBeliefFormed,
  narrateConfidenceChange,
  narrateExperienceLearned,
  narrateExperienceUsed,
  narrateRunStarted,
  narrateRunCompleted,
  narrateImprovement,
} from "./narration_formatter.js";
