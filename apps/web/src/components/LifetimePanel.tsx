import { useEffect, useState } from "react";
import type { NoemaIdentity, NarrationEvent } from "../api/noemaClient";
import {
  getMetrics,
  getImprovement,
  getModels,
  getExperiences,
  type RunMetrics,
  type MentalModelSummary,
  type ExperienceSummary,
} from "../api/noemaClient";

interface Props {
  identity: NoemaIdentity | null;
  events: NarrationEvent[];
  hideHeader?: boolean;
}

const styles = {
  container: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
  },
  header: {
    padding: "10px 14px",
    fontSize: 15,
    fontWeight: 700,
    color: "#f472b6",
    borderBottom: "1px solid #1e1e2e",
    letterSpacing: 1,
  },
  body: {
    flex: 1,
    overflow: "auto",
    padding: 12,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#9ca3af",
    marginBottom: 8,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
  },
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "4px 0",
    fontSize: 12,
    borderBottom: "1px solid #111118",
  },
  statLabel: {
    color: "#6b7280",
  },
  statValue: {
    color: "#d4d4d8",
    fontWeight: 600,
  },
  bigNumber: {
    fontSize: 28,
    fontWeight: 700,
    color: "#a78bfa",
    lineHeight: 1,
  },
  bigLabel: {
    fontSize: 10,
    color: "#6b7280",
    marginTop: 2,
    letterSpacing: 1,
  },
  bigRow: {
    display: "flex",
    gap: 24,
    marginBottom: 16,
  },
  bigCard: {
    flex: 1,
    padding: "12px",
    backgroundColor: "#111118",
    border: "1px solid #1e1e2e",
    borderRadius: 6,
    textAlign: "center" as const,
  },
  modelCard: {
    padding: "6px 10px",
    marginBottom: 4,
    backgroundColor: "#14101f",
    border: "1px solid #2d2353",
    borderRadius: 4,
  },
  modelTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: "#a78bfa",
    marginBottom: 2,
  },
  modelSummary: {
    fontSize: 10,
    color: "#9ca3af",
    lineHeight: 1.4,
  },
  experienceCard: {
    padding: "6px 10px",
    marginBottom: 4,
    backgroundColor: "#1a0f1e",
    border: "1px solid #3d2353",
    borderRadius: 4,
  },
  experienceStatement: {
    fontSize: 10,
    color: "#f9a8d4",
    lineHeight: 1.4,
  },
  confidenceBar: (confidence: number) => ({
    height: 2,
    borderRadius: 1,
    backgroundColor: "#1e1e2e",
    marginTop: 3,
    overflow: "hidden" as const,
  }),
  confidenceFill: (confidence: number) => ({
    height: "100%",
    width: `${Math.min(confidence * 100, 100)}%`,
    backgroundColor: confidence >= 0.7 ? "#22c55e" : confidence >= 0.4 ? "#fbbf24" : "#ef4444",
    borderRadius: 1,
  }),
  improvementLine: (improved: boolean) => ({
    fontSize: 12,
    color: improved ? "#34d399" : "#6b7280",
    lineHeight: 1.6,
    padding: "2px 0",
  }),
  empty: {
    padding: 20,
    textAlign: "center" as const,
    color: "#4b5563",
    fontSize: 12,
  },
  identity: {
    fontSize: 12,
    color: "#8b5cf6",
    lineHeight: 1.6,
    fontStyle: "italic" as const,
    padding: "8px 12px",
    backgroundColor: "#0f0f18",
    border: "1px solid #1e1e2e",
    borderRadius: 4,
    marginBottom: 12,
  },
};

export default function LifetimePanel({ identity, events, hideHeader }: Props) {
  const [metrics, setMetrics] = useState<RunMetrics[]>([]);
  const [improvement, setImprovement] = useState<any>(null);
  const [models, setModels] = useState<MentalModelSummary[]>([]);
  const [experiences, setExperiences] = useState<ExperienceSummary[]>([]);

  // Fetch metrics, models, and experiences when events complete
  useEffect(() => {
    const hasCompleted = events.some((e) => e.type === "run_completed");
    if (hasCompleted || events.length === 0) {
      getMetrics().then(setMetrics).catch(() => {});
      getImprovement().then(setImprovement).catch(() => {});
      getModels().then(setModels).catch(() => {});
      getExperiences().then(setExperiences).catch(() => {});
    }
  }, [events]);

  // Also refresh when beliefs/experiences are formed mid-run
  useEffect(() => {
    const beliefOrExpEvent = events.filter(
      (e) => e.type === "belief_formed" || e.type === "experience_learned"
    );
    if (beliefOrExpEvent.length > 0) {
      getModels().then(setModels).catch(() => {});
      getExperiences().then(setExperiences).catch(() => {});
    }
  }, [events.length]);

  if (!identity) {
    return (
      <div style={styles.container}>
        {!hideHeader && <div style={styles.header}>LIFETIME</div>}
        <div style={styles.empty}>Connecting to NOEMA...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {!hideHeader && <div style={styles.header}>LIFETIME</div>}
      <div style={styles.body}>
        {/* Identity Statement */}
        <div style={styles.identity}>{identity.statement}</div>

        {/* Big Numbers */}
        <div style={styles.bigRow}>
          <div style={styles.bigCard}>
            <div style={styles.bigNumber}>{identity.age}</div>
            <div style={styles.bigLabel}>AGE</div>
          </div>
          <div style={styles.bigCard}>
            <div style={styles.bigNumber}>{identity.total_runs}</div>
            <div style={styles.bigLabel}>RUNS</div>
          </div>
          <div style={styles.bigCard}>
            <div style={styles.bigNumber}>{identity.total_experiences}</div>
            <div style={styles.bigLabel}>EXPERIENCES</div>
          </div>
        </div>

        {/* Mental Models */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>🧠 Mental Models ({models.length})</div>
          {models.length === 0 ? (
            <div style={{ fontSize: 11, color: "#4b5563", padding: "4px 0" }}>
              No mental models yet. NOEMA will form beliefs as it observes and tests.
            </div>
          ) : (
            models.map((model) => (
              <div key={model.model_id} style={styles.modelCard}>
                <div style={styles.modelTitle}>
                  {model.title}
                  <span style={{ fontSize: 9, color: "#6b7280", fontWeight: 400, marginLeft: 6 }}>
                    {model.status} · {(model.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div style={styles.modelSummary}>
                  {model.summary.length > 150 ? model.summary.substring(0, 150) + "..." : model.summary}
                </div>
                <div style={styles.confidenceBar(model.confidence)}>
                  <div style={styles.confidenceFill(model.confidence)} />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Experiences */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>💡 Learned Experiences ({experiences.length})</div>
          {experiences.length === 0 ? (
            <div style={{ fontSize: 11, color: "#4b5563", padding: "4px 0" }}>
              No experiences yet. NOEMA will learn action heuristics as it tests.
            </div>
          ) : (
            experiences.map((exp) => (
              <div key={exp.experience_id} style={styles.experienceCard}>
                <div style={styles.experienceStatement}>
                  {exp.statement}
                </div>
                <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2, display: "flex", gap: 8 }}>
                  <span>confidence: {(exp.confidence * 100).toFixed(0)}%</span>
                  <span>applied: {exp.times_applied}×</span>
                  {exp.source_task && (
                    <span>scope: {exp.source_task.length > 30 ? exp.source_task.substring(0, 30) + "..." : exp.source_task}</span>
                  )}
                </div>
                <div style={styles.confidenceBar(exp.confidence)}>
                  <div style={styles.confidenceFill(exp.confidence)} />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Stats */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Accumulated State</div>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>Observations</span>
            <span style={styles.statValue}>{identity.total_observations}</span>
          </div>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>Mental Models</span>
            <span style={styles.statValue}>{identity.total_models}</span>
          </div>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>Experiences</span>
            <span style={styles.statValue}>{identity.total_experiences}</span>
          </div>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>Domains Seen</span>
            <span style={styles.statValue}>{identity.domains_seen.join(", ") || "none"}</span>
          </div>
        </div>

        {/* Improvement */}
        {improvement && improvement.signals && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Improvement Over Time</div>
            {improvement.signals.length === 0 ? (
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {improvement.conclusion || improvement.message || "First run — no comparison yet."}
              </div>
            ) : (
              <>
                {improvement.signals.map((signal: any, i: number) => (
                  <div key={i} style={styles.improvementLine(signal.direction === "improved")}>
                    {signal.direction === "improved" ? "+" : signal.direction === "regressed" ? "-" : "="}{" "}
                    {signal.description}
                  </div>
                ))}
                <div style={{ marginTop: 8, fontSize: 12, color: "#a78bfa", fontWeight: 600 }}>
                  {improvement.conclusion}
                </div>
              </>
            )}
          </div>
        )}

        {/* Run History */}
        {metrics.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Run History</div>
            {metrics.slice(-5).reverse().map((m, i) => (
              <div key={i} style={styles.statRow}>
                <span style={styles.statLabel}>
                  {m.task_type} ({m.steps_taken} steps)
                </span>
                <span style={{ ...styles.statValue, color: m.success ? "#34d399" : "#ef4444" }}>
                  {m.success ? "PASS" : "FAIL"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
