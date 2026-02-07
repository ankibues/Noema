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
import { getSensorHub, type IngestInput } from "../services/sensing/index.js";
import { initializeStorage } from "../storage/index.js";
import { getNarrationEmitter, type NarrationEvent } from "../services/narration/index.js";
import { startQARun, getRunState, getAllRunStates, type QATaskInput } from "./run_controller.js";
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

  const sensorHub = getSensorHub({ cogneeEnabled: false });
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

  const input: QATaskInput = {
    goal: (body.goal as string) || "General QA task",
    url: (body.url as string) || "https://example.com",
    critical_scenarios: body.critical_scenarios as string[] | undefined,
    max_cycles: body.max_cycles as number | undefined,
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

function handleRunState(res: ServerResponse, runId: string): void {
  const state = getRunState(runId);
  if (!state) {
    sendJson(res, 404, { success: false, error: "Run not found" });
    return;
  }
  sendJson(res, 200, { success: true, data: state });
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
      formatIdentityStatement(identity)
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

    // Parameterized routes
    let routeParams: Record<string, string> | null;

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
// Server Startup
// =============================================================================

export async function startServer(): Promise<void> {
  console.log("Initializing storage...");
  await initializeStorage();
  console.log("Storage initialized");

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
    const geminiModel = process.env.GEMINI_MODEL || "gemini-2.0-flash";

    console.log(`\nNOEMA API server running on http://localhost:${PORT}`);
    console.log("─────────────────────────────────────────");
    console.log(`LLM:   ${hasGeminiKey ? `✓ Gemini (${geminiModel})` : "⚠ No API key — will use mock LLM"}`);
    console.log(`       ${hasGeminiKey ? "Real reasoning enabled" : "Set GEMINI_API_KEY in apps/api/.env for real mode"}`);
    console.log("─────────────────────────────────────────");
    console.log("Endpoints:");
    console.log("  GET  /health             Health check");
    console.log("  GET  /identity           NOEMA identity & lifetime");
    console.log("  POST /qa/run             Start a QA run");
    console.log("  GET  /runs               List all runs");
    console.log("  GET  /run/:id/state      Run state");
    console.log("  GET  /run/:id/stream     Live narration (SSE)");
    console.log("  GET  /run/:id/events     Narration history");
    console.log("  GET  /run/:id/report     QA report");
    console.log("  GET  /metrics            Run metrics");
    console.log("  GET  /improvement        Improvement analysis");
    console.log("  POST /ingest             Ingest content");
    console.log("─────────────────────────────────────────\n");
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(console.error);
}
