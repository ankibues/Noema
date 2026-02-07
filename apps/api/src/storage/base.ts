/**
 * Base Repository
 * 
 * Provides JSON file-based persistence with:
 * - In-memory cache for fast reads
 * - Write-through persistence
 * - Zod schema validation on all writes
 * - Async API for future DB migration
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

export interface RepositoryConfig {
  /** Path to the JSON file for this collection */
  filePath: string;
  /** Zod schema for validating items */
  schema: z.ZodSchema;
  /** Field name for the primary key */
  idField: string;
}

export class BaseRepository<T extends Record<string, unknown>> {
  protected items: Map<string, T> = new Map();
  protected loaded = false;
  protected readonly config: RepositoryConfig;

  constructor(config: RepositoryConfig) {
    this.config = config;
  }

  /**
   * Initialize the repository by loading from disk
   */
  async init(): Promise<void> {
    if (this.loaded) return;

    const dir = dirname(this.config.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    if (existsSync(this.config.filePath)) {
      try {
        const content = await readFile(this.config.filePath, "utf-8");
        const data = JSON.parse(content) as T[];
        
        for (const item of data) {
          const id = item[this.config.idField] as string;
          // Validate on load to catch corrupted data
          const validated = this.config.schema.parse(item);
          this.items.set(id, validated as T);
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new Error(
            `Schema validation failed loading ${this.config.filePath}: ${error.message}`
          );
        }
        throw error;
      }
    }

    this.loaded = true;
  }

  /**
   * Persist current state to disk
   */
  protected async persist(): Promise<void> {
    const data = Array.from(this.items.values());
    const content = JSON.stringify(data, null, 2);
    
    const dir = dirname(this.config.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    
    await writeFile(this.config.filePath, content, "utf-8");
  }

  /**
   * Validate an item against the schema
   */
  protected validate(item: unknown): T {
    return this.config.schema.parse(item) as T;
  }

  /**
   * Get an item by ID
   */
  async get(id: string): Promise<T | undefined> {
    await this.init();
    return this.items.get(id);
  }

  /**
   * Get multiple items by IDs
   */
  async getMany(ids: string[]): Promise<T[]> {
    await this.init();
    const results: T[] = [];
    for (const id of ids) {
      const item = this.items.get(id);
      if (item) results.push(item);
    }
    return results;
  }

  /**
   * List all items, optionally filtered
   */
  async list(filter?: (item: T) => boolean): Promise<T[]> {
    await this.init();
    const all = Array.from(this.items.values());
    return filter ? all.filter(filter) : all;
  }

  /**
   * Check if an item exists
   */
  async exists(id: string): Promise<boolean> {
    await this.init();
    return this.items.has(id);
  }

  /**
   * Count items, optionally filtered
   */
  async count(filter?: (item: T) => boolean): Promise<number> {
    const items = await this.list(filter);
    return items.length;
  }

  /**
   * Internal: Set an item (used by subclasses)
   */
  protected async _set(id: string, item: T): Promise<void> {
    await this.init();
    const validated = this.validate(item);
    this.items.set(id, validated);
    await this.persist();
  }

  /**
   * Internal: Delete an item (used by subclasses that allow deletion)
   */
  protected async _delete(id: string): Promise<boolean> {
    await this.init();
    const existed = this.items.delete(id);
    if (existed) {
      await this.persist();
    }
    return existed;
  }
}

/**
 * Get the data directory path
 */
export function getDataDir(): string {
  // Navigate from apps/api/src/storage to project root data/
  return join(import.meta.dirname, "..", "..", "..", "..", "data");
}

/**
 * Get the full path for a collection file
 */
export function getCollectionPath(collection: string): string {
  return join(getDataDir(), `${collection}.json`);
}

/**
 * Generate ISO timestamp for current time
 */
export function nowISO(): string {
  return new Date().toISOString();
}
