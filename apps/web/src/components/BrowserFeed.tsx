import type { NarrationEvent } from "../api/noemaClient";

interface Props {
  screenshots: string[];
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
    gap: 6,
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
  planStepDivider: {
    padding: "4px 10px",
    fontSize: 10,
    fontWeight: 600,
    color: "#818cf8",
    borderLeft: "2px solid #818cf8",
    marginTop: 4,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  empty: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#4b5563",
    fontSize: 12,
  },
};

export default function BrowserFeed({ events, hideHeader }: Props) {
  // Extract action events AND plan step events for context
  const relevantEvents = events.filter(
    (e) =>
      e.type === "action_started" ||
      e.type === "action_completed" ||
      e.type === "plan_step_started" ||
      e.type === "plan_step_completed"
  );

  // Build a timeline of actions grouped by plan step
  type TimelineItem =
    | { kind: "step_start"; title: string; stepId: number }
    | { kind: "action"; started: NarrationEvent; completed?: NarrationEvent }
    | { kind: "step_end"; stepId: number; result: string };

  const timeline: TimelineItem[] = [];
  let pendingAction: NarrationEvent | null = null;

  for (const event of relevantEvents) {
    if (event.type === "plan_step_started") {
      timeline.push({
        kind: "step_start",
        title: (event.data?.title as string) || `Step ${event.data?.step_id}`,
        stepId: event.data?.step_id as number,
      });
    } else if (event.type === "plan_step_completed") {
      timeline.push({
        kind: "step_end",
        stepId: event.data?.step_id as number,
        result: (event.data?.result as string) || "done",
      });
    } else if (event.type === "action_started") {
      if (pendingAction) {
        timeline.push({ kind: "action", started: pendingAction });
      }
      pendingAction = event;
    } else if (event.type === "action_completed") {
      if (pendingAction) {
        timeline.push({ kind: "action", started: pendingAction, completed: event });
        pendingAction = null;
      }
    }
  }
  if (pendingAction) {
    timeline.push({ kind: "action", started: pendingAction });
  }

  return (
    <div style={styles.container}>
      {!hideHeader && (
        <div style={styles.header}>BROWSER ACTIVITY</div>
      )}
      <div style={styles.body}>
        {timeline.length === 0 && (
          <div style={styles.empty}>
            Browser activity will appear here when actions are executed.
          </div>
        )}
        {timeline.map((item, i) => {
          if (item.kind === "step_start") {
            return (
              <div key={i} style={styles.planStepDivider}>
                ▸ Step {item.stepId}: {item.title}
              </div>
            );
          }
          if (item.kind === "step_end") {
            return (
              <div key={i} style={{
                ...styles.planStepDivider,
                color: item.result === "pass" ? "#22c55e" : item.result === "fail" ? "#ef4444" : "#6b7280",
                borderLeftColor: item.result === "pass" ? "#22c55e" : item.result === "fail" ? "#ef4444" : "#6b7280",
                fontSize: 9,
              }}>
                {item.result === "pass" ? "✓" : item.result === "fail" ? "✗" : "—"} Step {item.stepId} {item.result}
              </div>
            );
          }
          // action
          const success = item.completed?.message.includes("uccess") ?? false;
          const duration = item.completed?.data?.duration_ms as number | undefined;
          const actionType = (item.started.data?.action_type as string) || "action";

          return (
            <div key={i} style={styles.actionCard(success)}>
              <div style={styles.actionType}>
                {actionType.replace(/_/g, " ").toUpperCase()}
                {item.completed && (
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
              <div style={styles.actionDetail}>{item.started.message}</div>
              {item.completed && (
                <div style={styles.actionDetail}>{item.completed.message}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
