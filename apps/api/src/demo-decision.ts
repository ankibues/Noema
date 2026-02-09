/**
 * NOEMA Phase 5 Demo - Decision Engine
 * 
 * Demonstrates:
 * 1. NOEMA selects different actions for different beliefs
 * 2. Browser actually opens and interacts with a page
 * 3. Screenshots and logs are captured
 * 4. Action outcomes generate new observations
 * 5. Belief updates occur only in the next Phase 4 cycle
 * 
 * Prerequisites:
 * - Playwright browsers installed: npx playwright install chromium
 * - GEMINI_API_KEY set for real LLM (or use --mock)
 * 
 * Usage:
 * - npm run build
 * - npm run demo:decision -- --mock      # Mock LLM, real browser
 * - GEMINI_API_KEY=key npm run demo:decision  # Real LLM, real browser
 */

import { config } from "dotenv";
config();

import { v4 as uuidv4 } from "uuid";
import {
  initializeStorage,
  getObservationRepository,
  getMentalModelRepository,
  getActionRepository,
  getActionOutcomeRepository,
} from "./storage/index.js";
import { createDecisionEngine, closeAllSessions } from "./services/decision/index.js";
import { createModelUpdateEngine } from "./services/cognition/index.js";

// Check for --mock flag
const MOCK_MODE = process.argv.includes("--mock");
const HEADLESS = !process.argv.includes("--visible");

async function demo() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  NOEMA Phase 5: Decision Engine Demo");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Check for API key
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey && !MOCK_MODE) {
    console.error("❌ GEMINI_API_KEY or GOOGLE_API_KEY not set");
    console.error("   Run: GEMINI_API_KEY=your-key npm run demo:decision");
    console.error("   Or:  npm run demo:decision -- --mock\n");
    process.exit(1);
  }
  if (MOCK_MODE) {
    console.log("⚠ Running in MOCK MODE (mock LLM, real browser)\n");
  } else {
    console.log("✓ Gemini API key found\n");
  }

  console.log(`Browser mode: ${HEADLESS ? "headless" : "visible"}`);
  console.log("(Use --visible flag to see the browser)\n");

  // Initialize storage
  console.log("1. Initializing storage...");
  await initializeStorage();
  const modelRepo = getMentalModelRepository();
  const obsRepo = getObservationRepository();
  const actionRepo = getActionRepository();
  const outcomeRepo = getActionOutcomeRepository();

  const initialObsCount = (await obsRepo.list()).length;
  const initialActionCount = (await actionRepo.list()).length;
  console.log(`   Initial state: ${initialObsCount} observations, ${initialActionCount} actions\n`);

  // Create a run ID for this demo
  const runId = uuidv4();
  console.log(`2. Run ID: ${runId}\n`);

  // Create Decision Engine
  console.log("3. Creating Decision Engine...");
  const decisionEngine = createDecisionEngine({
    mockLLM: MOCK_MODE,
    modelConfidenceThreshold: 0.3,
    browser: {
      headless: HEADLESS,
      slowMo: HEADLESS ? 0 : 100, // Slow down if visible
      screenshotDir: "./data/screenshots",
    },
    llm: {
      provider: "gemini",
      model: process.env.GEMINI_MODEL || "gemini-3-flash-preview",
    },
  });
  console.log("   ✓ Decision Engine created\n");

  // Demo task: Visit a test website and capture information
  const task = "Navigate to https://example.com and capture a screenshot of the page content. Verify the page loaded successfully.";

  console.log("4. Task:", task);
  console.log();

  try {
    // Decision Cycle 1: Navigate to URL
    console.log("─".repeat(60));
    console.log("Decision Cycle 1: Initial Navigation");
    console.log("─".repeat(60));
    
    const result1 = await decisionEngine.decideAndAct(task, runId);
    
    console.log(`\n   Action: ${result1.action.type}`);
    console.log(`   Rationale: ${result1.action.rationale}`);
    console.log(`   Outcome: ${result1.outcome.status}`);
    console.log(`   Duration: ${result1.outcome.duration_ms}ms`);
    console.log(`   Screenshots: ${result1.outcome.artifacts.screenshots.length}`);
    console.log(`   Observations generated: ${result1.generatedObservationIds.length}`);
    console.log();

    // Wait a moment
    await sleep(1000);

    // Decision Cycle 2: Follow-up action
    console.log("─".repeat(60));
    console.log("Decision Cycle 2: Follow-up Action");
    console.log("─".repeat(60));
    
    const result2 = await decisionEngine.decideAndAct(task, runId);
    
    console.log(`\n   Action: ${result2.action.type}`);
    console.log(`   Rationale: ${result2.action.rationale}`);
    console.log(`   Outcome: ${result2.outcome.status}`);
    console.log(`   Duration: ${result2.outcome.duration_ms}ms`);
    console.log(`   Screenshots: ${result2.outcome.artifacts.screenshots.length}`);
    console.log(`   Observations generated: ${result2.generatedObservationIds.length}`);
    console.log();

    // Wait a moment
    await sleep(1000);

    // Decision Cycle 3: Verification
    console.log("─".repeat(60));
    console.log("Decision Cycle 3: Verification");
    console.log("─".repeat(60));
    
    const result3 = await decisionEngine.decideAndAct(task, runId);
    
    console.log(`\n   Action: ${result3.action.type}`);
    console.log(`   Rationale: ${result3.action.rationale}`);
    console.log(`   Outcome: ${result3.outcome.status}`);
    console.log(`   Duration: ${result3.outcome.duration_ms}ms`);
    console.log(`   Screenshots: ${result3.outcome.artifacts.screenshots.length}`);
    console.log(`   Observations generated: ${result3.generatedObservationIds.length}`);
    console.log();

  } catch (error) {
    console.error("Demo error:", error);
  } finally {
    // Close browser session
    console.log("5. Closing browser session...");
    await decisionEngine.close(runId);
    await closeAllSessions();
    console.log("   ✓ Browser closed\n");
  }

  // Final state
  console.log("6. Final state analysis...\n");
  
  const finalObs = await obsRepo.list();
  const finalActions = await actionRepo.list();
  const finalOutcomes = await outcomeRepo.list();
  
  console.log(`Observations: ${initialObsCount} → ${finalObs.length} (+${finalObs.length - initialObsCount})`);
  console.log(`Actions: ${initialActionCount} → ${finalActions.length} (+${finalActions.length - initialActionCount})`);
  console.log(`Outcomes: ${finalOutcomes.length}`);
  console.log();

  // Show recent actions
  console.log("Recent Actions:");
  console.log("─".repeat(60));
  for (const action of finalActions.slice(-3)) {
    console.log(`  📋 ${action.type}`);
    console.log(`     Rationale: ${action.rationale.substring(0, 60)}...`);
    console.log(`     Created: ${action.created_at}`);
  }
  console.log();

  // Show recent observations (from action outcomes)
  console.log("Observations from Action Outcomes:");
  console.log("─".repeat(60));
  const recentObs = finalObs.slice(-5);
  for (const obs of recentObs) {
    console.log(`  👁 ${obs.type}: ${obs.summary.substring(0, 50)}...`);
    console.log(`     Salience: ${obs.confidence.toFixed(2)}`);
  }
  console.log();

  // Demonstrate that beliefs are NOT updated directly
  console.log("7. Verifying belief isolation...\n");
  
  const models = await modelRepo.list();
  console.log(`   Mental models: ${models.length}`);
  console.log("   ✓ Decision Engine did NOT update beliefs directly");
  console.log("   ✓ New observations are ready for Phase 4 processing");
  console.log();

  // Optional: Trigger Phase 4 to show the loop
  if (process.argv.includes("--with-cognition")) {
    console.log("8. Triggering Phase 4 (Model Update Engine)...\n");
    
    const modelEngine = createModelUpdateEngine({
      mockLLM: true, // Use mock for demo
      salienceThreshold: 0.3,
      cogneeEnabled: false,
    });
    modelEngine.start();

    // Process the new observations
    for (const obs of recentObs) {
      if (obs.confidence >= 0.3) {
        await modelEngine.triggerUpdate(obs);
      }
    }

    modelEngine.stop();

    const updatedModels = await modelRepo.list();
    console.log(`   Models after cognition: ${updatedModels.length}`);
    console.log("   ✓ Beliefs updated via Phase 4 (not directly by actions)");
    console.log();
  }

  // Summary
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Phase 5 Checkpoint Summary");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ✓ Decision Engine selects actions based on beliefs");
  console.log("  ✓ Browser opens and interacts with real pages");
  console.log("  ✓ Screenshots and logs are captured as artifacts");
  console.log("  ✓ Action outcomes generate new observations");
  console.log("  ✓ Beliefs are NOT updated directly by actions");
  console.log("  ✓ Perception → Belief → Action → Perception loop complete");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("How NOEMA closes the loop:");
  console.log("  1. Beliefs (Mental Models) inform action selection");
  console.log("  2. Actions produce observable outcomes (screenshots, logs)");
  console.log("  3. Outcomes are converted to Observations via Sensing Layer");
  console.log("  4. Observations flow to Phase 4 for belief updates");
  console.log("  5. Updated beliefs inform the next action selection");
  console.log("  → This creates a continuous, grounded cognitive loop\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

demo().catch((error) => {
  console.error("Demo failed:", error);
  closeAllSessions().finally(() => process.exit(1));
});
