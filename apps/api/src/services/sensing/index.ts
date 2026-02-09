/**
 * Sensing Layer - Main Export
 * 
 * The Sensing Layer is NOEMA's perceptual IO.
 * It converts raw environment inputs into canonical Observations.
 * 
 * This layer does NOT:
 * - Think or reason
 * - Make decisions
 * - Update mental models
 * - Extract experiences
 * 
 * Observations are the ONLY entry point for new information into NOEMA.
 */

// Core orchestrator
export {
  SensorHub,
  getSensorHub,
  createSensorHub,
  type SensorHubConfig,
  type IngestInput,
  type IngestTextInput,
  type IngestLogInput,
  type IngestScreenshotInput,
  type IngestResult,
  type InputType,
} from "./sensor_hub.js";

// Event bus
export {
  getObservationBus,
  createObservationBus,
  type ObservationBus,
  type ObservationHandler,
} from "./observation_bus.js";

// Adapters
export {
  TextAdapter,
  processText,
  type TextAdapterInput,
  type TextAdapterOutput,
} from "./adapters/text_adapter.js";

export {
  LogAdapter,
  processLogs,
  type LogAdapterInput,
  type LogAdapterOutput,
} from "./adapters/log_adapter.js";

export {
  ScreenshotAdapter,
  processScreenshot,
  type ScreenshotAdapterInput,
  type ScreenshotAdapterOutput,
} from "./adapters/screenshot_adapter.js";

// Processors
export {
  chunkText,
  chunkLogs,
  type Chunk,
  type ChunkerOptions,
} from "./processors/chunker.js";

export {
  calculateSalience,
  calculateChunkSalience,
  type SalienceResult,
} from "./processors/salience.js";

export {
  normalizeToObservation,
  type NormalizerInput,
} from "./processors/normalizer.js";

// Vision
export {
  analyzeScreenshot,
  analyzeScreenshotForDecision,
  isVisionAvailable,
  type VisionConfig,
  type VisionAnalysisResult,
} from "./vision_client.js";
