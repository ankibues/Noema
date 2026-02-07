/**
 * Chunker - Splits raw content into manageable chunks
 * 
 * Purpose: Break large inputs into atomic, processable pieces.
 * 
 * Chunking Strategy:
 * 1. Prefer semantic chunking (newline blocks, timestamps, paragraphs)
 * 2. Fallback to character window (1-2k chars) if no semantic boundaries
 * 
 * This component does NOT:
 * - Interpret meaning
 * - Assign salience
 * - Create Observations
 */

export interface Chunk {
  /** The text content of this chunk */
  content: string;
  /** Index of this chunk in the sequence (0-based) */
  index: number;
  /** Character offset in the original content */
  startOffset: number;
  /** Character offset end in the original content */
  endOffset: number;
  /** Optional metadata extracted during chunking */
  metadata?: {
    /** Detected timestamp in the chunk */
    timestamp?: string;
    /** Log level if detected */
    logLevel?: string;
  };
}

export interface ChunkerOptions {
  /** Maximum characters per chunk (default: 1500) */
  maxChunkSize?: number;
  /** Minimum characters per chunk (default: 100) */
  minChunkSize?: number;
  /** Overlap between chunks in characters (default: 0) */
  overlap?: number;
}

const DEFAULT_OPTIONS: Required<ChunkerOptions> = {
  maxChunkSize: 1500,
  minChunkSize: 100,
  overlap: 0,
};

/**
 * Chunk text content semantically
 */
export function chunkText(content: string, options: ChunkerOptions = {}): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (!content || content.trim().length === 0) {
    return [];
  }

  // Try semantic chunking first
  const semanticChunks = semanticChunk(content, opts);
  
  if (semanticChunks.length > 0) {
    return semanticChunks;
  }

  // Fallback to character-based chunking
  return characterChunk(content, opts);
}

/**
 * Chunk log content (specialized for log formats)
 */
export function chunkLogs(content: string, options: ChunkerOptions = {}): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (!content || content.trim().length === 0) {
    return [];
  }

  // Split by log entry patterns (timestamps, log levels)
  const logEntryPattern = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}|\[\w+\]|\d{2}:\d{2}:\d{2})/gm;
  const lines = content.split('\n');
  
  const chunks: Chunk[] = [];
  let currentChunk = '';
  let currentStartOffset = 0;
  let chunkIndex = 0;
  let currentOffset = 0;
  let currentTimestamp: string | undefined;
  let currentLogLevel: string | undefined;

  for (const line of lines) {
    const lineWithNewline = line + '\n';
    const isNewEntry = logEntryPattern.test(line);
    logEntryPattern.lastIndex = 0; // Reset regex state

    // Extract timestamp and log level from new entries
    if (isNewEntry) {
      const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
      const logLevelMatch = line.match(/\[(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\]/i);
      
      if (timestampMatch) currentTimestamp = timestampMatch[1];
      if (logLevelMatch) currentLogLevel = logLevelMatch[1].toUpperCase();
    }

    // Check if adding this line would exceed max size
    if (currentChunk.length + lineWithNewline.length > opts.maxChunkSize && currentChunk.length >= opts.minChunkSize) {
      // Save current chunk
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex++,
        startOffset: currentStartOffset,
        endOffset: currentOffset,
        metadata: {
          timestamp: currentTimestamp,
          logLevel: currentLogLevel,
        },
      });
      currentChunk = '';
      currentStartOffset = currentOffset;
      currentTimestamp = undefined;
      currentLogLevel = undefined;
    }

    // Start new chunk on new log entry if current chunk is big enough
    if (isNewEntry && currentChunk.length >= opts.minChunkSize) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex++,
        startOffset: currentStartOffset,
        endOffset: currentOffset,
        metadata: {
          timestamp: currentTimestamp,
          logLevel: currentLogLevel,
        },
      });
      currentChunk = '';
      currentStartOffset = currentOffset;
    }

    currentChunk += lineWithNewline;
    currentOffset += lineWithNewline.length;
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      startOffset: currentStartOffset,
      endOffset: currentOffset,
      metadata: {
        timestamp: currentTimestamp,
        logLevel: currentLogLevel,
      },
    });
  }

  return chunks;
}

/**
 * Semantic chunking - split on paragraph boundaries
 */
function semanticChunk(content: string, opts: Required<ChunkerOptions>): Chunk[] {
  // Split on double newlines (paragraphs) or significant whitespace
  const paragraphs = content.split(/\n\s*\n/);
  
  if (paragraphs.length <= 1 && content.length > opts.maxChunkSize) {
    // No paragraph boundaries found, try single newlines
    return lineBasedChunk(content, opts);
  }

  const chunks: Chunk[] = [];
  let currentChunk = '';
  let currentStartOffset = 0;
  let chunkIndex = 0;
  let currentOffset = 0;

  for (const paragraph of paragraphs) {
    const paragraphWithSeparator = paragraph + '\n\n';
    
    // If single paragraph exceeds max, chunk it separately
    if (paragraph.length > opts.maxChunkSize) {
      // Save current accumulated chunk first
      if (currentChunk.trim().length >= opts.minChunkSize) {
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex++,
          startOffset: currentStartOffset,
          endOffset: currentOffset,
        });
        currentChunk = '';
        currentStartOffset = currentOffset;
      }
      
      // Chunk the large paragraph
      const subChunks = characterChunk(paragraph, opts);
      for (const subChunk of subChunks) {
        chunks.push({
          ...subChunk,
          index: chunkIndex++,
          startOffset: currentOffset + subChunk.startOffset,
          endOffset: currentOffset + subChunk.endOffset,
        });
      }
      currentOffset += paragraphWithSeparator.length;
      currentStartOffset = currentOffset;
      continue;
    }

    // Check if adding this paragraph would exceed max
    if (currentChunk.length + paragraphWithSeparator.length > opts.maxChunkSize) {
      if (currentChunk.trim().length >= opts.minChunkSize) {
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex++,
          startOffset: currentStartOffset,
          endOffset: currentOffset,
        });
      }
      currentChunk = '';
      currentStartOffset = currentOffset;
    }

    currentChunk += paragraphWithSeparator;
    currentOffset += paragraphWithSeparator.length;
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length >= opts.minChunkSize) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      startOffset: currentStartOffset,
      endOffset: currentOffset,
    });
  } else if (currentChunk.trim().length > 0 && chunks.length > 0) {
    // Append small remainder to last chunk
    const lastChunk = chunks[chunks.length - 1];
    lastChunk.content += '\n\n' + currentChunk.trim();
    lastChunk.endOffset = currentOffset;
  } else if (currentChunk.trim().length > 0) {
    // Single small chunk
    chunks.push({
      content: currentChunk.trim(),
      index: 0,
      startOffset: currentStartOffset,
      endOffset: currentOffset,
    });
  }

  return chunks;
}

/**
 * Line-based chunking - split on single newlines
 */
function lineBasedChunk(content: string, opts: Required<ChunkerOptions>): Chunk[] {
  const lines = content.split('\n');
  const chunks: Chunk[] = [];
  let currentChunk = '';
  let currentStartOffset = 0;
  let chunkIndex = 0;
  let currentOffset = 0;

  for (const line of lines) {
    const lineWithNewline = line + '\n';
    
    if (currentChunk.length + lineWithNewline.length > opts.maxChunkSize && currentChunk.length >= opts.minChunkSize) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex++,
        startOffset: currentStartOffset,
        endOffset: currentOffset,
      });
      currentChunk = '';
      currentStartOffset = currentOffset;
    }

    currentChunk += lineWithNewline;
    currentOffset += lineWithNewline.length;
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      startOffset: currentStartOffset,
      endOffset: currentOffset,
    });
  }

  return chunks;
}

/**
 * Character-based chunking - fallback when no semantic boundaries
 */
function characterChunk(content: string, opts: Required<ChunkerOptions>): Chunk[] {
  const chunks: Chunk[] = [];
  let offset = 0;
  let chunkIndex = 0;

  while (offset < content.length) {
    let endOffset = Math.min(offset + opts.maxChunkSize, content.length);
    
    // Try to break at word boundary
    if (endOffset < content.length) {
      const lastSpace = content.lastIndexOf(' ', endOffset);
      if (lastSpace > offset + opts.minChunkSize) {
        endOffset = lastSpace + 1;
      }
    }

    const chunkContent = content.slice(offset, endOffset).trim();
    if (chunkContent.length > 0) {
      chunks.push({
        content: chunkContent,
        index: chunkIndex++,
        startOffset: offset,
        endOffset: endOffset,
      });
    }

    offset = endOffset - opts.overlap;
    if (offset <= chunks[chunks.length - 1]?.startOffset) {
      offset = endOffset; // Prevent infinite loop
    }
  }

  return chunks;
}
