import type { NarrationEvent } from "../api/noemaClient";

interface Props {
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
    color: "#fbbf24",
    borderBottom: "1px solid #1e1e2e",
    letterSpacing: 1,
  },
  body: {
    flex: 1,
    overflow: "auto",
    padding: 12,
  },
  evidenceItem: {
    padding: "6px 10px",
    marginBottom: 6,
    backgroundColor: "#111118",
    border: "1px solid #1e1e2e",
    borderRadius: 4,
  },
  evidenceType: {
    fontSize: 10,
    fontWeight: 600,
    color: "#fbbf24",
    textTransform: "uppercase" as const,
    marginBottom: 2,
  },
  evidenceMessage: {
    fontSize: 12,
    color: "#9ca3af",
    lineHeight: 1.5,
  },
  empty: {
    padding: 20,
    textAlign: "center" as const,
    color: "#4b5563",
    fontSize: 12,
  },
};

export default function EvidencePanel({ events }: Props) {
  const evidenceEvents = events.filter(
    (e) =>
      e.type === "evidence_captured" ||
      e.type === "belief_formed" ||
      e.type === "experience_learned"
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        EVIDENCE & BELIEFS
        {evidenceEvents.length > 0 && (
          <span style={{ color: "#6b7280", marginLeft: 8, fontWeight: 400 }}>
            {evidenceEvents.length} items
          </span>
        )}
      </div>
      <div style={styles.body}>
        {evidenceEvents.length === 0 && (
          <div style={styles.empty}>
            Evidence and beliefs will appear here as NOEMA observes and reasons.
          </div>
        )}
        {evidenceEvents.map((event, i) => (
          <div key={event.event_id || i} style={styles.evidenceItem}>
            <div style={styles.evidenceType}>
              {event.type === "evidence_captured" && "EVIDENCE"}
              {event.type === "belief_formed" && "BELIEF"}
              {event.type === "experience_learned" && "EXPERIENCE"}
            </div>
            <div style={styles.evidenceMessage}>{event.message}</div>
            {event.data?.confidence !== undefined && (
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                confidence: {(event.data.confidence as number).toFixed(2)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
