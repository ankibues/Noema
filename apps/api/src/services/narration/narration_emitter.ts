/**
 * Narration Emitter
 * 
 * Streams NOEMA's self-explanation of its cognition and actions.
 * 
 * Narration must:
 * - Be first-person
 * - Be descriptive
 * - Reflect actual internal state
 * 
 * Narration must NOT:
 * - Express emotions or desires
 * - Claim consciousness
 * - Generate new cognition
 */

// =============================================================================
// Event Types
// =============================================================================

export type NarrationEventType =
  | "system"             // System lifecycle events
  | "narration"          // NOEMA self-narration
  | "action_started"     // An action is about to execute
  | "action_completed"   // An action finished
  | "evidence_captured"  // Evidence was captured
  | "belief_formed"      // A belief was formed or updated
  | "experience_learned" // An experience was learned
  | "plan_generated"     // A test plan was generated
  | "plan_step_started"  // A plan step is starting
  | "plan_step_completed" // A plan step finished
  | "run_started"        // A run began
  | "run_completed"      // A run finished
  | "error";             // An error occurred

export interface NarrationEvent {
  /** Auto-generated event ID */
  event_id: string;
  /** Monotonic sequence number */
  seq: number;
  /** Event type */
  type: NarrationEventType;
  /** Human-readable message */
  message: string;
  /** Optional structured data */
  data?: Record<string, unknown>;
  /** ISO timestamp */
  timestamp: string;
  /** Run ID this event belongs to */
  run_id?: string;
}

// =============================================================================
// Narration Emitter
// =============================================================================

type NarrationListener = (event: NarrationEvent) => void;

let globalSeq = 0;

export class NarrationEmitter {
  private listeners: Map<string, NarrationListener[]> = new Map();
  private globalListeners: NarrationListener[] = [];
  private history: NarrationEvent[] = [];
  private readonly maxHistory = 500;

  /**
   * Emit a narration event
   */
  emit(
    type: NarrationEventType,
    message: string,
    runId?: string,
    data?: Record<string, unknown>
  ): NarrationEvent {
    globalSeq++;
    const event: NarrationEvent = {
      event_id: `evt_${globalSeq}_${Date.now()}`,
      seq: globalSeq,
      type,
      message,
      data,
      timestamp: new Date().toISOString(),
      run_id: runId,
    };

    // Store in history
    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Notify global listeners
    for (const listener of this.globalListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[NarrationEmitter] Listener error:", error);
      }
    }

    // Notify run-specific listeners
    if (runId) {
      const runListeners = this.listeners.get(runId) || [];
      for (const listener of runListeners) {
        try {
          listener(event);
        } catch (error) {
          console.error("[NarrationEmitter] Listener error:", error);
        }
      }
    }

    return event;
  }

  /**
   * Subscribe to all events
   */
  onAll(listener: NarrationListener): () => void {
    this.globalListeners.push(listener);
    return () => {
      this.globalListeners = this.globalListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Subscribe to events for a specific run
   */
  onRun(runId: string, listener: NarrationListener): () => void {
    const existing = this.listeners.get(runId) || [];
    existing.push(listener);
    this.listeners.set(runId, existing);

    return () => {
      const arr = this.listeners.get(runId) || [];
      this.listeners.set(
        runId,
        arr.filter((l) => l !== listener)
      );
    };
  }

  /**
   * Get event history (optionally filtered by run)
   */
  getHistory(runId?: string): NarrationEvent[] {
    if (runId) {
      return this.history.filter((e) => e.run_id === runId);
    }
    return [...this.history];
  }

  /**
   * Get events since a specific sequence number
   */
  getEventsSince(sinceSeq: number, runId?: string): NarrationEvent[] {
    const events = runId
      ? this.history.filter((e) => e.run_id === runId)
      : this.history;
    return events.filter((e) => e.seq > sinceSeq);
  }

  /**
   * Clean up listeners for a completed run
   */
  cleanupRun(runId: string): void {
    this.listeners.delete(runId);
  }
}

// =============================================================================
// Singleton
// =============================================================================

let instance: NarrationEmitter | null = null;

export function getNarrationEmitter(): NarrationEmitter {
  if (!instance) {
    instance = new NarrationEmitter();
  }
  return instance;
}
