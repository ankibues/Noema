/**
 * NOEMA API - Main Entry Point
 * 
 * Phase 1: Persistence & Schemas
 * Phase 2: Cognee Integration (semantic memory)
 * Phase 3: Sensing Layer (perceptual IO)
 * Phase 4: Model Update Engine (belief formation)
 * Phase 5: Decision Engine (action selection and execution)
 * Phase 6: Experience Optimizer (training-free learning)
 * Phase 7: Human Interface, Narration, Lifetime & Improvement Metrics
 * 
 * This module exports:
 * - All data schemas (Zod validated)
 * - All storage repositories (JSON file persistence)
 * - Cognee client (semantic memory infrastructure)
 * - Sensing layer (observation creation)
 * - Cognition layer (belief formation and evolution)
 * - Decision layer (action selection and browser execution)
 * - Experience layer (training-free learning)
 * - Identity (persistent lifetime tracking)
 * - Narration (live self-explanation)
 * - Reflection (timeline, reports, improvement analysis)
 */

// Re-export all schemas
export * from "./schemas/index.js";

// Re-export all storage
export * from "./storage/index.js";

// Re-export services with namespaces to avoid conflicts
export * as cognee from "./services/cognee/index.js";
export * as sensing from "./services/sensing/index.js";
export * as cognition from "./services/cognition/index.js";
export * as decision from "./services/decision/index.js";
export * as experience from "./services/experience/index.js";
export * as identity from "./services/identity/index.js";
export * as narration from "./services/narration/index.js";
export * as reflection from "./services/reflection/index.js";
