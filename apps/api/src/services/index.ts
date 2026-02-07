/**
 * NOEMA Services - Main Export
 * 
 * External service integrations and internal services for NOEMA.
 */

// Cognee - Semantic memory infrastructure (namespaced to avoid conflicts)
export * as cognee from "./cognee/index.js";

// Sensing - Perceptual IO layer (namespaced to avoid conflicts)
export * as sensing from "./sensing/index.js";

// Cognition - Belief formation and evolution (namespaced to avoid conflicts)
export * as cognition from "./cognition/index.js";

// Decision - Action selection and execution (namespaced to avoid conflicts)
export * as decision from "./decision/index.js";

// Experience - Learning from outcomes (namespaced to avoid conflicts)
export * as experience from "./experience/index.js";

// Identity - Persistent NOEMA identity and lifetime
export * as identity from "./identity/index.js";

// Narration - Self-narration and live event streaming
export * as narration from "./narration/index.js";

// Reflection - Timeline, reflection, and improvement analysis
export * as reflection from "./reflection/index.js";
