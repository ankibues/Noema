/**
 * Graph Repository
 * 
 * Stores explicit edge records between mental models.
 * No automatic graph reasoning in this phase - just storage.
 * 
 * Edge types:
 * - depends_on: Model A requires Model B to be valid
 * - explains: Model A provides explanation for Model B
 * - extends: Model A builds upon Model B
 * - contradicts: Model A conflicts with Model B
 */

import { v4 as uuid } from "uuid";
import {
  GraphEdge,
  GraphEdgeSchema,
  CreateGraphEdgeInput,
  GraphRelation,
} from "../schemas/index.js";
import { BaseRepository, getCollectionPath, nowISO } from "./base.js";

export interface UpdateGraphEdgeInput {
  /** Fields to update */
  updates: Partial<Omit<GraphEdge, "edge_id" | "created_at" | "last_updated">>;
  /** Additional evidence to add */
  additionalEvidence?: string[];
}

export class GraphRepository extends BaseRepository<GraphEdge> {
  constructor() {
    super({
      filePath: getCollectionPath("graph_edges"),
      schema: GraphEdgeSchema,
      idField: "edge_id",
    });
  }

  /**
   * Create a new edge between models
   */
  async create(input: CreateGraphEdgeInput): Promise<GraphEdge> {
    const now = nowISO();
    const edge: GraphEdge = {
      ...input,
      edge_id: uuid(),
      created_at: now,
      last_updated: now,
    };

    await this._set(edge.edge_id, edge);
    return edge;
  }

  /**
   * Update an edge
   */
  async update(
    id: string,
    input: UpdateGraphEdgeInput
  ): Promise<GraphEdge | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;

    const evidenceIds = input.additionalEvidence
      ? [...new Set([...existing.evidence_ids, ...input.additionalEvidence])]
      : existing.evidence_ids;

    const updated: GraphEdge = {
      ...existing,
      ...input.updates,
      // Immutable fields preserved
      edge_id: existing.edge_id,
      created_at: existing.created_at,
      // Updated metadata
      last_updated: nowISO(),
      evidence_ids: evidenceIds,
    };

    await this._set(id, updated);
    return updated;
  }

  /**
   * Find all edges from a model
   */
  async findFromModel(modelId: string): Promise<GraphEdge[]> {
    return this.list((edge) => edge.from_model === modelId);
  }

  /**
   * Find all edges to a model
   */
  async findToModel(modelId: string): Promise<GraphEdge[]> {
    return this.list((edge) => edge.to_model === modelId);
  }

  /**
   * Find all edges involving a model (either direction)
   */
  async findByModel(modelId: string): Promise<GraphEdge[]> {
    return this.list(
      (edge) => edge.from_model === modelId || edge.to_model === modelId
    );
  }

  /**
   * Find edges by relation type
   */
  async findByRelation(relation: GraphRelation): Promise<GraphEdge[]> {
    return this.list((edge) => edge.relation === relation);
  }

  /**
   * Find edge between two specific models
   */
  async findBetween(
    fromModelId: string,
    toModelId: string
  ): Promise<GraphEdge | undefined> {
    const edges = await this.list(
      (edge) => edge.from_model === fromModelId && edge.to_model === toModelId
    );
    return edges[0];
  }

  /**
   * Find all contradictions for a model
   */
  async findContradictions(modelId: string): Promise<GraphEdge[]> {
    return this.list(
      (edge) =>
        edge.relation === "contradicts" &&
        (edge.from_model === modelId || edge.to_model === modelId)
    );
  }

  /**
   * Find all dependencies for a model
   */
  async findDependencies(modelId: string): Promise<GraphEdge[]> {
    return this.list(
      (edge) => edge.relation === "depends_on" && edge.from_model === modelId
    );
  }

  /**
   * Find all models that depend on a given model
   */
  async findDependents(modelId: string): Promise<GraphEdge[]> {
    return this.list(
      (edge) => edge.relation === "depends_on" && edge.to_model === modelId
    );
  }

  /**
   * Strengthen an edge (increase weight)
   */
  async strengthen(
    id: string,
    evidenceId: string,
    boost: number = 0.1
  ): Promise<GraphEdge | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;

    return this.update(id, {
      updates: {
        weight: Math.min(1, existing.weight + boost),
      },
      additionalEvidence: [evidenceId],
    });
  }

  /**
   * Weaken an edge (decrease weight)
   */
  async weaken(
    id: string,
    evidenceId: string,
    penalty: number = 0.1
  ): Promise<GraphEdge | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;

    return this.update(id, {
      updates: {
        weight: Math.max(0, existing.weight - penalty),
      },
      additionalEvidence: [evidenceId],
    });
  }

  /**
   * Delete an edge
   */
  async delete(id: string): Promise<boolean> {
    return this._delete(id);
  }

  /**
   * Delete all edges involving a model (for cleanup when model is removed)
   */
  async deleteByModel(modelId: string): Promise<number> {
    const edges = await this.findByModel(modelId);
    let deleted = 0;
    for (const edge of edges) {
      if (await this._delete(edge.edge_id)) {
        deleted++;
      }
    }
    return deleted;
  }
}

// Singleton instance
let instance: GraphRepository | null = null;

export function getGraphRepository(): GraphRepository {
  if (!instance) {
    instance = new GraphRepository();
  }
  return instance;
}
