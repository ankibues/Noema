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
    gap: 4,
  },
  testCaseLabel: {
    padding: "6px 10px",
    fontSize: 10,
    fontWeight: 600,
    color: "#818cf8",
    borderLeft: "2px solid #818cf8",
    marginTop: 8,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  actionRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "4px 10px 4px 16px",
  },
  actionIcon: (success: boolean) => ({
    fontSize: 10,
    fontWeight: 700,
    color: success ? "#34d399" : "#f87171",
    minWidth: 14,
    marginTop: 2,
  }),
  actionText: {
    fontSize: 12,
    color: "#d4d4d8",
    lineHeight: 1.5,
    flex: 1,
    wordBreak: "break-word" as const,
  },
  actionDuration: {
    fontSize: 10,
    color: "#4b5563",
    whiteSpace: "nowrap" as const,
    marginTop: 2,
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

/** Friendly labels for action types */
function formatActionType(type: string): string {
  switch (type) {
    case "navigate_to_url": return "Navigate";
    case "click_element": return "Click";
    case "fill_input": return "Fill";
    case "submit_form": return "Submit";
    case "check_element_visible": return "Check visible";
    case "capture_screenshot": return "Screenshot";
    case "wait_for_network_idle": return "Wait";
    case "no_op": return "Pause";
    default: return type.replace(/_/g, " ");
  }
}

/** Extract a short description from the action_started message */
function actionSummary(event: NarrationEvent): string {
  // The message from narration_formatter is already a nice first-person sentence.
  // Strip the "I'm " prefix to make it more compact for the browser feed.
  let msg = event.message || "";
  if (msg.startsWith("I'm ")) {
    msg = msg.substring(4);
    // Capitalize first letter
    msg = msg.charAt(0).toUpperCase() + msg.slice(1);
  }
  return msg;
}

export default function BrowserFeed({ events, hideHeader }: Props) {
  // Build timeline: only browser actions, grouped by test case
  type TimelineItem =
    | { kind: "test_case"; title: string }
    | { kind: "action"; message: string; success: boolean; durationMs?: number; actionType: string };

  const timeline: TimelineItem[] = [];
  let pendingAction: NarrationEvent | null = null;

  const relevantEvents = events.filter(
    (e) =>
      e.type === "action_started" ||
      e.type === "action_completed" ||
      e.type === "plan_step_started"
  );

  for (const event of relevantEvents) {
    if (event.type === "plan_step_started") {
      // Subtle grouping header — just the test case name, no result
      const title = (event.data?.title as string) || `Test ${event.data?.step_id}`;
      timeline.push({ kind: "test_case", title });
    } else if (event.type === "action_started") {
      // Flush any pending action that never got a completion event
      if (pendingAction) {
        timeline.push({
          kind: "action",
          message: actionSummary(pendingAction),
          success: true,
          actionType: (pendingAction.data?.action_type as string) || "action",
        });
      }
      pendingAction = event;
    } else if (event.type === "action_completed") {
      const success = event.message?.includes("uccess") ?? false;
      const duration = event.data?.duration_ms as number | undefined;
      const actionType = pendingAction
        ? (pendingAction.data?.action_type as string) || "action"
        : "action";
      const msg = pendingAction ? actionSummary(pendingAction) : (event.message || "Action");

      timeline.push({
        kind: "action",
        message: msg,
        success,
        durationMs: duration,
        actionType,
      });
      pendingAction = null;
    }
  }
  // Flush last pending action
  if (pendingAction) {
    timeline.push({
      kind: "action",
      message: actionSummary(pendingAction),
      success: true,
      actionType: (pendingAction.data?.action_type as string) || "action",
    });
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
          if (item.kind === "test_case") {
            return (
              <div key={i} style={styles.testCaseLabel}>
                🧪 {item.title}
              </div>
            );
          }
          // Browser action row — compact, one line
          return (
            <div key={i} style={styles.actionRow}>
              <span style={styles.actionIcon(item.success)}>
                {item.success ? "●" : "✗"}
              </span>
              <span style={styles.actionText}>
                <strong style={{ color: "#60a5fa", fontSize: 11 }}>
                  {formatActionType(item.actionType)}
                </strong>{" "}
                {item.message}
              </span>
              {item.durationMs != null && (
                <span style={styles.actionDuration}>
                  {Math.round(item.durationMs)}ms
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
