import { useEffect, useState } from "react";
import type { NoemaIdentity, NarrationEvent } from "../api/noemaClient";
import { getMetrics, getImprovement, type RunMetrics } from "../api/noemaClient";

interface Props {
  identity: NoemaIdentity | null;
  events: NarrationEvent[];
}

const styles = {
  container: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
  },
  header: {
    padding: "8px 12px",
    fontSize: 11,
    fontWeight: 600,
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
    fontSize: 10,
    fontWeight: 600,
    color: "#6b7280",
    marginBottom: 6,
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

export default function LifetimePanel({ identity, events }: Props) {
  const [metrics, setMetrics] = useState<RunMetrics[]>([]);
  const [improvement, setImprovement] = useState<any>(null);

  // Fetch metrics when events complete
  useEffect(() => {
    const hasCompleted = events.some((e) => e.type === "run_completed");
    if (hasCompleted || events.length === 0) {
      getMetrics().then(setMetrics).catch(() => {});
      getImprovement().then(setImprovement).catch(() => {});
    }
  }, [events]);

  if (!identity) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>LIFETIME</div>
        <div style={styles.empty}>Connecting to NOEMA...</div>
      </div>
    );
  }

  // Experience events from current stream
  const experienceEvents = events.filter((e) => e.type === "experience_learned");

  return (
    <div style={styles.container}>
      <div style={styles.header}>LIFETIME</div>
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

        {/* Recent Experiences */}
        {experienceEvents.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Experiences Learned This Run</div>
            {experienceEvents.map((e, i) => (
              <div key={i} style={{ fontSize: 12, color: "#f472b6", lineHeight: 1.6, padding: "2px 0" }}>
                {e.message}
              </div>
            ))}
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
