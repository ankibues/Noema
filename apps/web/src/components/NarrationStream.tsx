import { useRef, useEffect } from "react";
import type { NarrationEvent } from "../api/noemaClient";

interface Props {
  events: NarrationEvent[];
  running: boolean;
  hideHeader?: boolean;
  /** Callback when user clicks "View Report" link */
  onViewReport?: () => void;
  /** Whether a report is available */
  reportReady?: boolean;
  /** Suggested next goal from NOEMA */
  suggestedNextGoal?: string | null;
  /** Callback when user clicks to test suggested scenarios */
  onSuggestedGoal?: (goal: string) => void;
}

const typeColors: Record<string, string> = {
  system: "#6b7280",
  narration: "#d4d4d8",
  action_started: "#60a5fa",
  action_completed: "#34d399",
  evidence_captured: "#fbbf24",
  belief_formed: "#a78bfa",
  experience_learned: "#f472b6",
  plan_generated: "#c084fc",
  plan_step_started: "#818cf8",
  plan_step_completed: "#34d399",
  run_started: "#22d3ee",
  run_completed: "#22c55e",
  error: "#ef4444",
};

const typeIcons: Record<string, string> = {
  system: "SYS",
  narration: "NAR",
  action_started: "ACT",
  action_completed: " OK",
  evidence_captured: "EVD",
  belief_formed: "BLF",
  experience_learned: "EXP",
  plan_generated: "PLN",
  plan_step_started: "TST",
  plan_step_completed: "  ✓",
  run_started: "RUN",
  run_completed: "END",
  error: "ERR",
};

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
    color: "#8b5cf6",
    borderBottom: "1px solid #1e1e2e",
    letterSpacing: 1,
  },
  stream: {
    flex: 1,
    overflow: "auto",
    padding: "8px 12px",
  },
  event: {
    display: "flex",
    gap: 8,
    marginBottom: 6,
    lineHeight: 1.5,
  },
  timestamp: {
    fontSize: 10,
    color: "#4b5563",
    whiteSpace: "nowrap" as const,
    minWidth: 60,
  },
  tag: (color: string) => ({
    fontSize: 10,
    fontWeight: 700,
    color,
    minWidth: 28,
    textAlign: "right" as const,
  }),
  message: (color: string) => ({
    color,
    fontSize: 13,
    flex: 1,
  }),
  cursor: {
    display: "inline-block",
    width: 7,
    height: 14,
    backgroundColor: "#a78bfa",
    marginLeft: 2,
    animation: "blink 1s steps(1) infinite",
  },
  empty: {
    padding: 20,
    textAlign: "center" as const,
    color: "#4b5563",
    fontSize: 12,
  },
  statusBox: {
    padding: "10px 14px",
    margin: "8px 0 4px",
    borderRadius: 6,
    border: "1px solid #2e2e3e",
    backgroundColor: "#111118",
  },
  reportLink: {
    color: "#22c55e",
    cursor: "pointer",
    textDecoration: "underline",
    fontWeight: 600,
  },
};

export default function NarrationStream({ events, running, hideHeader, onViewReport, reportReady, suggestedNextGoal, onSuggestedGoal }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, running]);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  // Determine the current phase from the last narration events
  const lastEvents = events.slice(-5);
  const budgetReached = events.some((e) => e.message?.includes("Action budget reached"));
  const planComplete = events.some((e) => e.message?.includes("Plan execution complete"));
  const isReflecting = events.some(
    (e) => e.message?.includes("reflecting") || e.message?.includes("comparing different approaches")
  );
  const runCompleted = events.some((e) => e.type === "run_completed");

  // Status indicator for the running state
  let statusMessage: string | null = null;
  let statusColor = "#a78bfa";

  if (running && !runCompleted) {
    if (budgetReached || planComplete) {
      if (isReflecting) {
        statusMessage = "Generating QA report and analyzing experiences...";
        statusColor = "#fbbf24";
      } else {
        statusMessage = "Plan execution complete. Preparing final report...";
        statusColor = "#fbbf24";
      }
    }
  }

  return (
    <div style={styles.container}>
      {!hideHeader && <div style={styles.header}>NARRATION</div>}
      <div style={styles.stream} ref={scrollRef}>
        {events.length === 0 && (
          <div style={styles.empty}>
            Submit a QA task to begin. NOEMA will narrate its cognition here.
          </div>
        )}
        {events.map((event, i) => {
          const color = typeColors[event.type] || "#d4d4d8";
          return (
            <div key={event.event_id || i} style={styles.event}>
              <span style={styles.timestamp}>{formatTime(event.timestamp)}</span>
              <span style={styles.tag(color)}>{typeIcons[event.type] || "???"}</span>
              <span style={styles.message(color)}>{event.message}</span>
            </div>
          );
        })}

        {/* Contextual status instead of generic "thinking" */}
        {running && !runCompleted && (
          <>
            {statusMessage ? (
              <div style={{
                ...styles.statusBox,
                borderColor: statusColor + "44",
              }}>
                <div style={{ fontSize: 12, color: statusColor, marginBottom: 4 }}>
                  ⏳ {statusMessage}
                </div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>
                  This may take a moment...
                </div>
              </div>
            ) : (
              <div style={styles.event}>
                <span style={styles.timestamp}>&nbsp;</span>
                <span style={styles.tag("#a78bfa")}>&gt;</span>
                <span style={styles.message("#a78bfa")}>
                  executing
                  <span style={styles.cursor} />
                </span>
              </div>
            )}
          </>
        )}

        {/* Run completed — show report link */}
        {runCompleted && reportReady && onViewReport && (
          <div style={{
            ...styles.statusBox,
            borderColor: "#22c55e44",
            marginTop: 12,
          }}>
            <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 600, marginBottom: 6 }}>
              ✅ Run complete — QA Report is ready
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span
                style={styles.reportLink}
                onClick={onViewReport}
              >
                📋 View Full QA Report →
              </span>
            </div>
          </div>
        )}

        {/* Suggested next scenarios */}
        {runCompleted && suggestedNextGoal && onSuggestedGoal && (
          <div style={{
            ...styles.statusBox,
            borderColor: "#8b5cf644",
            marginTop: 8,
          }}>
            <div style={{ fontSize: 12, color: "#a78bfa", fontWeight: 600, marginBottom: 6 }}>
              💡 Suggested next — scenarios not yet covered:
            </div>
            <div style={{ fontSize: 12, color: "#d4d4d8", lineHeight: 1.6, marginBottom: 8 }}>
              {suggestedNextGoal}
            </div>
            <button
              onClick={() => onSuggestedGoal(suggestedNextGoal)}
              style={{
                padding: "4px 12px",
                backgroundColor: "#312e81",
                border: "1px solid #6366f144",
                borderRadius: 4,
                color: "#a5b4fc",
                fontSize: 11,
                fontFamily: "inherit",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              ▶ Use as next test goal
            </button>
          </div>
        )}
      </div>
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
