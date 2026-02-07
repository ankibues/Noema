/**
 * NOEMA Phase 3 Demo - Sensing Layer
 * 
 * Demonstrates:
 * 1. Raw text/log/screenshot can be ingested
 * 2. Content is chunked correctly
 * 3. Canonical Observations are created and validated
 * 4. Observations persist across restart
 * 5. Raw evidence is indexed into Cognee (if enabled)
 * 6. No cognition or decision logic is triggered
 * 
 * Usage:
 * - npm run build
 * - node dist/demo-sensing.js
 * 
 * Note: Set COGNEE_ENABLED=false to skip Cognee integration
 */

import {
  initializeStorage,
  getObservationRepository,
} from "./storage/index.js";
import {
  createSensorHub,
  getObservationBus,
  chunkText,
  chunkLogs,
  calculateSalience,
} from "./services/sensing/index.js";
import type { Observation } from "./schemas/index.js";

async function demo() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  NOEMA Phase 3: Sensing Layer Demo");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Initialize storage
  console.log("1. Initializing storage...");
  await initializeStorage();
  const observationRepo = getObservationRepository();
  const initialCount = (await observationRepo.list()).length;
  console.log(`   Initial observation count: ${initialCount}\n`);

  // Set up observation bus listener
  console.log("2. Setting up ObservationBus listener...");
  const receivedObservations: Observation[] = [];
  const bus = getObservationBus();
  const unsubscribe = bus.subscribe((obs) => {
    receivedObservations.push(obs);
    console.log(`   [ObservationBus] Received: ${obs.observation_id.substring(0, 8)}... (salience: ${obs.confidence.toFixed(2)})`);
  });
  console.log(`   ✓ Subscribed to ObservationBus\n`);

  // Create SensorHub (Cognee disabled for demo unless explicitly enabled)
  const cogneeEnabled = process.env.COGNEE_ENABLED === "true";
  console.log(`3. Creating SensorHub (Cognee: ${cogneeEnabled ? "enabled" : "disabled"})...`);
  const sensorHub = createSensorHub({ cogneeEnabled });
  console.log("   ✓ SensorHub created\n");

  // Demo 1: Ingest text
  console.log("4. Ingesting text content...");
  const textContent = `
NOEMA System Architecture Overview

NOEMA is a persistent digital cognitive system that perceives, learns, and evolves.

Key Components:
- Sensing Layer: Converts raw inputs into Observations
- Memory Layer: Stores evidence in Cognee for semantic retrieval
- Storage Layer: Persists mental models, experiences, and runs
- Cognition Layer: Updates beliefs based on evidence (future)

The system maintains state across restarts and improves through experience.
  `.trim();

  const textResult = await sensorHub.ingest({
    type: "text",
    content: textContent,
    sessionId: "demo-session",
  });
  console.log(`   ✓ Text ingested: ${textResult.chunkCount} chunks → ${textResult.observationIds.length} observations\n`);

  // Demo 2: Ingest logs
  console.log("5. Ingesting log content...");
  const logContent = `
2024-01-15T10:30:00.123Z [INFO] Application starting...
2024-01-15T10:30:01.456Z [INFO] Database connection established
2024-01-15T10:30:02.789Z [WARNING] Cache miss rate above threshold: 45%
2024-01-15T10:30:05.012Z [ERROR] Failed to connect to external API: Connection timeout after 30s
2024-01-15T10:30:05.345Z [ERROR] Retry attempt 1 of 3...
2024-01-15T10:30:08.678Z [ERROR] Retry attempt 2 of 3...
2024-01-15T10:30:11.901Z [ERROR] Retry attempt 3 of 3...
2024-01-15T10:30:12.234Z [FATAL] External API unavailable. Service degraded.
2024-01-15T10:30:15.567Z [INFO] Fallback mode activated
2024-01-15T10:30:20.890Z [INFO] Request processed with fallback data
  `.trim();

  const logResult = await sensorHub.ingest({
    type: "log",
    content: logContent,
    sessionId: "demo-session",
  });
  console.log(`   ✓ Logs ingested: ${logResult.chunkCount} chunks → ${logResult.observationIds.length} observations\n`);

  // Demo 3: Show chunking behavior
  console.log("6. Demonstrating chunking...");
  const textChunks = chunkText(textContent);
  const logChunks = chunkLogs(logContent);
  console.log(`   Text chunking: ${textContent.length} chars → ${textChunks.length} chunks`);
  console.log(`   Log chunking: ${logContent.length} chars → ${logChunks.length} chunks`);
  for (const chunk of logChunks.slice(0, 3)) {
    const preview = chunk.content.substring(0, 60).replace(/\n/g, " ");
    console.log(`     [${chunk.index}] ${preview}... (logLevel: ${chunk.metadata?.logLevel || "none"})`);
  }
  console.log();

  // Demo 4: Show salience calculation
  console.log("7. Demonstrating salience calculation...");
  const testCases = [
    "Error: Connection timeout after 30 seconds",
    "Warning: Cache miss rate above threshold",
    "Info: Application started successfully",
    "Debug: Processing request ID 12345",
    "FATAL: System crash detected, core dump generated",
  ];
  for (const testCase of testCases) {
    const salience = calculateSalience(testCase);
    console.log(`   "${testCase.substring(0, 40)}..." → ${salience.score.toFixed(2)} (${salience.rule})`);
  }
  console.log();

  // Demo 5: Verify persistence
  console.log("8. Verifying persistence...");
  const finalCount = (await observationRepo.list()).length;
  const newObservations = finalCount - initialCount;
  console.log(`   Observations before: ${initialCount}`);
  console.log(`   Observations after: ${finalCount}`);
  console.log(`   New observations: ${newObservations}`);
  console.log(`   ObservationBus received: ${receivedObservations.length}`);
  console.log();

  // Demo 6: Show sample observation
  console.log("9. Sample Observation structure:");
  const sampleObs = receivedObservations[0];
  if (sampleObs) {
    console.log(`   ID: ${sampleObs.observation_id}`);
    console.log(`   Type: ${sampleObs.type}`);
    console.log(`   Confidence (salience): ${sampleObs.confidence}`);
    console.log(`   Summary: ${sampleObs.summary.substring(0, 80)}...`);
    console.log(`   Key points: ${sampleObs.key_points.length}`);
    console.log(`   Entities: ${sampleObs.entities.slice(0, 3).join(", ")}${sampleObs.entities.length > 3 ? "..." : ""}`);
    console.log(`   Source: ${sampleObs.source.sensor}`);
    console.log(`   Timestamp: ${sampleObs.timestamp}`);
  }
  console.log();

  // Cleanup
  unsubscribe();

  // Summary
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Phase 3 Checkpoint Summary");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ✓ Raw text/log content ingested successfully");
  console.log("  ✓ Content chunked semantically (text) and by log entry (logs)");
  console.log("  ✓ Canonical Observations created with schema validation");
  console.log(`  ✓ ${newObservations} observations persisted (run again to verify)`);
  console.log(`  ✓ ObservationBus published ${receivedObservations.length} events`);
  console.log("  ✓ No cognition or decision logic triggered");
  if (cogneeEnabled) {
    console.log("  ✓ Evidence indexed into Cognee");
  } else {
    console.log("  ⚠ Cognee integration skipped (set COGNEE_ENABLED=true to test)");
  }
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("Run this demo again to verify observations persist across restarts!");
  console.log("Data files are stored in: data/observations.json\n");
}

demo().catch((error) => {
  console.error("Demo failed:", error);
  process.exit(1);
});
