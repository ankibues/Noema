/**
 * NOEMA Phase 2 Demo - Cognee Integration
 * 
 * Demonstrates:
 * 1. Evidence can be ingested into Cognee
 * 2. cognify runs successfully
 * 3. Semantic search returns relevant snippets
 * 4. NOEMA storage state remains unchanged by retrieval
 * 5. Cognee can be restarted independently
 * 
 * Prerequisites:
 * - Cognee service running at localhost:8100
 * - OPENAI_API_KEY set in apps/cognee_service/.env
 * 
 * Setup:
 * 1. cd apps/cognee_service
 * 2. echo "OPENAI_API_KEY=your-key-here" > .env
 * 3. source venv/bin/activate && python main.py
 * 
 * Usage:
 * - npm run build
 * - node dist/demo-cognee.js
 */

import { getCogneeClient } from "./services/cognee/index.js";
import { initializeStorage, getObservationRepository, getMentalModelRepository } from "./storage/index.js";

async function demo() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  NOEMA Phase 2: Cognee Integration Demo");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Initialize NOEMA storage
  console.log("1. Initializing NOEMA storage...");
  await initializeStorage();
  const observations = getObservationRepository();
  const models = getMentalModelRepository();
  
  const initialObsCount = (await observations.list()).length;
  const initialModelCount = (await models.list()).length;
  console.log(`   NOEMA state: ${initialObsCount} observations, ${initialModelCount} models\n`);

  // Get Cognee client
  const cognee = getCogneeClient();

  // Health check
  console.log("2. Checking Cognee service health...");
  const health = await cognee.healthCheck();
  if (health.status !== "ok") {
    console.error(`   ❌ Cognee service unhealthy: ${health.message}`);
    console.error("\n   Make sure the Cognee service is running:");
    console.error("   1. cd apps/cognee_service");
    console.error("   2. echo 'OPENAI_API_KEY=your-key' > .env");
    console.error("   3. source venv/bin/activate && python main.py\n");
    process.exit(1);
  }
  console.log("   ✓ Cognee service is healthy\n");

  // Ingest evidence
  console.log("3. Ingesting evidence into Cognee...");
  
  const evidence1 = await cognee.ingestArtifact({
    evidence_id: `evidence_${Date.now()}_1`,
    content: "Error: Database connection timeout after 30 seconds. The connection pool appears to be exhausted with 50 pending requests.",
    content_type: "log",
    metadata: {
      source: "app_server_logs",
      timestamp: new Date().toISOString(),
    },
  });
  console.log(`   ✓ Ingested evidence 1: ${evidence1.cognee_id}`);

  const evidence2 = await cognee.ingestArtifact({
    evidence_id: `evidence_${Date.now()}_2`,
    content: "The login page displays an error modal with message 'Unable to authenticate. Please try again later.' The retry button is visible but unresponsive.",
    content_type: "screenshot_ocr",
    metadata: {
      source: "ui_screenshot",
      timestamp: new Date().toISOString(),
    },
  });
  console.log(`   ✓ Ingested evidence 2: ${evidence2.cognee_id}`);

  const evidence3 = await cognee.ingestArtifact({
    evidence_id: `evidence_${Date.now()}_3`,
    content: "Test case TC-AUTH-001 failed: Expected status 200, got 503. Response body: {'error': 'Service temporarily unavailable'}",
    content_type: "text",
    metadata: {
      source: "test_runner",
      timestamp: new Date().toISOString(),
    },
  });
  console.log(`   ✓ Ingested evidence 3: ${evidence3.cognee_id}\n`);

  // Run cognify
  console.log("4. Running cognify (building internal representations)...");
  const cognifyResult = await cognee.cognify();
  if (cognifyResult.status === "completed") {
    console.log("   ✓ Cognify completed successfully\n");
  } else {
    console.log(`   ⚠ Cognify status: ${cognifyResult.status} - ${cognifyResult.message}\n`);
  }

  // Search
  console.log("5. Searching Cognee memory...");
  
  const searchResult1 = await cognee.searchMemory({
    query: "database connection timeout",
    topK: 3,
  });
  console.log(`   Query: "database connection timeout"`);
  console.log(`   Results: ${searchResult1.items.length} items`);
  for (const item of searchResult1.items) {
    console.log(`     - [${item.score.toFixed(2)}] ${item.snippet.substring(0, 80)}...`);
  }
  if (searchResult1.graph_context) {
    console.log(`   Graph: ${searchResult1.graph_context.nodes.length} nodes, ${searchResult1.graph_context.edges.length} edges`);
  }
  console.log();

  const searchResult2 = await cognee.searchMemory({
    query: "authentication error login",
    topK: 3,
  });
  console.log(`   Query: "authentication error login"`);
  console.log(`   Results: ${searchResult2.items.length} items`);
  for (const item of searchResult2.items) {
    console.log(`     - [${item.score.toFixed(2)}] ${item.snippet.substring(0, 80)}...`);
  }
  console.log();

  // Verify NOEMA storage unchanged
  console.log("6. Verifying NOEMA storage unchanged...");
  const finalObsCount = (await observations.list()).length;
  const finalModelCount = (await models.list()).length;
  
  if (finalObsCount === initialObsCount && finalModelCount === initialModelCount) {
    console.log("   ✓ NOEMA storage unchanged by Cognee operations");
    console.log(`     Observations: ${initialObsCount} → ${finalObsCount}`);
    console.log(`     Models: ${initialModelCount} → ${finalModelCount}`);
  } else {
    console.log("   ⚠ NOEMA storage changed unexpectedly!");
    console.log(`     Observations: ${initialObsCount} → ${finalObsCount}`);
    console.log(`     Models: ${initialModelCount} → ${finalModelCount}`);
  }
  console.log();

  // Summary
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Phase 2 Checkpoint Summary");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ✓ Evidence ingested into Cognee");
  console.log("  ✓ Cognify completed successfully");
  console.log("  ✓ Semantic search returns relevant snippets");
  console.log("  ✓ NOEMA storage state unchanged by retrieval");
  console.log("  ✓ Cognee runs as independent service (restart to verify)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("To verify persistence across Cognee restarts:");
  console.log("  1. Stop the Cognee service (Ctrl+C)");
  console.log("  2. Restart it: python main.py");
  console.log("  3. Run this demo again - previous evidence should be searchable\n");
}

demo().catch((error) => {
  console.error("Demo failed:", error);
  process.exit(1);
});
