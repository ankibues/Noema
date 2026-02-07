/**
 * Normalizer - Converts chunks into canonical Observations
 * 
 * Purpose: Transform processed chunks into the Observation schema.
 * 
 * Responsibilities:
 * - Create valid Observation objects
 * - Extract entities (simple pattern matching for MVP)
 * - Generate key points (simple extraction for MVP)
 * - Enforce schema compliance
 * 
 * This component does NOT:
 * - Interpret meaning deeply
 * - Make decisions
 * - Update mental models
 * - Call external LLMs (MVP uses simple extraction)
 */

import type { Chunk } from "./chunker.js";
import type { SalienceResult } from "./salience.js";
import type { 
  ObservationType, 
  CreateObservationInput 
} from "../../../schemas/index.js";

export interface NormalizerInput {
  /** The chunk to normalize */
  chunk: Chunk;
  /** Salience calculation result */
  salience: SalienceResult;
  /** Type of observation */
  type: ObservationType;
  /** Sensor that produced this */
  sensor: string;
  /** Optional session ID */
  sessionId?: string;
  /** Optional run ID */
  runId?: string;
  /** Reference to raw evidence */
  rawRef?: string;
}

/**
 * Normalize a chunk into an Observation input
 */
export function normalizeToObservation(input: NormalizerInput): CreateObservationInput {
  const { chunk, salience, type, sensor, sessionId, runId, rawRef } = input;

  // Extract entities using simple pattern matching
  const entities = extractEntities(chunk.content);

  // Extract key points (first few significant lines/sentences)
  const keyPoints = extractKeyPoints(chunk.content);

  // Generate summary (truncated content for MVP)
  const summary = generateSummary(chunk.content, type);

  return {
    type,
    summary,
    key_points: keyPoints,
    entities,
    confidence: salience.score,
    raw_ref: rawRef,
    source: {
      sensor,
      session_id: sessionId,
      run_id: runId,
    },
  };
}

/**
 * Extract entities from content using pattern matching
 * MVP: Simple patterns for common entity types
 */
function extractEntities(content: string): string[] {
  const entities = new Set<string>();

  // File paths
  const pathPattern = /(?:\/[\w.-]+)+(?:\.\w+)?/g;
  const paths = content.match(pathPattern) || [];
  paths.slice(0, 5).forEach(p => entities.add(p));

  // URLs
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const urls = content.match(urlPattern) || [];
  urls.slice(0, 3).forEach(u => entities.add(u));

  // Error codes (HTTP status, error codes)
  const errorCodePattern = /\b(?:status|code|error)[:\s]+(\d{3,})\b/gi;
  let match;
  while ((match = errorCodePattern.exec(content)) !== null) {
    entities.add(`code:${match[1]}`);
  }

  // Function/method names (camelCase or snake_case followed by parens)
  const funcPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*(?:[A-Z][a-z]+)+|\w+_\w+)\s*\(/g;
  while ((match = funcPattern.exec(content)) !== null) {
    if (match[1].length > 3 && match[1].length < 50) {
      entities.add(`func:${match[1]}`);
    }
  }

  // Class/type names (PascalCase)
  const classPattern = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g;
  while ((match = classPattern.exec(content)) !== null) {
    if (match[1].length > 3 && match[1].length < 50) {
      entities.add(`type:${match[1]}`);
    }
  }

  // Environment variables
  const envPattern = /\b([A-Z][A-Z0-9_]{2,})\b/g;
  while ((match = envPattern.exec(content)) !== null) {
    // Filter common words that look like env vars
    const word = match[1];
    if (!['ERROR', 'WARNING', 'INFO', 'DEBUG', 'TRUE', 'FALSE', 'NULL', 'HTTP', 'POST', 'GET'].includes(word)) {
      entities.add(`env:${word}`);
    }
  }

  return Array.from(entities).slice(0, 10); // Limit to 10 entities
}

/**
 * Extract key points from content
 * MVP: First few non-empty, significant lines
 */
function extractKeyPoints(content: string): string[] {
  const lines = content.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 10) // Skip very short lines
    .filter(line => !line.match(/^[\s\-=*#]+$/)) // Skip decorative lines
    .filter(line => !line.match(/^\d+$/)); // Skip line numbers only

  const keyPoints: string[] = [];

  // Look for lines with important indicators
  const importantPatterns = [
    /error|exception|failed|failure/i,
    /warning|warn/i,
    /expected|actual|got|received/i,
    /timeout|connection/i,
    /success|completed|passed/i,
  ];

  // First, add lines that match important patterns
  for (const line of lines) {
    if (keyPoints.length >= 5) break;
    
    for (const pattern of importantPatterns) {
      if (pattern.test(line) && !keyPoints.includes(line)) {
        keyPoints.push(truncateLine(line, 200));
        break;
      }
    }
  }

  // Fill remaining slots with first lines
  for (const line of lines) {
    if (keyPoints.length >= 5) break;
    if (!keyPoints.includes(line)) {
      keyPoints.push(truncateLine(line, 200));
    }
  }

  return keyPoints;
}

/**
 * Generate a summary from content
 * MVP: Truncated first meaningful content
 */
function generateSummary(content: string, type: ObservationType): string {
  const maxLength = 300;
  
  // Get first few meaningful lines
  const lines = content.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 5)
    .slice(0, 5);

  let summary = lines.join(' ').replace(/\s+/g, ' ').trim();

  // Add type prefix for context
  const typePrefix = {
    log: '[Log]',
    text: '[Text]',
    screenshot: '[Screenshot]',
    video_frame: '[Video]',
    audio_transcript: '[Audio]',
    human: '[Human]',
    test_result: '[Test]',
  }[type] || '';

  summary = `${typePrefix} ${summary}`;

  if (summary.length > maxLength) {
    summary = summary.substring(0, maxLength - 3) + '...';
  }

  return summary;
}

/**
 * Truncate a line to max length
 */
function truncateLine(line: string, maxLength: number): string {
  if (line.length <= maxLength) return line;
  return line.substring(0, maxLength - 3) + '...';
}
