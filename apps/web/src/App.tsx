import { useState, useEffect, useCallback } from "react";
import TaskInput from "./components/TaskInput";
import NarrationStream from "./components/NarrationStream";
import BrowserFeed from "./components/BrowserFeed";
import EvidencePanel from "./components/EvidencePanel";
import ReportViewer from "./components/ReportViewer";
import LifetimePanel from "./components/LifetimePanel";
import {
  getIdentity,
  startRun,
  subscribeToRunStream,
  getRunReport,
  type QATaskInput,
  type NarrationEvent,
  type NoemaIdentity,
  type QAReport,
} from "./api/noemaClient";

// =============================================================================
// Styles
// =============================================================================

const styles = {
  root: {
    height: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    backgroundColor: "#0a0a0f",
    color: "#d4d4d8",
    fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace",
    fontSize: "13px",
  },
  header: {
    padding: "12px 20px",
    borderBottom: "1px solid #1e1e2e",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "linear-gradient(180deg, #0f0f18, #0a0a0f)",
  },
  title: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#a78bfa",
    letterSpacing: "2px",
  },
  subtitle: {
    fontSize: "11px",
    color: "#6b7280",
    marginTop: "2px",
  },
  statusDot: (connected: boolean) => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: connected ? "#22c55e" : "#ef4444",
    display: "inline-block",
    marginRight: 6,
  }),
  main: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "auto 1fr 1fr",
    gap: "1px",
    backgroundColor: "#1e1e2e",
    overflow: "hidden",
  },
  taskRow: {
    gridColumn: "1 / -1",
    backgroundColor: "#0a0a0f",
  },
  panelNarration: {
    backgroundColor: "#0a0a0f",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
  },
  panelRight: {
    backgroundColor: "#0a0a0f",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
  },
  panelBottomLeft: {
    backgroundColor: "#0a0a0f",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
  },
  panelBottomRight: {
    backgroundColor: "#0a0a0f",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
  },
};

// =============================================================================
// App
// =============================================================================

export default function App() {
  const [identity, setIdentity] = useState<NoemaIdentity | null>(null);
  const [connected, setConnected] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<NarrationEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<QAReport | null>(null);
  const [screenshots, setScreenshots] = useState<string[]>([]);

  // Fetch identity on mount
  useEffect(() => {
    getIdentity()
      .then((id) => {
        setIdentity(id);
        setConnected(true);
      })
      .catch(() => setConnected(false));
  }, []);

  // Refresh identity periodically when running
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      getIdentity()
        .then(setIdentity)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [running]);

  // Subscribe to SSE when run starts
  useEffect(() => {
    if (!runId) return;

    const unsub = subscribeToRunStream(
      runId,
      (event) => {
        setEvents((prev) => [...prev, event]);

        // Extract screenshots from events
        if (event.data?.screenshots) {
          setScreenshots((prev) => [
            ...prev,
            ...(event.data!.screenshots as string[]),
          ]);
        }

        // Detect run completion
        if (event.type === "run_completed") {
          setRunning(false);
          // Fetch full report
          getRunReport(runId)
            .then(setReport)
            .catch(() => {});
          // Refresh identity
          getIdentity()
            .then(setIdentity)
            .catch(() => {});
        }

        if (event.type === "error" && !running) {
          setRunning(false);
        }
      },
      () => {
        // SSE error - try to reconnect or mark as disconnected
      }
    );

    return unsub;
  }, [runId]);

  const handleStartRun = useCallback(async (task: QATaskInput) => {
    setEvents([]);
    setReport(null);
    setScreenshots([]);
    setRunning(true);

    try {
      const result = await startRun(task);
      setRunId(result.run_id);
    } catch (error) {
      setRunning(false);
      setEvents([
        {
          event_id: "error",
          seq: 0,
          type: "error",
          message: `Failed to start run: ${(error as Error).message}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, []);

  return (
    <div style={styles.root}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <div style={styles.title}>NOEMA</div>
          <div style={styles.subtitle}>
            persistent digital cognitive system
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 11, color: "#6b7280" }}>
            <span style={styles.statusDot(connected)} />
            {connected ? "connected" : "disconnected"}
          </span>
          {identity && (
            <span style={{ fontSize: 11, color: "#8b5cf6" }}>
              age: {identity.age} | runs: {identity.total_runs} | experiences: {identity.total_experiences}
            </span>
          )}
        </div>
      </header>

      {/* Main Grid */}
      <div style={styles.main}>
        {/* Task Input - Full Width */}
        <div style={styles.taskRow}>
          <TaskInput onSubmit={handleStartRun} disabled={running} />
        </div>

        {/* Left: Narration Stream */}
        <div style={styles.panelNarration}>
          <NarrationStream events={events} running={running} />
        </div>

        {/* Right Top: Browser Feed + Evidence */}
        <div style={styles.panelRight}>
          <BrowserFeed screenshots={screenshots} events={events} />
        </div>

        {/* Left Bottom: Report / Evidence */}
        <div style={styles.panelBottomLeft}>
          {report ? (
            <ReportViewer report={report} />
          ) : (
            <EvidencePanel events={events} />
          )}
        </div>

        {/* Right Bottom: Lifetime Panel */}
        <div style={styles.panelBottomRight}>
          <LifetimePanel identity={identity} events={events} />
        </div>
      </div>
    </div>
  );
}
