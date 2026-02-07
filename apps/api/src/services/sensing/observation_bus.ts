/**
 * ObservationBus - Event Abstraction for Observations
 * 
 * Purpose: Publish observation events for downstream subscribers.
 * 
 * MVP Implementation:
 * - In-memory pub/sub with callback list
 * - No persistence logic here
 * - Future: cognition layer will subscribe
 * 
 * This component does NOT:
 * - Interpret observations
 * - Make decisions
 * - Store data (that's ObservationRepo's job)
 */

import type { Observation } from "../../schemas/index.js";

export type ObservationHandler = (observation: Observation) => void | Promise<void>;

export interface ObservationBus {
  /**
   * Subscribe to observation events
   * @returns Unsubscribe function
   */
  subscribe(handler: ObservationHandler): () => void;

  /**
   * Publish an observation to all subscribers
   */
  publish(observation: Observation): Promise<void>;

  /**
   * Get current subscriber count (for debugging)
   */
  subscriberCount(): number;
}

/**
 * In-memory implementation of ObservationBus
 */
class InMemoryObservationBus implements ObservationBus {
  private handlers: Set<ObservationHandler> = new Set();

  subscribe(handler: ObservationHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async publish(observation: Observation): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const handler of this.handlers) {
      try {
        const result = handler(observation);
        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch (error) {
        // Log but don't fail - one subscriber error shouldn't break others
        console.error("[ObservationBus] Handler error:", error);
      }
    }

    // Wait for all async handlers
    await Promise.allSettled(promises);
  }

  subscriberCount(): number {
    return this.handlers.size;
  }
}

// Singleton instance
let instance: ObservationBus | null = null;

export function getObservationBus(): ObservationBus {
  if (!instance) {
    instance = new InMemoryObservationBus();
  }
  return instance;
}

export function createObservationBus(): ObservationBus {
  return new InMemoryObservationBus();
}
