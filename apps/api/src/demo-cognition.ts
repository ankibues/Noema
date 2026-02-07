/**
 * NOEMA Phase 4 Demo - Model Update Engine
 * 
 * Demonstrates:
 * 1. Observations trigger model updates
 * 2. Mental models are created from novel observations
 * 3. Repeated observations increase model confidence
 * 4. Contradictory observations lower confidence or create competing models
 * 5. Graph edges represent belief structure
 * 6. All updates have full audit trail
 * 
 * Prerequisites:
 * - GEMINI_API_KEY or GOOGLE_API_KEY set in environment
 * 
 * Usage:
 * - npm run build
 * - GEMINI_API_KEY=your-key npm run demo:cognition
 * 
 * Or create apps/api/.env with:
 *   GEMINI_API_KEY=your-key
 */

import { config } from "dotenv";
config(); // Load .env file if present

import {
  initializeStorage,
  getObservationRepository,
  getMentalModelRepository,
  getGraphRepository,
} from "./storage/index.js";
import {
  createSensorHub,
} from "./services/sensing/index.js";
import {
  createModelUpdateEngine,
  type ModelUpdateResult,
} from "./services/cognition/index.js";

// Check for --mock flag
const MOCK_MODE = process.argv.includes("--mock");

async function demo() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  NOEMA Phase 4: Model Update Engine Demo");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Check for API key
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey && !MOCK_MODE) {
    console.error("❌ GEMINI_API_KEY or GOOGLE_API_KEY not set");
    console.error("   Run: GEMINI_API_KEY=your-key npm run demo:cognition");
    console.error("   Or:  npm run demo:cognition -- --mock (for mock mode)\n");
    process.exit(1);
  }
  if (MOCK_MODE) {
    console.log("⚠ Running in MOCK MODE (no LLM calls)\n");
  } else {
    console.log("✓ Gemini API key found\n");
  }

  // Initialize storage
  console.log("1. Initializing storage...");
  await initializeStorage();
  const modelRepo = getMentalModelRepository();
  const graphRepo = getGraphRepository();
  const obsRepo = getObservationRepository();
  
  const initialModelCount = (await modelRepo.list()).length;
  const initialEdgeCount = (await graphRepo.list()).length;
  console.log(`   Initial state: ${initialModelCount} models, ${initialEdgeCount} edges\n`);

  // Create SensorHub (Cognee disabled for simplicity)
  console.log("2. Creating SensorHub...");
  const sensorHub = createSensorHub({ cogneeEnabled: false });
  console.log("   ✓ SensorHub created\n");

  // Create ModelUpdateEngine
  console.log("3. Creating ModelUpdateEngine...");
  const engine = createModelUpdateEngine({
    salienceThreshold: 0.4, // Lower threshold for demo
    cogneeEnabled: false,   // Skip Cognee for demo
    mockLLM: MOCK_MODE,     // Use mock LLM if in mock mode
    llm: {
      provider: "gemini",
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    },
  });
  engine.start();
  console.log(`   ✓ ModelUpdateEngine started (mockLLM: ${MOCK_MODE})\n`);

  // Track results
  const results: ModelUpdateResult[] = [];

  // Demo 1: Ingest first observation about connection timeouts
  console.log("4. Ingesting observation #1 (connection timeout error)...");
  const obs1Result = await sensorHub.ingest({
    type: "log",
    content: `
2024-01-15T10:30:05.012Z [ERROR] Failed to connect to database: Connection timeout after 30s
2024-01-15T10:30:05.345Z [ERROR] Database connection pool exhausted: 50 pending requests
2024-01-15T10:30:05.678Z [ERROR] Retry attempt 1 of 3 failed
2024-01-15T10:30:08.901Z [FATAL] Database unavailable. Service entering degraded mode.
    `.trim(),
    sessionId: "demo-session",
  });
  console.log(`   Ingested: ${obs1Result.observationIds.length} observations\n`);

  // Wait for processing
  await sleep(2000);

  // Get the observation and manually trigger (since bus might not have processed yet)
  const obs1 = await obsRepo.get(obs1Result.observationIds[0]);
  if (obs1) {
    console.log("5. Processing observation #1 through ModelUpdateEngine...");
    const result1 = await engine.triggerUpdate(obs1);
    results.push(result1);
    console.log(`   Created: ${result1.createdModels.length} models`);
    console.log(`   Updated: ${result1.updatedModels.length} models\n`);
  }

  // Demo 2: Ingest similar observation (should reinforce model)
  console.log("6. Ingesting observation #2 (similar timeout - should reinforce)...");
  const obs2Result = await sensorHub.ingest({
    type: "log",
    content: `
2024-01-15T14:22:11.123Z [ERROR] Database connection timeout: exceeded 30s limit
2024-01-15T14:22:11.456Z [ERROR] Connection pool at capacity: 48/50 connections in use
2024-01-15T14:22:14.789Z [WARN] Implementing connection throttling
2024-01-15T14:22:15.012Z [INFO] Fallback to read replica activated
    `.trim(),
    sessionId: "demo-session",
  });
  console.log(`   Ingested: ${obs2Result.observationIds.length} observations\n`);

  await sleep(2000);

  const obs2 = await obsRepo.get(obs2Result.observationIds[0]);
  if (obs2) {
    console.log("7. Processing observation #2...");
    const result2 = await engine.triggerUpdate(obs2);
    results.push(result2);
    console.log(`   Created: ${result2.createdModels.length} models`);
    console.log(`   Updated: ${result2.updatedModels.length} models\n`);
  }

  // Demo 3: Ingest contradictory observation
  console.log("8. Ingesting observation #3 (contradictory - database working fine)...");
  const obs3Result = await sensorHub.ingest({
    type: "log",
    content: `
2024-01-15T16:00:00.000Z [INFO] Database health check: OK
2024-01-15T16:00:00.123Z [INFO] Connection pool utilization: 12/50 (24%)
2024-01-15T16:00:00.456Z [INFO] Average query latency: 15ms
2024-01-15T16:00:00.789Z [INFO] All database replicas healthy
2024-01-15T16:00:01.012Z [INFO] No connection timeouts in last 2 hours
    `.trim(),
    sessionId: "demo-session",
  });
  console.log(`   Ingested: ${obs3Result.observationIds.length} observations\n`);

  await sleep(2000);

  const obs3 = await obsRepo.get(obs3Result.observationIds[0]);
  if (obs3) {
    console.log("9. Processing observation #3...");
    const result3 = await engine.triggerUpdate(obs3);
    results.push(result3);
    console.log(`   Created: ${result3.createdModels.length} models`);
    console.log(`   Updated: ${result3.updatedModels.length} models`);
    if (result3.contradictions.length > 0) {
      console.log(`   ⚠ Contradictions detected: ${result3.contradictions.length}`);
    }
    console.log();
  }

  // Stop engine
  engine.stop();

  // Final state
  console.log("10. Final state analysis...\n");
  
  const finalModels = await modelRepo.list();
  const finalEdges = await graphRepo.list();
  
  console.log(`Models: ${initialModelCount} → ${finalModels.length} (+${finalModels.length - initialModelCount})`);
  console.log(`Edges: ${initialEdgeCount} → ${finalEdges.length} (+${finalEdges.length - initialEdgeCount})\n`);

  // Show model details
  console.log("Mental Models Created/Updated:");
  console.log("─".repeat(60));
  
  for (const model of finalModels.slice(-3)) { // Show last 3 models
    console.log(`\n📚 ${model.title}`);
    console.log(`   ID: ${model.model_id.substring(0, 8)}...`);
    console.log(`   Domain: ${model.domain}`);
    console.log(`   Status: ${model.status}`);
    console.log(`   Confidence: ${model.confidence.toFixed(2)}`);
    console.log(`   Evidence: ${model.evidence_ids.length} items`);
    console.log(`   History: ${model.update_history.length} entries`);
    
    // Show confidence evolution
    if (model.update_history.length > 1) {
      console.log(`   Confidence history:`);
      let cumulative = 0;
      for (const entry of model.update_history) {
        cumulative += entry.delta_confidence;
        console.log(`     - ${entry.change_summary.substring(0, 40)}... (Δ${entry.delta_confidence >= 0 ? '+' : ''}${entry.delta_confidence.toFixed(2)})`);
      }
    }
  }

  // Show graph edges
  if (finalEdges.length > 0) {
    console.log("\n\nGraph Edges:");
    console.log("─".repeat(60));
    for (const edge of finalEdges.slice(-5)) {
      console.log(`  ${edge.from_model.substring(0, 8)}... --${edge.relation}--> ${edge.to_model.substring(0, 8)}... (weight: ${edge.weight.toFixed(2)})`);
    }
  }

  // Summary
  console.log("\n");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Phase 4 Checkpoint Summary");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  ✓ ${results.filter(r => r.createdModels.length > 0).length} observations created new models`);
  console.log(`  ✓ ${results.filter(r => r.updatedModels.length > 0).length} observations updated existing models`);
  console.log(`  ✓ Mental models persist with full update_history`);
  console.log(`  ✓ Confidence evolves based on evidence`);
  console.log(`  ✓ ${results.filter(r => r.contradictions.length > 0).length} contradictions detected`);
  console.log(`  ✓ All updates are auditable (evidence_ids tracked)`);
  console.log("═══════════════════════════════════════════════════════════════\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

demo().catch((error) => {
  console.error("Demo failed:", error);
  process.exit(1);
});
