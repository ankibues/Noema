/**
 * LogAdapter - Converts log content into processable chunks
 * 
 * Purpose: Accept log files/streams and produce semantic chunks
 * with log-specific metadata (timestamps, levels).
 * 
 * This adapter does NOT:
 * - Interpret log meaning
 * - Make decisions
 * - Create Observations directly (that's Normalizer's job)
 */

import { chunkLogs, type Chunk, type ChunkerOptions } from "../processors/chunker.js";

export interface LogAdapterInput {
  /** Raw log content */
  content: string;
  /** Optional chunking options */
  options?: ChunkerOptions;
}

export interface LogAdapterOutput {
  /** Resulting chunks with log metadata */
  chunks: Chunk[];
  /** Original content length */
  originalLength: number;
  /** Number of chunks produced */
  chunkCount: number;
  /** Detected log levels in the content */
  detectedLevels: string[];
}

/**
 * Process log content into chunks
 */
export function processLogs(input: LogAdapterInput): LogAdapterOutput {
  const { content, options } = input;

  if (!content || content.trim().length === 0) {
    return {
      chunks: [],
      originalLength: 0,
      chunkCount: 0,
      detectedLevels: [],
    };
  }

  const chunks = chunkLogs(content, options);

  // Collect unique log levels
  const levels = new Set<string>();
  for (const chunk of chunks) {
    if (chunk.metadata?.logLevel) {
      levels.add(chunk.metadata.logLevel);
    }
  }

  return {
    chunks,
    originalLength: content.length,
    chunkCount: chunks.length,
    detectedLevels: Array.from(levels),
  };
}

/**
 * LogAdapter class for stateful processing
 */
export class LogAdapter {
  private readonly options: ChunkerOptions;

  constructor(options: ChunkerOptions = {}) {
    this.options = options;
  }

  /**
   * Process log content into chunks
   */
  process(content: string): LogAdapterOutput {
    return processLogs({ content, options: this.options });
  }

  /**
   * Get the adapter type identifier
   */
  get type(): string {
    return "log_adapter";
  }
}
