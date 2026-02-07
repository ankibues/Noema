/**
 * SensorHub - Orchestrates the Sensing Layer
 * 
 * Purpose: Accept raw inputs and produce canonical Observations.
 * 
 * Responsibilities:
 * - Accept raw inputs from API or internal calls
 * - Route input to correct Adapter
 * - Process chunks through Salience and Normalizer
 * - Persist Observations via ObservationRepo
 * - Ingest evidence into Cognee
 * - Publish Observations to ObservationBus
 * 
 * This component does NOT:
 * - Interpret meaning
 * - Make decisions
 * - Update mental models
 * - Extract experiences
 * 
 * SensorHub is perceptual IO, not intelligence.
 */

import { v4 as uuid } from "uuid";
import type { Observation, ObservationType } from "../../schemas/index.js";
import { getObservationRepository } from "../../storage/index.js";
import { getCogneeClient } from "../cognee/index.js";
import { getObservationBus, type ObservationBus } from "./observation_bus.js";
import { TextAdapter } from "./adapters/text_adapter.js";
import { LogAdapter } from "./adapters/log_adapter.js";
import { ScreenshotAdapter } from "./adapters/screenshot_adapter.js";
import { calculateChunkSalience } from "./processors/salience.js";
import { normalizeToObservation } from "./processors/normalizer.js";
import type { Chunk } from "./processors/chunker.js";

// =============================================================================
// Types
// =============================================================================

export type InputType = "text" | "log" | "screenshot";

export interface IngestSourceMetadata {
  origin?: string;
  action_id?: string;
  [key: string]: unknown;
}

export interface IngestTextInput {
  type: "text";
  content: string;
  sessionId?: string;
  runId?: string;
  source?: IngestSourceMetadata;
}

export interface IngestLogInput {
  type: "log";
  content: string;
  sessionId?: string;
  runId?: string;
  source?: IngestSourceMetadata;
}

export interface IngestScreenshotInput {
  type: "screenshot";
  base64?: string;
  filePath?: string;
  sessionId?: string;
  runId?: string;
  source?: IngestSourceMetadata;
}

export type IngestInput = IngestTextInput | IngestLogInput | IngestScreenshotInput;

export interface IngestResult {
  /** IDs of created Observations */
  observationIds: string[];
  /** IDs of evidence ingested into Cognee */
  evidenceIds: string[];
  /** Number of chunks processed */
  chunkCount: number;
  /** Input type that was processed */
  inputType: InputType;
}

// =============================================================================
// SensorHub
// =============================================================================

export interface SensorHubConfig {
  /** Whether to ingest into Cognee (can be disabled for testing) */
  cogneeEnabled?: boolean;
  /** Evidence directory for screenshots */
  evidenceDir?: string;
}

export class SensorHub {
  private readonly textAdapter: TextAdapter;
  private readonly logAdapter: LogAdapter;
  private readonly screenshotAdapter: ScreenshotAdapter;
  private readonly observationBus: ObservationBus;
  private readonly cogneeEnabled: boolean;

  constructor(config: SensorHubConfig = {}) {
    this.textAdapter = new TextAdapter();
    this.logAdapter = new LogAdapter();
    this.screenshotAdapter = new ScreenshotAdapter({
      evidenceDir: config.evidenceDir,
    });
    this.observationBus = getObservationBus();
    this.cogneeEnabled = config.cogneeEnabled ?? true;
  }

  /**
   * Ingest raw input and produce Observations
   */
  async ingest(input: IngestInput): Promise<IngestResult> {
    switch (input.type) {
      case "text":
        return this.ingestText(input);
      case "log":
        return this.ingestLog(input);
      case "screenshot":
        return this.ingestScreenshot(input);
      default:
        throw new Error(`Unknown input type: ${(input as IngestInput).type}`);
    }
  }

  /**
   * Ingest text content
   */
  private async ingestText(input: IngestTextInput): Promise<IngestResult> {
    const { content, sessionId, runId } = input;

    // 1. Chunk the content
    const { chunks } = this.textAdapter.process(content);

    // 2. Process chunks into Observations
    const observations = await this.processChunks(
      chunks,
      "text",
      this.textAdapter.type,
      sessionId,
      runId,
      content // raw content for evidence
    );

    return {
      observationIds: observations.map(o => o.observation_id),
      evidenceIds: observations.map(o => o.raw_ref).filter((r): r is string => !!r),
      chunkCount: chunks.length,
      inputType: "text",
    };
  }

  /**
   * Ingest log content
   */
  private async ingestLog(input: IngestLogInput): Promise<IngestResult> {
    const { content, sessionId, runId } = input;

    // 1. Chunk the content (log-aware)
    const { chunks } = this.logAdapter.process(content);

    // 2. Process chunks into Observations
    const observations = await this.processChunks(
      chunks,
      "log",
      this.logAdapter.type,
      sessionId,
      runId,
      content // raw content for evidence
    );

    return {
      observationIds: observations.map(o => o.observation_id),
      evidenceIds: observations.map(o => o.raw_ref).filter((r): r is string => !!r),
      chunkCount: chunks.length,
      inputType: "log",
    };
  }

  /**
   * Ingest screenshot
   */
  private async ingestScreenshot(input: IngestScreenshotInput): Promise<IngestResult> {
    const { base64, filePath, sessionId, runId } = input;

    // 1. Process screenshot (OCR + store evidence)
    const { chunks, evidencePath, extractedText } = await this.screenshotAdapter.process({
      base64,
      filePath,
    });

    // 2. Process chunks into Observations
    const observations = await this.processChunks(
      chunks,
      "screenshot",
      this.screenshotAdapter.type,
      sessionId,
      runId,
      extractedText, // OCR text for evidence
      evidencePath // reference to stored image
    );

    return {
      observationIds: observations.map(o => o.observation_id),
      evidenceIds: observations.map(o => o.raw_ref).filter((r): r is string => !!r),
      chunkCount: chunks.length,
      inputType: "screenshot",
    };
  }

  /**
   * Process chunks into Observations
   */
  private async processChunks(
    chunks: Chunk[],
    type: ObservationType,
    sensor: string,
    sessionId?: string,
    runId?: string,
    _rawContent?: string,
    evidenceRef?: string
  ): Promise<Observation[]> {
    const observations: Observation[] = [];
    const observationRepo = getObservationRepository();

    // Generate a batch ID for this ingestion
    const batchId = uuid();

    for (const chunk of chunks) {
      // 1. Calculate salience
      const salience = calculateChunkSalience(chunk);

      // 2. Generate evidence ID
      const evidenceId = `evidence_${batchId}_${chunk.index}`;

      // 3. Normalize to Observation input
      const observationInput = normalizeToObservation({
        chunk,
        salience,
        type,
        sensor,
        sessionId,
        runId,
        rawRef: evidenceRef || evidenceId,
      });

      // 4. Persist Observation
      const observation = await observationRepo.create(observationInput);
      observations.push(observation);

      // 5. Ingest into Cognee (if enabled)
      if (this.cogneeEnabled) {
        try {
          await this.ingestToCognee(evidenceId, chunk.content, type, sensor);
        } catch (error) {
          // Log but don't fail - Cognee ingestion is non-critical
          console.error("[SensorHub] Cognee ingestion failed:", error);
        }
      }

      // 6. Publish to ObservationBus
      await this.observationBus.publish(observation);
    }

    return observations;
  }

  /**
   * Ingest evidence into Cognee
   */
  private async ingestToCognee(
    evidenceId: string,
    content: string,
    type: ObservationType,
    sensor: string
  ): Promise<void> {
    const cognee = getCogneeClient();

    // Map observation type to Cognee content type
    const contentTypeMap: Record<ObservationType, "text" | "log" | "screenshot_ocr" | "transcript"> = {
      text: "text",
      log: "log",
      screenshot: "screenshot_ocr",
      video_frame: "screenshot_ocr",
      audio_transcript: "transcript",
      human: "text",
      test_result: "text",
    };

    await cognee.ingestArtifact({
      evidence_id: evidenceId,
      content,
      content_type: contentTypeMap[type],
      metadata: {
        source: sensor,
        timestamp: new Date().toISOString(),
      },
    });

    // Run cognify after ingestion (MVP - can be optimized later)
    await cognee.cognify();
  }
}

// =============================================================================
// Singleton
// =============================================================================

let instance: SensorHub | null = null;

export function getSensorHub(config?: SensorHubConfig): SensorHub {
  if (!instance) {
    instance = new SensorHub(config);
  }
  return instance;
}

export function createSensorHub(config?: SensorHubConfig): SensorHub {
  return new SensorHub(config);
}
