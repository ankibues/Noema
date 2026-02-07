/**
 * TextAdapter - Converts raw text into processable chunks
 * 
 * Purpose: Accept large text inputs and produce semantic chunks.
 * 
 * This adapter does NOT:
 * - Interpret meaning
 * - Make decisions
 * - Create Observations directly (that's Normalizer's job)
 */

import { chunkText, type Chunk, type ChunkerOptions } from "../processors/chunker.js";

export interface TextAdapterInput {
  /** Raw text content */
  content: string;
  /** Optional chunking options */
  options?: ChunkerOptions;
}

export interface TextAdapterOutput {
  /** Resulting chunks */
  chunks: Chunk[];
  /** Original content length */
  originalLength: number;
  /** Number of chunks produced */
  chunkCount: number;
}

/**
 * Process raw text into chunks
 */
export function processText(input: TextAdapterInput): TextAdapterOutput {
  const { content, options } = input;

  if (!content || content.trim().length === 0) {
    return {
      chunks: [],
      originalLength: 0,
      chunkCount: 0,
    };
  }

  const chunks = chunkText(content, options);

  return {
    chunks,
    originalLength: content.length,
    chunkCount: chunks.length,
  };
}

/**
 * TextAdapter class for stateful processing
 */
export class TextAdapter {
  private readonly options: ChunkerOptions;

  constructor(options: ChunkerOptions = {}) {
    this.options = options;
  }

  /**
   * Process text content into chunks
   */
  process(content: string): TextAdapterOutput {
    return processText({ content, options: this.options });
  }

  /**
   * Get the adapter type identifier
   */
  get type(): string {
    return "text_adapter";
  }
}
