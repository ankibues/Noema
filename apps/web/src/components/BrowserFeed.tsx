import type { NarrationEvent } from "../api/noemaClient";

interface Props {
  screenshots: string[];
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
    color: "#60a5fa",
    borderBottom: "1px solid #1e1e2e",
    letterSpacing: 1,
  },
  body: {
    flex: 1,
    overflow: "auto",
    padding: 12,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  actionCard: (success: boolean) => ({
    padding: "8px 12px",
    backgroundColor: success ? "#0f1f0f" : "#1f0f0f",
    border: `1px solid ${success ? "#1a3a1a" : "#3a1a1a"}`,
    borderRadius: 4,
  }),
  actionType: {
    fontSize: 12,
    fontWeight: 600,
    color: "#60a5fa",
    marginBottom: 4,
  },
  actionDetail: {
    fontSize: 11,
    color: "#9ca3af",
    lineHeight: 1.5,
  },
  statusBadge: (success: boolean) => ({
    display: "inline-block",
    fontSize: 10,
    fontWeight: 600,
    padding: "1px 6px",
    borderRadius: 3,
    backgroundColor: success ? "#166534" : "#991b1b",
    color: success ? "#86efac" : "#fca5a5",
    marginLeft: 8,
  }),
  empty: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#4b5563",
    fontSize: 12,
  },
  screenshotGrid: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
    marginTop: 8,
  },
  screenshotTag: {
    fontSize: 10,
    padding: "4px 8px",
    backgroundColor: "#1e1e2e",
    borderRadius: 3,
    color: "#fbbf24",
    border: "1px solid #2e2e3e",
  },
};

export default function BrowserFeed({ screenshots, events }: Props) {
  // Extract action events
  const actionEvents = events.filter(
    (e) => e.type === "action_started" || e.type === "action_completed"
  );

  // Pair start/complete events
  const actionPairs: { started: NarrationEvent; completed?: NarrationEvent }[] = [];
  for (const event of actionEvents) {
    if (event.type === "action_started") {
      actionPairs.push({ started: event });
    } else if (event.type === "action_completed" && actionPairs.length > 0) {
      const last = actionPairs[actionPairs.length - 1];
      if (!last.completed) {
        last.completed = event;
      }
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        BROWSER ACTIVITY
        {screenshots.length > 0 && (
          <span style={{ color: "#fbbf24", marginLeft: 8, fontWeight: 400 }}>
            {screenshots.length} screenshot(s)
          </span>
        )}
      </div>
      <div style={styles.body}>
        {actionPairs.length === 0 && (
          <div style={styles.empty}>
            Browser activity will appear here when actions are executed.
          </div>
        )}
        {actionPairs.map((pair, i) => {
          const success = pair.completed?.message.includes("uccess") ?? false;
          const duration = pair.completed?.data?.duration_ms as number | undefined;
          const actionType = pair.started.data?.action_type as string || "action";

          return (
            <div key={i} style={styles.actionCard(success)}>
              <div style={styles.actionType}>
                {actionType.replace(/_/g, " ").toUpperCase()}
                {pair.completed && (
                  <span style={styles.statusBadge(success)}>
                    {success ? "OK" : "FAIL"}
                  </span>
                )}
                {duration != null && (
                  <span style={{ color: "#6b7280", fontSize: 10, marginLeft: 8, fontWeight: 400 }}>
                    {Math.round(duration)}ms
                  </span>
                )}
              </div>
              <div style={styles.actionDetail}>{pair.started.message}</div>
              {pair.completed && (
                <div style={styles.actionDetail}>{pair.completed.message}</div>
              )}
            </div>
          );
        })}

        {screenshots.length > 0 && (
          <div style={styles.screenshotGrid}>
            {screenshots.map((s, i) => (
              <span key={i} style={styles.screenshotTag}>
                {s.split("/").pop()}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
