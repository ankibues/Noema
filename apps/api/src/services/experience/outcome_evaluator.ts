/**
 * Outcome Evaluator
 * 
 * Compares rollout outcomes using observable signals only.
 * No subjective scoring - only measurable criteria.
 * 
 * Evaluation criteria:
 * - Success/failure
 * - Evidence clarity
 * - Error specificity
 * - Ambiguity reduction
 * - Signal strength
 * 
 * This component does NOT:
 * - Update beliefs
 * - Extract experiences
 * - Make decisions
 */

import type {
  Rollout,
  RolloutSet,
  RolloutComparison,
  EvaluatedRollout,
  EvaluationCriteria,
} from "./types.js";

export interface OutcomeEvaluatorConfig {
  /** Minimum margin to declare a clear winner (default: 0.15) */
  minWinMargin?: number;
  /** Weight for success criterion (default: 0.3) */
  successWeight?: number;
  /** Weight for evidence clarity (default: 0.2) */
  clarityWeight?: number;
  /** Weight for error specificity (default: 0.2) */
  specificityWeight?: number;
  /** Weight for ambiguity reduction (default: 0.15) */
  ambiguityWeight?: number;
  /** Weight for signal strength (default: 0.15) */
  signalWeight?: number;
}

const DEFAULT_CONFIG: Required<OutcomeEvaluatorConfig> = {
  minWinMargin: 0.15,
  successWeight: 0.3,
  clarityWeight: 0.2,
  specificityWeight: 0.2,
  ambiguityWeight: 0.15,
  signalWeight: 0.15,
};

export class OutcomeEvaluator {
  private readonly config: Required<OutcomeEvaluatorConfig>;

  constructor(config: Partial<OutcomeEvaluatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Compare rollouts and determine winner
   */
  compare(rolloutSet: RolloutSet): RolloutComparison {
    console.log(`[OutcomeEvaluator] Comparing ${rolloutSet.rollouts.length} rollouts`);

    // Evaluate each rollout
    const evaluatedRollouts = rolloutSet.rollouts.map((rollout) =>
      this.evaluateRollout(rollout)
    );

    // Sort by overall score (descending)
    evaluatedRollouts.sort((a, b) => b.overallScore - a.overallScore);

    // Assign ranks
    evaluatedRollouts.forEach((er, index) => {
      er.rank = index + 1;
    });

    // Determine winner
    const winner = evaluatedRollouts.length > 0 ? evaluatedRollouts[0] : null;
    const runnerUp = evaluatedRollouts.length > 1 ? evaluatedRollouts[1] : null;

    const winMargin = winner && runnerUp
      ? winner.overallScore - runnerUp.overallScore
      : winner
      ? 1.0
      : 0;

    const hasClearWinner = winMargin >= this.config.minWinMargin;

    // Log comparison results
    for (const er of evaluatedRollouts) {
      console.log(
        `[OutcomeEvaluator] Rollout ${er.rollout.rollout_id.substring(0, 8)}... ` +
        `score=${er.overallScore.toFixed(3)} rank=${er.rank}`
      );
    }

    if (hasClearWinner && winner) {
      console.log(
        `[OutcomeEvaluator] Clear winner: ${winner.rollout.rollout_id.substring(0, 8)}... ` +
        `(margin: ${winMargin.toFixed(3)})`
      );
    } else {
      console.log(`[OutcomeEvaluator] No clear winner (margin: ${winMargin.toFixed(3)} < ${this.config.minWinMargin})`);
    }

    return {
      set_id: rolloutSet.set_id,
      evaluatedRollouts,
      winner: hasClearWinner && winner ? winner.rollout : null,
      losers: hasClearWinner
        ? evaluatedRollouts.slice(1).map((er) => er.rollout)
        : [],
      hasClearWinner,
      winMargin,
    };
  }

  /**
   * Evaluate a single rollout
   */
  private evaluateRollout(rollout: Rollout): EvaluatedRollout {
    const criteria = this.computeCriteria(rollout);
    const overallScore = this.computeOverallScore(criteria);

    return {
      rollout,
      criteria,
      overallScore,
      rank: 0, // Will be assigned after sorting
    };
  }

  /**
   * Compute evaluation criteria for a rollout
   */
  private computeCriteria(rollout: Rollout): EvaluationCriteria {
    const outcome = rollout.outcome;
    const artifacts = outcome.artifacts;

    // Success: binary
    const success = outcome.status === "success";

    // Evidence clarity: based on artifacts produced
    const evidenceClarity = this.computeEvidenceClarity(artifacts);

    // Error specificity: how specific is the error message?
    const errorSpecificity = this.computeErrorSpecificity(outcome);

    // Ambiguity reduction: did we get clear information?
    const ambiguityReduction = this.computeAmbiguityReduction(rollout);

    // Signal strength: how strong is the outcome signal?
    const signalStrength = this.computeSignalStrength(outcome);

    return {
      success,
      evidenceClarity,
      errorSpecificity,
      ambiguityReduction,
      signalStrength,
    };
  }

  /**
   * Compute evidence clarity score
   */
  private computeEvidenceClarity(artifacts: {
    screenshots: string[];
    logs: string[];
    network_errors: string[];
  }): number {
    let score = 0;

    // Screenshots provide visual evidence
    if (artifacts.screenshots.length > 0) {
      score += 0.4;
    }

    // Logs provide textual evidence
    if (artifacts.logs.length > 0) {
      score += 0.3;
      // More detailed logs are better
      const totalLogLength = artifacts.logs.join("").length;
      if (totalLogLength > 100) score += 0.1;
      if (totalLogLength > 500) score += 0.1;
    }

    // Network errors indicate specific issues
    if (artifacts.network_errors.length > 0) {
      score += 0.1; // Errors are informative but not ideal
    }

    return Math.min(score, 1.0);
  }

  /**
   * Compute error specificity score
   */
  private computeErrorSpecificity(outcome: {
    status: "success" | "failure";
    error_message?: string;
    artifacts: { logs: string[] };
  }): number {
    if (outcome.status === "success") {
      return 0.8; // Success is specific
    }

    const errorMessage = outcome.error_message || "";
    const logs = outcome.artifacts.logs.join(" ");

    let score = 0.3; // Base score for having an error

    // Check for specific error patterns
    const specificPatterns = [
      /timeout/i,
      /not found/i,
      /element.*not.*visible/i,
      /navigation.*failed/i,
      /selector.*invalid/i,
      /connection.*refused/i,
      /net::ERR/i,
    ];

    for (const pattern of specificPatterns) {
      if (pattern.test(errorMessage) || pattern.test(logs)) {
        score += 0.15;
      }
    }

    // Longer, more detailed error messages are more specific
    if (errorMessage.length > 50) score += 0.1;
    if (errorMessage.length > 100) score += 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Compute ambiguity reduction score
   */
  private computeAmbiguityReduction(rollout: Rollout): number {
    let score = 0.3; // Base score

    // More observations = more information
    if (rollout.observationIds.length > 0) {
      score += 0.2;
    }
    if (rollout.observationIds.length > 2) {
      score += 0.2;
    }

    // Clear success/failure reduces ambiguity
    if (rollout.outcome.status === "success") {
      score += 0.3;
    } else if (rollout.outcome.error_message) {
      score += 0.2; // Error with message is less ambiguous than silent failure
    }

    return Math.min(score, 1.0);
  }

  /**
   * Compute signal strength score
   */
  private computeSignalStrength(outcome: {
    status: "success" | "failure";
    duration_ms: number;
    artifacts: { screenshots: string[]; logs: string[] };
  }): number {
    let score = 0.3; // Base score

    // Success is a strong signal
    if (outcome.status === "success") {
      score += 0.4;
    }

    // Quick actions with clear results are strong signals
    if (outcome.duration_ms < 1000) {
      score += 0.1;
    } else if (outcome.duration_ms < 5000) {
      score += 0.05;
    }

    // Artifacts strengthen the signal
    if (outcome.artifacts.screenshots.length > 0) {
      score += 0.1;
    }
    if (outcome.artifacts.logs.length > 0) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Compute overall score from criteria
   */
  private computeOverallScore(criteria: EvaluationCriteria): number {
    return (
      (criteria.success ? 1 : 0) * this.config.successWeight +
      criteria.evidenceClarity * this.config.clarityWeight +
      criteria.errorSpecificity * this.config.specificityWeight +
      criteria.ambiguityReduction * this.config.ambiguityWeight +
      criteria.signalStrength * this.config.signalWeight
    );
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createOutcomeEvaluator(
  config?: Partial<OutcomeEvaluatorConfig>
): OutcomeEvaluator {
  return new OutcomeEvaluator(config);
}
