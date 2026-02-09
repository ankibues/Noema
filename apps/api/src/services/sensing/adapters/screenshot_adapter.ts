/**
 * ScreenshotAdapter - Converts screenshots into processable chunks
 * 
 * Purpose: Accept image files/base64 and extract visual understanding via Gemini Vision.
 * 
 * Implementation:
 * - Uses Gemini Vision (gemini-3-pro-image-preview) for real visual analysis
 * - Falls back to stub text if no API key is available
 * - Raw image is stored as evidence
 * 
 * This adapter does NOT:
 * - Interpret image meaning beyond what Vision returns
 * - Make decisions
 * - Create Observations directly (that's Normalizer's job)
 */

import { writeFile, copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuid } from "uuid";
import { chunkText, type Chunk, type ChunkerOptions } from "../processors/chunker.js";
import { analyzeScreenshot, isVisionAvailable } from "../vision_client.js";

export interface ScreenshotAdapterInput {
  /** Base64 encoded image data */
  base64?: string;
  /** File path to image */
  filePath?: string;
  /** Optional chunking options */
  options?: ChunkerOptions;
  /** Directory to store raw evidence */
  evidenceDir?: string;
}

export interface ScreenshotAdapterOutput {
  /** Resulting chunks from vision analysis text */
  chunks: Chunk[];
  /** Path to stored raw image evidence */
  evidencePath: string;
  /** Vision-extracted text (full) */
  extractedText: string;
  /** Whether real vision was used (false for stub) */
  visionUsed: boolean;
}

/**
 * Default evidence directory
 */
const DEFAULT_EVIDENCE_DIR = "./data/evidence/screenshots";

/**
 * Process screenshot into chunks
 */
export async function processScreenshot(
  input: ScreenshotAdapterInput
): Promise<ScreenshotAdapterOutput> {
  const { base64, filePath, options, evidenceDir = DEFAULT_EVIDENCE_DIR } = input;

  if (!base64 && !filePath) {
    throw new Error("Either base64 or filePath must be provided");
  }

  // Ensure evidence directory exists
  if (!existsSync(evidenceDir)) {
    await mkdir(evidenceDir, { recursive: true });
  }

  // Generate evidence ID and path
  const evidenceId = uuid();
  const evidencePath = join(evidenceDir, `${evidenceId}.png`);

  // Store raw image
  if (base64) {
    // Remove data URL prefix if present
    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(cleanBase64, "base64");
    await writeFile(evidencePath, imageBuffer);
  } else if (filePath) {
    // Copy the file to the evidence directory for preservation
    try {
      await copyFile(filePath, evidencePath);
    } catch (error) {
      console.warn(`[ScreenshotAdapter] Failed to copy evidence file: ${error}`);
    }
  }

  // Vision analysis via Gemini
  const visionResult = await analyzeScreenshot({ base64, filePath });
  const extractedText = visionResult.description;

  if (visionResult.visionUsed) {
    console.log(`[ScreenshotAdapter] Gemini Vision analysis complete (${visionResult.model})`);
  } else {
    console.log("[ScreenshotAdapter] Using stub analysis (no API key)");
  }

  // Chunk the extracted text
  const chunks = chunkText(extractedText, options);

  return {
    chunks,
    evidencePath,
    extractedText,
    visionUsed: visionResult.visionUsed,
  };
}

/**
 * ScreenshotAdapter class for stateful processing
 */
export class ScreenshotAdapter {
  private readonly options: ChunkerOptions;
  private readonly evidenceDir: string;

  constructor(config: { options?: ChunkerOptions; evidenceDir?: string } = {}) {
    this.options = config.options || {};
    this.evidenceDir = config.evidenceDir || DEFAULT_EVIDENCE_DIR;
  }

  /**
   * Process screenshot into chunks
   */
  async process(input: { base64?: string; filePath?: string }): Promise<ScreenshotAdapterOutput> {
    return processScreenshot({
      ...input,
      options: this.options,
      evidenceDir: this.evidenceDir,
    });
  }

  /**
   * Get the adapter type identifier
   */
  get type(): string {
    return "screenshot_adapter";
  }

  /**
   * Check if Gemini Vision is available
   */
  static isVisionAvailable(): boolean {
    return isVisionAvailable();
  }
}
