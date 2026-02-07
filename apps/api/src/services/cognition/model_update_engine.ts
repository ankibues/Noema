/**
 * Model Update Engine
 * 
 * The core cognition component that updates mental models based on observations.
 * 
 * This engine:
 * - Subscribes to ObservationBus
 * - Filters observations by salience threshold
 * - Retrieves evidence from Cognee
 * - Selects candidate models
 * - Calls LLM to generate model updates
 * - Persists changes with full audit trail
 * 
 * This engine does NOT:
 * - Make decisions about actions
 * - Run tools or external systems
 * - Extract experiences (that's Phase 6)
 */

import type { Observation, MentalModel, GraphEdge } from "../../schemas/index.js";
import { getObservationBus } from "../sensing/index.js";
import { getGraphRepository } from "../../storage/index.js";
import { retrieveEvidence } from "./evidence_retriever.js";
import { selectCandidateModels } from "./candidate_selector.js";
import { callModelUpdateLLM } from "./llm_client.js";
import { callMockModelUpdateLLM } from "./mock_llm_client.js";
import {
  persistNewModels,
  persistModelUpdates,
  linkObservationToModels,
} from "./model_persister.js";
import type {
  ModelUpdateEngineConfig,
  ModelUpdateResult,
  ModelUpdatePromptInput,
  RetrievedEvidence,
} from "./types.js";

const DEFAULT_CONFIG: Required<ModelUpdateEngineConfig> = {
  salienceThreshold: 0.5,
  cogneeEnabled: true,
  evidenceTopK: 5,
  candidateModelLimit: 3,
  mockLLM: false,
  llm: {
    provider: "gemini",
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  },
};

export class ModelUpdateEngine {
  private readonly config: Required<ModelUpdateEngineConfig>;
  private unsubscribe: (() => void) | null = null;
  private processing = false;
  private queue: Observation[] = [];

  constructor(config: ModelUpdateEngineConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      llm: { ...DEFAULT_CONFIG.llm, ...config.llm },
    };
  }

  /**
   * Start the engine - subscribe to ObservationBus
   */
  start(): void {
    if (this.unsubscribe) {
      console.warn("[ModelUpdateEngine] Already started");
      return;
    }

    const bus = getObservationBus();
    this.unsubscribe = bus.subscribe(this.handleObservation.bind(this));
    console.log(
      `[ModelUpdateEngine] Started (salience threshold: ${this.config.salienceThreshold})`
    );
  }

  /**
   * Stop the engine - unsubscribe from ObservationBus
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
      console.log("[ModelUpdateEngine] Stopped");
    }
  }

  /**
   * Handle an observation from the bus
   */
  private async handleObservation(observation: Observation): Promise<void> {
    // Filter by salience threshold
    if (observation.confidence < this.config.salienceThreshold) {
      console.log(
        `[ModelUpdateEngine] Skipping low-salience observation: ${observation.observation_id.substring(0, 8)}... ` +
        `(salience: ${observation.confidence.toFixed(2)} < ${this.config.salienceThreshold})`
      );
      return;
    }

    // Queue for processing
    this.queue.push(observation);
    await this.processQueue();
  }

  /**
   * Process queued observations
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const observation = this.queue.shift()!;
        await this.processObservation(observation);
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process a single observation - main update logic
   */
  async processObservation(observation: Observation): Promise<ModelUpdateResult> {
    console.log(
      `[ModelUpdateEngine] Processing observation: ${observation.observation_id.substring(0, 8)}... ` +
      `(type: ${observation.type}, salience: ${observation.confidence.toFixed(2)})`
    );

    // 1. Retrieve evidence from Cognee
    const evidence = await retrieveEvidence(observation, {
      topK: this.config.evidenceTopK,
      enabled: this.config.cogneeEnabled,
    });
    console.log(`[ModelUpdateEngine] Retrieved ${evidence.length} evidence items`);

    // 2. Select candidate models
    const candidates = await selectCandidateModels(observation, {
      limit: this.config.candidateModelLimit,
    });
    console.log(`[ModelUpdateEngine] Found ${candidates.length} candidate models`);

    // 3. Get current graph edges for context
    const graphEdges = await this.getRelevantGraphEdges(candidates);

    // 4. Build prompt input
    const promptInput = this.buildPromptInput(
      observation,
      candidates,
      evidence,
      graphEdges
    );

    // 5. Call LLM for model updates
    let llmOutput;
    try {
      if (this.config.mockLLM) {
        llmOutput = await callMockModelUpdateLLM(promptInput);
      } else {
        llmOutput = await callModelUpdateLLM(promptInput, this.config.llm);
      }
    } catch (error) {
      console.error("[ModelUpdateEngine] LLM call failed:", error);
      return {
        observationId: observation.observation_id,
        createdModels: [],
        updatedModels: [],
        createdEdges: [],
        contradictions: [],
        skipped: true,
        skipReason: `LLM call failed: ${error}`,
      };
    }

    // 6. Persist new models
    const createdModelIds = await persistNewModels(llmOutput.create_models);

    // 7. Persist model updates
    const { updatedModels, createdEdges } = await persistModelUpdates(
      llmOutput.update_models
    );

    // 8. Link observation to affected models
    const allAffectedModels = [...createdModelIds, ...updatedModels];
    await linkObservationToModels(observation.observation_id, allAffectedModels);

    // 9. Log contradictions
    for (const contradiction of llmOutput.contradictions) {
      console.warn(
        `[ModelUpdateEngine] Contradiction detected in model ${contradiction.model_id}: ` +
        `${contradiction.conflict}`
      );
    }

    const result: ModelUpdateResult = {
      observationId: observation.observation_id,
      createdModels: createdModelIds,
      updatedModels,
      createdEdges,
      contradictions: llmOutput.contradictions,
      skipped: false,
    };

    console.log(
      `[ModelUpdateEngine] Processed observation: ` +
      `created=${createdModelIds.length}, updated=${updatedModels.length}, edges=${createdEdges.length}`
    );

    return result;
  }

  /**
   * Build the prompt input from observation and context
   */
  private buildPromptInput(
    observation: Observation,
    candidates: MentalModel[],
    evidence: RetrievedEvidence[],
    graphEdges: GraphEdge[]
  ): ModelUpdatePromptInput {
    return {
      observation: {
        observation_id: observation.observation_id,
        type: observation.type,
        summary: observation.summary,
        key_points: observation.key_points,
        entities: observation.entities,
        confidence: observation.confidence,
      },
      candidate_models: candidates.map((m) => ({
        model_id: m.model_id,
        title: m.title,
        summary: m.summary,
        confidence: m.confidence,
        tags: m.tags,
      })),
      retrieved_evidence_summaries: evidence.map((e) => ({
        evidence_id: e.evidenceId,
        snippet: e.snippet,
        score: e.score,
      })),
      current_graph_edges: graphEdges.map((e) => ({
        from_model: e.from_model,
        to_model: e.to_model,
        relation: e.relation,
        weight: e.weight,
      })),
    };
  }

  /**
   * Get graph edges involving candidate models
   */
  private async getRelevantGraphEdges(
    candidates: MentalModel[]
  ): Promise<GraphEdge[]> {
    const graphRepo = getGraphRepository();
    const edges: GraphEdge[] = [];

    for (const candidate of candidates) {
      const modelEdges = await graphRepo.findByModel(candidate.model_id);
      edges.push(...modelEdges);
    }

    // Deduplicate
    const seen = new Set<string>();
    return edges.filter((e) => {
      if (seen.has(e.edge_id)) return false;
      seen.add(e.edge_id);
      return true;
    });
  }

  /**
   * Manually trigger processing of an observation (for testing)
   */
  async triggerUpdate(observation: Observation): Promise<ModelUpdateResult> {
    return this.processObservation(observation);
  }
}

// =============================================================================
// Singleton
// =============================================================================

let instance: ModelUpdateEngine | null = null;

export function getModelUpdateEngine(
  config?: ModelUpdateEngineConfig
): ModelUpdateEngine {
  if (!instance) {
    instance = new ModelUpdateEngine(config);
  }
  return instance;
}

export function createModelUpdateEngine(
  config?: ModelUpdateEngineConfig
): ModelUpdateEngine {
  return new ModelUpdateEngine(config);
}
