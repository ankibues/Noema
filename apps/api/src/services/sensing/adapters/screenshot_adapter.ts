/**
 * ScreenshotAdapter - Converts screenshots into processable chunks
 * 
 * Purpose: Accept image files/base64 and extract text via OCR.
 * 
 * MVP Implementation:
 * - OCR is stubbed (returns placeholder text)
 * - Raw image is stored as evidence
 * - Future: integrate real OCR (Tesseract, cloud API, etc.)
 * 
 * This adapter does NOT:
 * - Interpret image meaning
 * - Make decisions
 * - Create Observations directly (that's Normalizer's job)
 */

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuid } from "uuid";
import { chunkText, type Chunk, type ChunkerOptions } from "../processors/chunker.js";

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
  /** Resulting chunks from OCR text */
  chunks: Chunk[];
  /** Path to stored raw image evidence */
  evidencePath: string;
  /** OCR extracted text (full) */
  extractedText: string;
  /** Whether real OCR was used (false for stub) */
  ocrUsed: boolean;
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
    // For file path, we could copy the file, but for MVP just reference it
    // In production, you'd copy to ensure evidence preservation
  }

  // OCR extraction (STUB for MVP)
  const extractedText = await extractTextFromImage(base64, filePath);

  // Chunk the extracted text
  const chunks = chunkText(extractedText, options);

  return {
    chunks,
    evidencePath,
    extractedText,
    ocrUsed: false, // Stub - set to true when real OCR is implemented
  };
}

/**
 * Extract text from image using OCR
 * 
 * MVP: Returns stub text describing what would be extracted
 * Future: Integrate Tesseract.js, Google Vision, or similar
 */
async function extractTextFromImage(
  base64?: string,
  filePath?: string
): Promise<string> {
  // MVP STUB: Return placeholder text
  // In production, this would call actual OCR
  
  const source = base64 ? "base64 image" : `file: ${filePath}`;
  const timestamp = new Date().toISOString();
  
  // Simulate OCR output structure
  return `[Screenshot OCR - ${timestamp}]
Source: ${source}
Status: OCR stub - real extraction not implemented

[Detected UI Elements]
- Header region detected
- Main content area detected
- Footer region detected

[Placeholder Text]
This is placeholder text from the OCR stub.
In production, this would contain actual extracted text from the screenshot.
The screenshot has been stored as evidence for future processing.

[Notes]
- Implement real OCR using Tesseract.js or cloud API
- Consider UI element detection for structured extraction
- Store bounding boxes for element locations`;
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
}
