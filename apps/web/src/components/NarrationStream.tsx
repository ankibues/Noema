import { useRef, useEffect } from "react";
import type { NarrationEvent } from "../api/noemaClient";

interface Props {
  events: NarrationEvent[];
  running: boolean;
}

const typeColors: Record<string, string> = {
  system: "#6b7280",
  narration: "#d4d4d8",
  action_started: "#60a5fa",
  action_completed: "#34d399",
  evidence_captured: "#fbbf24",
  belief_formed: "#a78bfa",
  experience_learned: "#f472b6",
  run_started: "#22d3ee",
  run_completed: "#22c55e",
  error: "#ef4444",
};

const typeIcons: Record<string, string> = {
  system: "SYS",
  narration: "NAR",
  action_started: "ACT",
  action_completed: "OK",
  evidence_captured: "EVD",
  belief_formed: "BLF",
  experience_learned: "EXP",
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
    padding: "8px 12px",
    fontSize: 11,
    fontWeight: 600,
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
};

export default function NarrationStream({ events, running }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>NARRATION</div>
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
        {running && (
          <div style={styles.event}>
            <span style={styles.timestamp}>&nbsp;</span>
            <span style={styles.tag("#a78bfa")}>&gt;</span>
            <span style={styles.message("#a78bfa")}>
              thinking
              <span style={styles.cursor} />
            </span>
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
