/**
 * SalienceCalculator - Assigns initial salience scores to content
 * 
 * Purpose: Determine how "important" a piece of content is.
 * 
 * MVP Implementation (Rule-based):
 * - Errors/exceptions/failures → high salience (0.8-1.0)
 * - Warnings → medium salience (0.5-0.7)
 * - Info/debug → low salience (0.1-0.4)
 * 
 * This component does NOT:
 * - Learn salience from experience (future phase)
 * - Make decisions based on salience
 * - Interpret meaning beyond pattern matching
 */

import type { Chunk } from "./chunker.js";

export interface SalienceResult {
  /** Salience score 0.0 - 1.0 */
  score: number;
  /** Rule that matched (for auditability) */
  rule: string;
  /** Matched patterns (for debugging) */
  matchedPatterns: string[];
}

/**
 * Salience rules with patterns and scores
 */
interface SalienceRule {
  name: string;
  patterns: RegExp[];
  score: number;
  priority: number; // Higher priority rules override lower
}

/**
 * Rule-based salience rules (MVP)
 * Ordered by priority (highest first)
 */
const SALIENCE_RULES: SalienceRule[] = [
  // Critical errors - highest salience
  {
    name: "critical_error",
    patterns: [
      /\b(fatal|critical|crash|panic|segfault|oom|out of memory)\b/i,
      /\bException\b.*\bthrown\b/i,
      /\bstack\s*trace\b/i,
      /\bcore\s*dump(ed)?\b/i,
    ],
    score: 1.0,
    priority: 100,
  },
  // Errors
  {
    name: "error",
    patterns: [
      /\b(error|err|failed|failure|exception)\b/i,
      /\[ERROR\]/i,
      /\bERROR:/i,
      /\bstatus[:\s]+5\d{2}\b/i, // HTTP 5xx errors
      /\bstatus[:\s]+4\d{2}\b/i, // HTTP 4xx errors
      /\btimeout\b/i,
      /\bconnection\s+(refused|reset|closed)\b/i,
    ],
    score: 0.9,
    priority: 90,
  },
  // Test failures
  {
    name: "test_failure",
    patterns: [
      /\b(test|spec|assertion)\s+(failed|failure)\b/i,
      /\bexpected\b.*\bbut\s+(got|received|was)\b/i,
      /\bAssertionError\b/i,
      /\bFAIL(ED|URE)?\b/,
    ],
    score: 0.85,
    priority: 85,
  },
  // Warnings
  {
    name: "warning",
    patterns: [
      /\b(warning|warn)\b/i,
      /\[WARN(ING)?\]/i,
      /\bWARN(ING)?:/i,
      /\bdeprecated\b/i,
      /\bretry(ing)?\b/i,
    ],
    score: 0.6,
    priority: 60,
  },
  // User-visible changes
  {
    name: "user_visible",
    patterns: [
      /\b(displayed?|shown?|visible|rendered)\b/i,
      /\bUI\s+(error|change|update)\b/i,
      /\bmodal\b/i,
      /\bnotification\b/i,
      /\balert\b/i,
    ],
    score: 0.7,
    priority: 70,
  },
  // State changes
  {
    name: "state_change",
    patterns: [
      /\b(created|updated|deleted|modified|changed)\b/i,
      /\bstate\s+(transition|change)\b/i,
      /\bstatus\s+(changed|updated)\b/i,
    ],
    score: 0.5,
    priority: 50,
  },
  // Success indicators
  {
    name: "success",
    patterns: [
      /\b(success|succeeded|completed|passed|ok)\b/i,
      /\[OK\]/i,
      /\bstatus[:\s]+2\d{2}\b/i, // HTTP 2xx success
      /\bPASS(ED)?\b/,
    ],
    score: 0.4,
    priority: 40,
  },
  // Info level
  {
    name: "info",
    patterns: [
      /\binfo\b/i,
      /\[INFO\]/i,
      /\bINFO:/i,
      /\bstarting\b/i,
      /\binitialized?\b/i,
    ],
    score: 0.3,
    priority: 30,
  },
  // Debug/verbose
  {
    name: "debug",
    patterns: [
      /\b(debug|trace|verbose)\b/i,
      /\[DEBUG\]/i,
      /\[TRACE\]/i,
      /\bDEBUG:/i,
    ],
    score: 0.1,
    priority: 10,
  },
];

/**
 * Default salience for content that matches no rules
 */
const DEFAULT_SALIENCE: SalienceResult = {
  score: 0.3,
  rule: "default",
  matchedPatterns: [],
};

/**
 * Calculate salience for a text chunk
 */
export function calculateSalience(content: string): SalienceResult {
  if (!content || content.trim().length === 0) {
    return { ...DEFAULT_SALIENCE, score: 0.1 };
  }

  let bestMatch: SalienceResult | null = null;
  let highestPriority = -1;
  const allMatchedPatterns: string[] = [];

  for (const rule of SALIENCE_RULES) {
    const matchedPatterns: string[] = [];
    
    for (const pattern of rule.patterns) {
      if (pattern.test(content)) {
        matchedPatterns.push(pattern.source);
      }
    }

    if (matchedPatterns.length > 0) {
      allMatchedPatterns.push(...matchedPatterns);
      
      if (rule.priority > highestPriority) {
        highestPriority = rule.priority;
        bestMatch = {
          score: rule.score,
          rule: rule.name,
          matchedPatterns,
        };
      }
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  return DEFAULT_SALIENCE;
}

/**
 * Calculate salience for a chunk (with metadata awareness)
 */
export function calculateChunkSalience(chunk: Chunk): SalienceResult {
  // Start with content-based salience
  const contentSalience = calculateSalience(chunk.content);

  // Boost salience if log level metadata indicates importance
  if (chunk.metadata?.logLevel) {
    const level = chunk.metadata.logLevel.toUpperCase();
    
    if (level === "ERROR" || level === "FATAL" || level === "CRITICAL") {
      return {
        score: Math.max(contentSalience.score, 0.9),
        rule: contentSalience.rule === "default" ? "log_level_error" : contentSalience.rule,
        matchedPatterns: [...contentSalience.matchedPatterns, `logLevel:${level}`],
      };
    }
    
    if (level === "WARN" || level === "WARNING") {
      return {
        score: Math.max(contentSalience.score, 0.6),
        rule: contentSalience.rule === "default" ? "log_level_warning" : contentSalience.rule,
        matchedPatterns: [...contentSalience.matchedPatterns, `logLevel:${level}`],
      };
    }
    
    if (level === "DEBUG" || level === "TRACE") {
      return {
        score: Math.min(contentSalience.score, 0.2),
        rule: contentSalience.rule === "default" ? "log_level_debug" : contentSalience.rule,
        matchedPatterns: [...contentSalience.matchedPatterns, `logLevel:${level}`],
      };
    }
  }

  return contentSalience;
}
