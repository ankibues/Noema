/**
 * NOEMA API Server
 * 
 * HTTP API for NOEMA's cognitive system.
 * 
 * Endpoints:
 * - GET  /health            - Health check
 * - POST /ingest            - Ingest raw content
 * - POST /qa/run            - Start a QA run
 * - GET  /run/:id/state     - Get run state
 * - GET  /run/:id/stream    - SSE stream for live events
 * - GET  /run/:id/report    - Get QA report
 * - GET  /runs              - List all runs
 * - GET  /metrics           - Get run metrics
 * - GET  /identity          - Get NOEMA identity
 * - GET  /improvement       - Get improvement analysis
 */

import { config } from "dotenv";
config(); // Load .env before anything else

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { initLogger, getLogFilePath } from "../services/logger.js";
import { getSensorHub, type IngestInput } from "../services/sensing/index.js";
import { initializeStorage, getMentalModelRepository, getExperienceRepository } from "../storage/index.js";
import { getNarrationEmitter, type NarrationEvent } from "../services/narration/index.js";
import { startQARun, getRunState, getAllRunStates, stopRun, triggerOptimization, type QATaskInput } from "./run_controller.js";
import { loadIdentity, refreshIdentity, formatIdentityStatement, getAge } from "../services/identity/index.js";
import {
  buildRunTimeline,
  generateReflection,
  generateQAReport,
  getAllRunMetrics,
  analyzeImprovement,
} from "../services/reflection/index.js";

const PORT = parseInt(process.env.NOEMA_API_PORT || "8200", 10);

interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

// =============================================================================
// Request Parsing
// =============================================================================

async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: ApiResponse): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function parseUrl(url: string): { path: string; params: Record<string, string> } {
  const [path, query] = url.split("?");
  const params: Record<string, string> = {};
  if (query) {
    for (const part of query.split("&")) {
      const [key, value] = part.split("=");
      params[decodeURIComponent(key)] = decodeURIComponent(value || "");
    }
  }
  return { path, params };
}

// =============================================================================
// Route Matching
// =============================================================================

function matchRoute(path: string, pattern: string): Record<string, string> | null {
  const pathParts = path.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);

  if (pathParts.length !== patternParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

// =============================================================================
// Handlers
// =============================================================================

function handleHealth(res: ServerResponse): void {
  sendJson(res, 200, { success: true, data: { status: "ok" } });
}

async function handleIngest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseBody(req) as Record<string, unknown>;
  const inputType = body.type as string;

  if (!["text", "log", "screenshot"].includes(inputType)) {
    sendJson(res, 400, { success: false, error: "Invalid input type" });
    return;
  }

  let ingestInput: IngestInput;
  if (inputType === "text" || inputType === "log") {
    const content = body.content as string;
    if (!content) {
      sendJson(res, 400, { success: false, error: "Missing 'content'" });
      return;
    }
    ingestInput = { type: inputType, content, sessionId: body.sessionId as string | undefined };
  } else {
    const base64 = body.base64 as string | undefined;
    const filePath = body.filePath as string | undefined;
    if (!base64 && !filePath) {
      sendJson(res, 400, { success: false, error: "Screenshot requires 'base64' or 'filePath'" });
      return;
    }
    ingestInput = { type: "screenshot", base64, filePath, sessionId: body.sessionId as string | undefined };
  }

  const cogneeEnabled = !!(process.env.OPENAI_API_KEY);
  const sensorHub = getSensorHub({ cogneeEnabled });
  const result = await sensorHub.ingest(ingestInput);

  sendJson(res, 200, {
    success: true,
    data: {
      observationIds: result.observationIds,
      evidenceIds: result.evidenceIds,
      chunkCount: result.chunkCount,
      inputType: result.inputType,
    },
  });
}

async function handleStartRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseBody(req) as Record<string, unknown>;

  const rawUrl = ((body.url as string) || "").trim();
  const goal = ((body.goal as string) || "").trim();

  // Validate goal
  if (!goal) {
    sendJson(res, 400, {
      success: false,
      error: "Missing 'goal'. Please describe what you want NOEMA to test.",
    });
    return;
  }

  // Validate URL
  const urlValidation = validateUrl(rawUrl);
  if (!urlValidation.valid) {
    sendJson(res, 400, {
      success: false,
      error: urlValidation.message,
    });
    return;
  }

  const input: QATaskInput = {
    goal,
    url: urlValidation.url!, // cleaned URL
    critical_scenarios: body.critical_scenarios as string[] | undefined,
    max_cycles_per_step: body.max_cycles_per_step as number | undefined,
    max_total_actions: body.max_total_actions as number | undefined,
    mock_llm: body.mock_llm as boolean | undefined,
    visible_browser: body.visible_browser as boolean | undefined,
    enable_optimization: body.enable_optimization as boolean | undefined,
  };

  const runId = startQARun(input);

  sendJson(res, 200, {
    success: true,
    data: { run_id: runId, status: "started" },
  });
}

// =============================================================================
// URL Validation
// =============================================================================

interface UrlValidationResult {
  valid: boolean;
  url?: string;
  message?: string;
}

/**
 * Validate and clean a URL before starting a run.
 * Catches common user errors:
 * - Empty URL
 * - Missing protocol
 * - Concatenated URLs (e.g., "https://a.com/https://b.com")
 * - Invalid URL format
 */
function validateUrl(rawUrl: string): UrlValidationResult {
  if (!rawUrl) {
    return {
      valid: false,
      message: "Missing 'url'. Please provide the target URL (e.g., https://example.com).",
    };
  }

  // Check for concatenated URLs — a URL containing more than one "http://" or "https://"
  const httpCount = (rawUrl.match(/https?:\/\//g) || []).length;
  if (httpCount > 1) {
    // Try to extract the first valid URL
    const firstUrl = rawUrl.match(/^(https?:\/\/[^\s]+?)(?=https?:\/\/)/)?.[1];
    const secondUrl = rawUrl.match(/https?:\/\/[^\s]+$/)?.[0];
    return {
      valid: false,
      message: `URL appears to contain multiple URLs concatenated together. ` +
        `Found ${httpCount} URLs. Did you mean "${firstUrl || rawUrl.split("http")[0]}"? ` +
        `${secondUrl ? `Or perhaps "${secondUrl}"?` : ""} ` +
        `Please provide a single URL.`,
    };
  }

  // Add protocol if missing
  let url = rawUrl;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  // Validate URL format
  try {
    const parsed = new URL(url);

    // Must have a valid hostname (not empty, has at least one dot or is localhost)
    if (!parsed.hostname || (!parsed.hostname.includes(".") && parsed.hostname !== "localhost")) {
      return {
        valid: false,
        message: `Invalid URL: "${rawUrl}" — hostname "${parsed.hostname}" doesn't look like a valid domain. ` +
          `Please provide a full URL like https://example.com.`,
      };
    }

    // Warn about common test URLs
    if (parsed.hostname === "example.com") {
      // Allow it but it's usually a placeholder
      console.log("[URLValidation] Note: example.com is a placeholder — make sure this is intentional");
    }

    return { valid: true, url: parsed.toString() };
  } catch {
    return {
      valid: false,
      message: `Invalid URL format: "${rawUrl}". Please provide a valid URL (e.g., https://www.saucedemo.com/).`,
    };
  }
}

function handleStopRun(res: ServerResponse, runId: string): void {
  const stopped = stopRun(runId);
  if (stopped) {
    sendJson(res, 200, { success: true, data: { run_id: runId, status: "stopped" } });
  } else {
    sendJson(res, 404, { success: false, error: "Run not found or already completed" });
  }
}

async function handleOptimize(res: ServerResponse, runId: string): Promise<void> {
  const result = await triggerOptimization(runId);
  if (result.started) {
    sendJson(res, 200, { success: true, data: { run_id: runId, message: result.message } });
  } else {
    sendJson(res, 400, { success: false, error: result.message });
  }
}

function handleRunState(res: ServerResponse, runId: string): void {
  const state = getRunState(runId);
  if (!state) {
    sendJson(res, 404, { success: false, error: "Run not found" });
    return;
  }
  // Compute live elapsed for running runs
  const data = { ...state };
  if (data.status === "running" && data.started_at) {
    data.elapsed_ms = Date.now() - new Date(data.started_at).getTime();
  }
  sendJson(res, 200, { success: true, data });
}

/**
 * SSE stream for live narration events.
 */
function handleRunStream(res: ServerResponse, runId: string, params: Record<string, string>): void {
  const narration = getNarrationEmitter();
  const sinceSeq = parseInt(params.since || "0", 10);

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Send any events that already happened
  const existing = narration.getEventsSince(sinceSeq, runId);
  for (const event of existing) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  // Subscribe to new events
  const unsubscribe = narration.onRun(runId, (event: NarrationEvent) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // Connection closed
      unsubscribe();
    }
  });

  // Also subscribe to global events (system, errors)
  const unsubGlobal = narration.onAll((event: NarrationEvent) => {
    if (event.run_id === runId || event.type === "system") {
      // Already sent by run-specific subscription if run_id matches
      if (!event.run_id) {
        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          unsubGlobal();
        }
      }
    }
  });

  // Keep connection alive
  const keepAlive = setInterval(() => {
    try {
      res.write(`:keepalive\n\n`);
    } catch {
      clearInterval(keepAlive);
    }
  }, 15000);

  // Cleanup on close
  res.on("close", () => {
    unsubscribe();
    unsubGlobal();
    clearInterval(keepAlive);
  });
}

async function handleRunReport(res: ServerResponse, runId: string): Promise<void> {
  const state = getRunState(runId);
  if (!state) {
    sendJson(res, 404, { success: false, error: "Run not found" });
    return;
  }

  // Check if there's a report in the narration history
  const narration = getNarrationEmitter();
  const events = narration.getHistory(runId);
  const completedEvent = events.find((e) => e.type === "run_completed");

  if (completedEvent?.data?.report) {
    sendJson(res, 200, { success: true, data: completedEvent.data.report });
    return;
  }

  // If run is still running or no report, generate one from current state
  try {
    const timeline = await buildRunTimeline(runId);
    const allMetrics = await getAllRunMetrics();
    const runMetrics = allMetrics.find((m) => m.run_id === runId);

    let improvement;
    if (runMetrics) {
      improvement = await analyzeImprovement(runMetrics);
    } else {
      improvement = {
        current_run_id: runId,
        compared_to_run_ids: [],
        signals: [],
        conclusion: "Metrics not yet recorded.",
        has_improved: false,
        timestamp: new Date().toISOString(),
      };
    }

    const reflection = generateReflection(runId, timeline, improvement);
    const identity = await refreshIdentity();
    const report = generateQAReport(
      runId,
      state.task.goal,
      timeline,
      reflection,
      improvement,
      formatIdentityStatement(identity),
      state.task.url,
      state.plan,
      state.video_path
    );

    sendJson(res, 200, { success: true, data: report });
  } catch (error) {
    sendJson(res, 500, { success: false, error: (error as Error).message });
  }
}

function handleListRuns(res: ServerResponse): void {
  const runs = getAllRunStates();
  sendJson(res, 200, { success: true, data: runs });
}

async function handleMetrics(res: ServerResponse): Promise<void> {
  const metrics = await getAllRunMetrics();
  sendJson(res, 200, { success: true, data: metrics });
}

async function handleIdentity(res: ServerResponse): Promise<void> {
  const identity = await refreshIdentity();
  sendJson(res, 200, {
    success: true,
    data: {
      ...identity,
      age: getAge(identity),
      statement: formatIdentityStatement(identity),
    },
  });
}

async function handleImprovement(res: ServerResponse): Promise<void> {
  const metrics = await getAllRunMetrics();
  if (metrics.length === 0) {
    sendJson(res, 200, {
      success: true,
      data: { message: "No runs recorded yet." },
    });
    return;
  }

  const latest = metrics[metrics.length - 1];
  const improvement = await analyzeImprovement(latest);
  sendJson(res, 200, { success: true, data: improvement });
}

async function handleNarrationHistory(res: ServerResponse, runId: string): Promise<void> {
  const narration = getNarrationEmitter();
  const events = narration.getHistory(runId);
  sendJson(res, 200, { success: true, data: events });
}

// =============================================================================
// Mental Models & Experiences
// =============================================================================

async function handleModels(res: ServerResponse): Promise<void> {
  try {
    const repo = getMentalModelRepository();
    const models = await repo.list();

    // Filter out clearly irrelevant/stale demo models
    const IRRELEVANT_KEYWORDS = [
      "database connection",
      "database health",
      "demo mental model",
      "connection pool",
      "connection timeout",
    ];

    const filtered = models.filter((m) => {
      const titleLower = m.title.toLowerCase();
      return !IRRELEVANT_KEYWORDS.some((kw) => titleLower.includes(kw));
    });

    // Truncate verbose summaries (e.g., raw log entries) for display
    const truncate = (s: string, maxLen = 200) => {
      if (!s || s.length <= maxLen) return s;
      // Strip raw log timestamps
      const cleaned = s.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*\[?\w*\]?\s*/g, "").trim();
      return cleaned.length > maxLen ? cleaned.substring(0, maxLen) + "..." : cleaned;
    };

    sendJson(res, 200, {
      success: true,
      data: filtered.map((m) => ({
        model_id: m.model_id,
        title: m.title,
        summary: truncate(m.summary),
        confidence: m.confidence,
        status: m.status,
        domain: m.domain,
        evidence_count: m.evidence_ids?.length || 0,
        created_at: m.created_at,
        updated_at: m.last_updated,
      })),
    });
  } catch {
    sendJson(res, 200, { success: true, data: [] });
  }
}

async function handleExperiences(res: ServerResponse): Promise<void> {
  try {
    const repo = getExperienceRepository();
    const experiences = await repo.list();

    // Deduplicate by statement (keep the one with highest confidence or most source runs)
    const deduped = new Map<string, typeof experiences[0]>();
    for (const e of experiences) {
      const key = e.statement.toLowerCase().trim();
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, e);
      } else {
        // Keep the one with more source runs or higher confidence
        const existingRuns = existing.source_runs?.length || 0;
        const newRuns = e.source_runs?.length || 0;
        if (newRuns > existingRuns || (newRuns === existingRuns && e.confidence > existing.confidence)) {
          deduped.set(key, e);
        }
      }
    }

    const uniqueExperiences = Array.from(deduped.values());

    sendJson(res, 200, {
      success: true,
      data: uniqueExperiences.map((e) => ({
        experience_id: e.experience_id,
        statement: e.statement,
        confidence: e.confidence,
        source_task: e.scope?.join(", ") || "",
        times_applied: e.source_runs?.length || 0,
        created_at: e.created_at,
      })),
    });
  } catch {
    sendJson(res, 200, { success: true, data: [] });
  }
}

// =============================================================================
// Static Evidence Files (Screenshots & Videos)
// =============================================================================

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};

/**
 * Serve static evidence files (screenshots and videos).
 * Route: GET /evidence/screenshots/:filename
 * Route: GET /evidence/videos/:filename
 */
async function handleEvidenceFile(res: ServerResponse, subDir: string, filename: string): Promise<void> {
  // Sanitize filename to prevent directory traversal
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!sanitized || sanitized.includes("..")) {
    sendJson(res, 400, { success: false, error: "Invalid filename" });
    return;
  }

  const baseDir = subDir === "screenshots" ? "./data/screenshots" : "./data/videos";
  const filePath = join(baseDir, sanitized);

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendJson(res, 404, { success: false, error: "File not found" });
      return;
    }

    const ext = extname(sanitized).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    const fileData = await readFile(filePath);

    res.writeHead(200, {
      "Content-Type": mime,
      "Content-Length": fileData.length.toString(),
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    });
    res.end(fileData);
  } catch {
    sendJson(res, 404, { success: false, error: "File not found" });
  }
}

// =============================================================================
// Router
// =============================================================================

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { path, params: queryParams } = parseUrl(req.url || "/");
  const method = req.method || "GET";

  // CORS preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // Static routes
    if (path === "/health" && method === "GET") {
      return handleHealth(res);
    }
    if (path === "/ingest" && method === "POST") {
      return await handleIngest(req, res);
    }
    if (path === "/qa/run" && method === "POST") {
      return await handleStartRun(req, res);
    }
    if (path === "/runs" && method === "GET") {
      return handleListRuns(res);
    }
    if (path === "/metrics" && method === "GET") {
      return await handleMetrics(res);
    }
    if (path === "/identity" && method === "GET") {
      return await handleIdentity(res);
    }
    if (path === "/improvement" && method === "GET") {
      return await handleImprovement(res);
    }
    if (path === "/models" && method === "GET") {
      return await handleModels(res);
    }
    if (path === "/experiences" && method === "GET") {
      return await handleExperiences(res);
    }

    // Parameterized routes
    let routeParams: Record<string, string> | null;

    routeParams = matchRoute(path, "/run/:id/stop");
    if (routeParams && method === "POST") {
      return handleStopRun(res, routeParams.id);
    }

    routeParams = matchRoute(path, "/run/:id/optimize");
    if (routeParams && method === "POST") {
      return await handleOptimize(res, routeParams.id);
    }

    routeParams = matchRoute(path, "/run/:id/stream");
    if (routeParams && method === "GET") {
      return handleRunStream(res, routeParams.id, queryParams);
    }

    routeParams = matchRoute(path, "/run/:id/state");
    if (routeParams && method === "GET") {
      return handleRunState(res, routeParams.id);
    }

    routeParams = matchRoute(path, "/run/:id/report");
    if (routeParams && method === "GET") {
      return await handleRunReport(res, routeParams.id);
    }

    routeParams = matchRoute(path, "/run/:id/events");
    if (routeParams && method === "GET") {
      return await handleNarrationHistory(res, routeParams.id);
    }

    // Evidence file routes (screenshots and videos)
    routeParams = matchRoute(path, "/evidence/screenshots/:filename");
    if (routeParams && method === "GET") {
      return await handleEvidenceFile(res, "screenshots", routeParams.filename);
    }

    // Also serve screenshots at /screenshots/:filename for convenience
    routeParams = matchRoute(path, "/screenshots/:filename");
    if (routeParams && method === "GET") {
      return await handleEvidenceFile(res, "screenshots", routeParams.filename);
    }

    routeParams = matchRoute(path, "/evidence/videos/:filename");
    if (routeParams && method === "GET") {
      return await handleEvidenceFile(res, "videos", routeParams.filename);
    }

    sendJson(res, 404, { success: false, error: "Not found" });
  } catch (error) {
    console.error("[API] Request error:", error);
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

// =============================================================================
// Data Hygiene
// =============================================================================

/**
 * Remove stale demo/test artifacts from persistent storage.
 * This prevents irrelevant data (from old Phase 4 demos, mock runs, etc.)
 * from showing up in the UI.
 */
async function cleanupStaleData(): Promise<void> {
  try {
    // Clean up irrelevant mental models
    const modelRepo = getMentalModelRepository();
    const models = await modelRepo.list();
    const STALE_KEYWORDS = [
      "database connection",
      "database health",
      "demo mental model",
      "connection pool",
    ];
    let removedModels = 0;
    for (const model of models) {
      const titleLower = model.title.toLowerCase();
      if (STALE_KEYWORDS.some((kw) => titleLower.includes(kw))) {
        await modelRepo.delete(model.model_id);
        removedModels++;
      }
    }

    // Clean up duplicate experiences (keep first, remove duplicates)
    const expRepo = getExperienceRepository();
    const experiences = await expRepo.list();
    const seen = new Set<string>();
    let removedExperiences = 0;
    for (const exp of experiences) {
      const key = exp.statement.toLowerCase().trim();
      if (seen.has(key)) {
        await expRepo.delete(exp.experience_id);
        removedExperiences++;
      } else {
        seen.add(key);
      }
    }

    if (removedModels > 0 || removedExperiences > 0) {
      console.log(`[DataHygiene] Cleaned up ${removedModels} stale model(s) and ${removedExperiences} duplicate experience(s)`);
    }
  } catch (error) {
    console.warn("[DataHygiene] Cleanup failed (non-critical):", error);
  }
}

// =============================================================================
// Server Startup
// =============================================================================

export async function startServer(): Promise<void> {
  // Initialize file-based logging (mirrors all console output to data/logs/)
  const logFile = initLogger();
  console.log(`Logging to: ${logFile}`);

  console.log("Initializing storage...");
  await initializeStorage();
  console.log("Storage initialized");

  // Data hygiene: remove stale demo artifacts that aren't QA-relevant
  await cleanupStaleData();

  // Load identity on startup
  const identity = await loadIdentity();
  console.log(`NOEMA instance: ${identity.id.substring(0, 8)}... (age: ${getAge(identity)})`);

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error("[API] Unhandled error:", error);
      sendJson(res, 500, { success: false, error: "Internal server error" });
    });
  });

  server.listen(PORT, () => {
    const hasGeminiKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    const hasCreds = !!(process.env.TEST_USERNAME || process.env.TEST_PASSWORD);
    const geminiModel = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
    const visionModel = process.env.GEMINI_VISION_MODEL || "gemini-3-pro-image-preview";
    const cogneeUrl = process.env.COGNEE_SERVICE_URL || "http://localhost:8100";

    console.log(`\nNOEMA API server running on http://localhost:${PORT}`);
    console.log("─────────────────────────────────────────");
    console.log(`LLM:    ${hasGeminiKey ? `✓ Gemini 3 (${geminiModel})` : "⚠ No API key — will use mock LLM"}`);
    console.log(`        ${hasGeminiKey ? "Real reasoning enabled" : "Set GEMINI_API_KEY in apps/api/.env for real mode"}`);
    console.log(`Vision: ${hasGeminiKey ? `✓ Gemini Vision (${visionModel})` : "○ Disabled (no API key)"}`);
    console.log(`        ${hasGeminiKey ? "Screenshot analysis active — pages understood visually" : "Screenshots stored as evidence only"}`);
    console.log(`Cognee: ${hasOpenAIKey ? `✓ Enabled (${cogneeUrl})` : "○ Disabled (no OPENAI_API_KEY)"}`);
    console.log(`        ${hasOpenAIKey ? "Semantic memory active — start Cognee service separately" : "NOEMA will use its own storage and belief graph"}`);
    console.log(`Creds:  ${hasCreds ? "✓ Test credentials loaded (TEST_USERNAME/TEST_PASSWORD)" : "○ No test credentials (set TEST_USERNAME + TEST_PASSWORD in .env)"}`);
    console.log(`        ${hasCreds ? "Credentials injected into decision context — never shown in narration" : "Login tests will attempt without credentials"}`);
    console.log("─────────────────────────────────────────");
    console.log("Endpoints:");
    console.log("  GET  /health             Health check");
    console.log("  GET  /identity           NOEMA identity & lifetime");
    console.log("  POST /qa/run             Start a QA run");
    console.log("  POST /run/:id/stop       Stop a running run");
    console.log("  GET  /runs               List all runs");
    console.log("  GET  /run/:id/state      Run state");
    console.log("  GET  /run/:id/stream     Live narration (SSE)");
    console.log("  GET  /run/:id/events     Narration history");
    console.log("  GET  /run/:id/report     QA report");
    console.log("  GET  /metrics            Run metrics");
    console.log("  GET  /improvement        Improvement analysis");
    console.log("  POST /ingest             Ingest content");
    console.log("  GET  /evidence/screenshots/:file  Serve screenshot");
    console.log("  GET  /evidence/videos/:file       Serve video recording");
    console.log("─────────────────────────────────────────");
    const logPath = getLogFilePath();
    if (logPath) {
      console.log(`Logs:   ${logPath}`);
    }
    console.log("─────────────────────────────────────────\n");
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(console.error);
}
