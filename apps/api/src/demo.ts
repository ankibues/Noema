/**
 * NOEMA Storage Demo
 * 
 * Demonstrates Phase 1 checkpoint:
 * - Data survives process restart
 * - Repos can create / update / list entities
 * - No cognition or sensing logic exists
 * 
 * Run twice to verify persistence:
 *   npm run build && npm run demo
 *   npm run demo  (data should persist)
 */

import {
  initializeStorage,
  getObservationRepository,
  getMentalModelRepository,
  getExperienceRepository,
  getGraphRepository,
  getRunRecordRepository,
} from "./storage/index.js";

async function demo() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  NOEMA Phase 1: Storage Layer Demo");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Initialize all repositories
  console.log("Initializing storage...");
  await initializeStorage();
  console.log("✓ Storage initialized\n");

  // Get repository instances
  const observations = getObservationRepository();
  const models = getMentalModelRepository();
  const experiences = getExperienceRepository();
  const graph = getGraphRepository();
  const runs = getRunRecordRepository();

  // Check existing data (proves persistence)
  const existingObs = await observations.list();
  const existingModels = await models.list();
  const existingExp = await experiences.list();
  const existingEdges = await graph.list();
  const existingRuns = await runs.list();

  console.log("Current state (loaded from disk):");
  console.log(`  Observations: ${existingObs.length}`);
  console.log(`  Mental Models: ${existingModels.length}`);
  console.log(`  Experiences: ${existingExp.length}`);
  console.log(`  Graph Edges: ${existingEdges.length}`);
  console.log(`  Run Records: ${existingRuns.length}`);
  console.log();

  // Create new entities to demonstrate write capability
  console.log("Creating new entities...\n");

  // 1. Create an observation
  const obs = await observations.create({
    type: "log",
    summary: `Demo observation created at ${new Date().toISOString()}`,
    key_points: ["This is a test", "Storage layer works"],
    entities: ["demo", "test"],
    confidence: 0.9,
    source: {
      sensor: "demo_script",
      session_id: "demo-session",
    },
  });
  console.log(`✓ Created Observation: ${obs.observation_id}`);
  console.log(`  Summary: ${obs.summary}`);
  console.log();

  // 2. Create a mental model
  const model = await models.create({
    title: "Demo Mental Model",
    domain: "general",
    tags: ["demo", "test"],
    summary: "A test model demonstrating the storage layer",
    core_principles: ["Persistence works", "Validation works"],
    assumptions: ["JSON files are reliable for MVP"],
    procedures: ["Create → Validate → Persist → Load"],
    failure_modes: ["File corruption", "Schema mismatch"],
    diagnostics: ["Check data/ directory", "Validate JSON"],
    examples: ["This demo"],
    confidence: 0.7,
    status: "candidate",
    evidence_ids: [obs.observation_id],
  });
  console.log(`✓ Created Mental Model: ${model.model_id}`);
  console.log(`  Title: ${model.title}`);
  console.log(`  History entries: ${model.update_history.length}`);
  console.log();

  // 3. Update the mental model (demonstrate update_history)
  const updatedModel = await models.reinforce(model.model_id, [obs.observation_id]);
  if (updatedModel) {
    console.log(`✓ Reinforced Mental Model`);
    console.log(`  Confidence: ${model.confidence} → ${updatedModel.confidence}`);
    console.log(`  History entries: ${updatedModel.update_history.length}`);
    console.log();
  }

  // 4. Create an experience
  const exp = await experiences.create({
    statement: "When testing storage, always verify persistence across restarts",
    scope: ["testing", "storage", "demo"],
    confidence: 0.8,
    source_runs: [],
  });
  console.log(`✓ Created Experience: ${exp.experience_id}`);
  console.log(`  Statement: ${exp.statement}`);
  console.log();

  // 5. Create a graph edge
  if (existingModels.length > 0) {
    const edge = await graph.create({
      from_model: model.model_id,
      to_model: existingModels[0].model_id,
      relation: "extends",
      weight: 0.5,
      evidence_ids: [obs.observation_id],
    });
    console.log(`✓ Created Graph Edge: ${edge.edge_id}`);
    console.log(`  Relation: ${edge.from_model} --extends--> ${edge.to_model}`);
    console.log();
  }

  // 6. Create a run record
  const run = await runs.create({
    task: "Demo storage layer",
    observations_used: [obs.observation_id],
    models_touched: [model.model_id],
    experiences_touched: [exp.experience_id],
    actions: [],
    outcomes: [],
  });
  console.log(`✓ Created Run Record: ${run.run_id}`);
  console.log(`  Task: ${run.task}`);
  console.log();

  // Complete the run
  const completedRun = await runs.complete(run.run_id);
  if (completedRun) {
    console.log(`✓ Completed Run`);
    console.log(`  Duration: ${new Date(completedRun.finished_at!).getTime() - new Date(completedRun.started_at).getTime()}ms`);
    console.log();
  }

  // Final state
  const finalObs = await observations.list();
  const finalModels = await models.list();
  const finalExp = await experiences.list();
  const finalEdges = await graph.list();
  const finalRuns = await runs.list();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("Final state (will persist to disk):");
  console.log(`  Observations: ${finalObs.length}`);
  console.log(`  Mental Models: ${finalModels.length}`);
  console.log(`  Experiences: ${finalExp.length}`);
  console.log(`  Graph Edges: ${finalEdges.length}`);
  console.log(`  Run Records: ${finalRuns.length}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("Run this demo again to verify persistence!");
  console.log("Data files are stored in: data/\n");
}

demo().catch(console.error);
