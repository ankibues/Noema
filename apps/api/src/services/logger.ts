/**
 * File-Based Logger
 * 
 * Captures all console output to a log file in data/logs/.
 * This ensures full run history is available even when terminal truncates.
 * 
 * Usage: Call `initLogger()` at server startup.
 * Logs are written to: data/logs/noema-YYYY-MM-DD.log
 * 
 * This component does NOT:
 * - Make decisions
 * - Update beliefs
 * - Affect any cognitive processes
 */

import { mkdirSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const LOG_DIR = join(process.cwd(), "data", "logs");

let logFilePath: string | null = null;
let originalConsoleLog: typeof console.log;
let originalConsoleError: typeof console.error;
let originalConsoleWarn: typeof console.warn;

/**
 * Initialize file-based logging.
 * Hooks into console.log, console.error, console.warn and mirrors output to a file.
 */
export function initLogger(): string {
  // Create log directory
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }

  // Create log file with date-based name
  const date = new Date().toISOString().split("T")[0];
  logFilePath = join(LOG_DIR, `noema-${date}.log`);

  // Save original console methods
  originalConsoleLog = console.log;
  originalConsoleError = console.error;
  originalConsoleWarn = console.warn;

  // Intercept console.log
  console.log = (...args: unknown[]) => {
    originalConsoleLog.apply(console, args);
    writeToFile("INFO", args);
  };

  // Intercept console.error
  console.error = (...args: unknown[]) => {
    originalConsoleError.apply(console, args);
    writeToFile("ERROR", args);
  };

  // Intercept console.warn
  console.warn = (...args: unknown[]) => {
    originalConsoleWarn.apply(console, args);
    writeToFile("WARN", args);
  };

  // Write startup marker
  const startupMsg = `\n${"=".repeat(70)}\n  NOEMA Session Started: ${new Date().toISOString()}\n${"=".repeat(70)}\n`;
  try {
    appendFileSync(logFilePath, startupMsg);
  } catch {
    // Ignore write errors
  }

  return logFilePath;
}

/**
 * Write a log entry to the file.
 */
function writeToFile(level: string, args: unknown[]): void {
  if (!logFilePath) return;

  try {
    const timestamp = new Date().toISOString().substring(11, 23); // HH:mm:ss.SSS
    const message = args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        if (arg instanceof Error) return `${arg.message}\n${arg.stack}`;
        try {
          return JSON.stringify(arg, null, 0);
        } catch {
          return String(arg);
        }
      })
      .join(" ");

    const line = `[${timestamp}] [${level.padEnd(5)}] ${message}\n`;
    appendFileSync(logFilePath, line);
  } catch {
    // Never let logging errors break the application
  }
}

/**
 * Get the current log file path.
 */
export function getLogFilePath(): string | null {
  return logFilePath;
}
