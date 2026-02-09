/**
 * Model Persister
 * 
 * Persists model updates and creates graph edges.
 * 
 * Guarantees:
 * - Mental models persist across runs
 * - update_history never mutates past entries
 * - Confidence changes are monotonic and explainable
 * - Every belief can answer: "Why do you believe this?"
 */

import {
  getMentalModelRepository,
  getGraphRepository,
} from "../../storage/index.js";
import type { MentalModel } from "../../schemas/index.js";
import type {
  ModelCreateInstruction,
  ModelUpdateInstruction,
  GraphUpdate,
} from "./types.js";

export interface PersistResult {
  /** IDs of created models */
  createdModels: string[];
  /** IDs of updated models */
  updatedModels: string[];
  /** IDs of created graph edges */
  createdEdges: string[];
}

/**
 * Persist model creations
 */
export async function persistNewModels(
  instructions: ModelCreateInstruction[]
): Promise<string[]> {
  const modelRepo = getMentalModelRepository();
  const createdIds: string[] = [];

  for (const instruction of instructions) {
    const model = await modelRepo.create({
      title: instruction.title,
      domain: instruction.domain,
      tags: instruction.tags,
      summary: instruction.summary,
      core_principles: instruction.core_principles,
      assumptions: instruction.assumptions,
      procedures: instruction.procedures,
      failure_modes: instruction.failure_modes,
      diagnostics: instruction.diagnostics,
      examples: instruction.examples,
      confidence: instruction.confidence,
      status: "candidate", // New models start as candidates
      evidence_ids: instruction.evidence_ids,
    });

    createdIds.push(model.model_id);
    console.log(`[ModelPersister] Created model: ${model.title} (${model.model_id})`);
  }

  return createdIds;
}

/**
 * Persist model updates
 */
export async function persistModelUpdates(
  instructions: ModelUpdateInstruction[]
): Promise<{ updatedModels: string[]; createdEdges: string[] }> {
  const modelRepo = getMentalModelRepository();
  const updatedIds: string[] = [];
  const createdEdgeIds: string[] = [];

  for (const instruction of instructions) {
    // Skip if no model_id
    if (!instruction.model_id) {
      console.warn("[ModelPersister] Skipping update with no model_id");
      continue;
    }

    // Get existing model
    const existing = await modelRepo.get(instruction.model_id);
    if (!existing) {
      console.warn(`[ModelPersister] Model not found: ${instruction.model_id}`);
      continue;
    }

    // Build update with patch
    const updates: Partial<MentalModel> = {};

    if (instruction.patch.summary) {
      updates.summary = instruction.patch.summary;
    }
    if (instruction.patch.core_principles) {
      updates.core_principles = mergeArrays(
        existing.core_principles,
        instruction.patch.core_principles
      );
    }
    if (instruction.patch.assumptions) {
      updates.assumptions = mergeArrays(
        existing.assumptions,
        instruction.patch.assumptions
      );
    }
    if (instruction.patch.procedures) {
      updates.procedures = mergeArrays(
        existing.procedures,
        instruction.patch.procedures
      );
    }
    if (instruction.patch.failure_modes) {
      updates.failure_modes = mergeArrays(
        existing.failure_modes,
        instruction.patch.failure_modes
      );
    }
    if (instruction.patch.diagnostics) {
      updates.diagnostics = mergeArrays(
        existing.diagnostics,
        instruction.patch.diagnostics
      );
    }
    if (instruction.patch.examples) {
      updates.examples = mergeArrays(
        existing.examples,
        instruction.patch.examples
      );
    }

    // Calculate new confidence
    const newConfidence = Math.max(
      0,
      Math.min(1, existing.confidence + instruction.delta_confidence)
    );
    updates.confidence = newConfidence;

    // Promote to active if confidence is high enough
    if (existing.status === "candidate" && newConfidence >= 0.6) {
      updates.status = "active";
    }

    // Update the model
    const updated = await modelRepo.update(instruction.model_id, {
      change_summary: instruction.change_summary,
      evidence_ids: instruction.evidence_ids,
      updates,
    });

    if (updated) {
      updatedIds.push(updated.model_id);
      console.log(
        `[ModelPersister] Updated model: ${updated.title} ` +
        `(confidence: ${existing.confidence.toFixed(2)} → ${updated.confidence.toFixed(2)})`
      );
    }

    // Create graph edges
    if (instruction.graph_updates) {
      for (const graphUpdate of instruction.graph_updates) {
        const edgeId = await createGraphEdge(
          instruction.model_id,
          graphUpdate,
          instruction.evidence_ids
        );
        if (edgeId) {
          createdEdgeIds.push(edgeId);
        }
      }
    }
  }

  return { updatedModels: updatedIds, createdEdges: createdEdgeIds };
}

/**
 * Create a graph edge between models
 */
async function createGraphEdge(
  fromModelId: string,
  update: GraphUpdate,
  evidenceIds: string[]
): Promise<string | null> {
  const graphRepo = getGraphRepository();

  // Check if edge already exists
  const existing = await graphRepo.findBetween(fromModelId, update.to_model);
  if (existing) {
    // Strengthen existing edge
    await graphRepo.strengthen(existing.edge_id, evidenceIds[0] || "");
    console.log(`[ModelPersister] Strengthened edge: ${fromModelId} → ${update.to_model}`);
    return existing.edge_id;
  }

  // Create new edge
  const edge = await graphRepo.create({
    from_model: fromModelId,
    to_model: update.to_model,
    relation: update.relation,
    weight: update.weight,
    evidence_ids: evidenceIds,
  });

  console.log(
    `[ModelPersister] Created edge: ${fromModelId} --${update.relation}--> ${update.to_model}`
  );

  return edge.edge_id;
}

/**
 * Link observation to models by adding the observation to each model's evidence_ids.
 * This ensures every model tracks which observations contributed to its formation/update.
 */
export async function linkObservationToModels(
  observationId: string,
  modelIds: string[],
  _relation: "explains" | "extends" = "explains"
): Promise<string[]> {
  const modelRepo = getMentalModelRepository();
  const linkedIds: string[] = [];

  for (const modelId of modelIds) {
    try {
      const model = await modelRepo.get(modelId);
      if (!model) continue;

      // Only add if not already linked
      if (!model.evidence_ids.includes(observationId)) {
        await modelRepo.update(modelId, {
          change_summary: `Linked to observation ${observationId.substring(0, 8)}`,
          evidence_ids: [observationId],
          updates: {
            evidence_ids: [...model.evidence_ids, observationId],
          },
        });
        linkedIds.push(modelId);
        console.log(
          `[ModelPersister] Observation ${observationId.substring(0, 8)}... linked to model ${modelId.substring(0, 8)}...`
        );
      }
    } catch (error) {
      console.warn(`[ModelPersister] Failed to link observation to model ${modelId}:`, error);
    }
  }

  return linkedIds;
}

/**
 * Merge arrays, avoiding duplicates
 */
function mergeArrays(existing: string[], additions: string[]): string[] {
  const set = new Set(existing);
  for (const item of additions) {
    if (item && item.trim()) {
      set.add(item.trim());
    }
  }
  return Array.from(set);
}
