import { useState, useEffect, useCallback, type CSSProperties, type ReactNode } from "react";
import TaskInput from "./components/TaskInput";
import NarrationStream from "./components/NarrationStream";
import BrowserFeed from "./components/BrowserFeed";
import EvidencePanel from "./components/EvidencePanel";
import ReportViewer from "./components/ReportViewer";
import LifetimePanel from "./components/LifetimePanel";
import {
  getIdentity,
  startRun,
  stopRunApi,
  subscribeToRunStream,
  getRunReport,
  optimizeRun,
  type QATaskInput,
  type NarrationEvent,
  type NoemaIdentity,
  type QAReport,
} from "./api/noemaClient";

// =============================================================================
// Panel IDs for maximize feature
// =============================================================================

type PanelId = "narration" | "browser" | "evidence" | "report" | "lifetime" | null;

// =============================================================================
// Expand/Collapse button shown in each panel header
// =============================================================================

function PanelExpandBtn({ panelId, maximized, onToggle }: {
  panelId: PanelId;
  maximized: PanelId;
  onToggle: (id: PanelId) => void;
}) {
  const isExpanded = maximized === panelId;
  return (
    <button
      onClick={() => onToggle(isExpanded ? null : panelId)}
      title={isExpanded ? "Minimize (Esc)" : "Maximize panel"}
      style={{
        background: "none",
        border: "1px solid #2e2e3e",
        borderRadius: 3,
        color: "#6b7280",
        cursor: "pointer",
        fontSize: 11,
        padding: "2px 6px",
        marginLeft: "auto",
        fontFamily: "inherit",
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        gap: 3,
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "#d4d4d8"; e.currentTarget.style.borderColor = "#4b5563"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "#6b7280"; e.currentTarget.style.borderColor = "#2e2e3e"; }}
    >
      {isExpanded ? "⊟ minimize" : "⊞ expand"}
    </button>
  );
}

/** Wraps a panel and injects the expand button into a header-level container */
function PanelWrapper({ panelId, maximized, onToggle, label, labelColor, children }: {
  panelId: PanelId;
  maximized: PanelId;
  onToggle: (id: PanelId) => void;
  label: string;
  labelColor: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
      <div style={{
        padding: "8px 12px",
        fontSize: 11,
        fontWeight: 600,
        color: labelColor,
        borderBottom: "1px solid #1e1e2e",
        letterSpacing: 1,
        display: "flex",
        alignItems: "center",
      }}>
        {label}
        <PanelExpandBtn panelId={panelId} maximized={maximized} onToggle={onToggle} />
      </div>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// Timer Formatter
// =============================================================================

function formatElapsedMs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  if (totalSecs < 60) return `${totalSecs}s`;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

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
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  logo: {
    height: "32px",
    width: "32px",
    objectFit: "contain" as const,
  },
  title: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#a78bfa",
    letterSpacing: "3px",
  },
  statusDot: (connected: boolean) => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: connected ? "#22c55e" : "#ef4444",
    display: "inline-block",
    marginRight: 6,
  }),
  taskRow: {
    gridColumn: "1 / -1",
    backgroundColor: "#0a0a0f",
  },
  panelCell: {
    backgroundColor: "#0a0a0f",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
  } as CSSProperties,
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
  const [maximized, setMaximized] = useState<PanelId>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeDone, setOptimizeDone] = useState(false);
  const [suggestedNextGoal, setSuggestedNextGoal] = useState<string | null>(null);

  // Escape key to minimize
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaximized(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Live elapsed timer — ticks every second while running
  useEffect(() => {
    if (!running || !runStartedAt) {
      return;
    }
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - runStartedAt);
    }, 1000);
    return () => clearInterval(interval);
  }, [running, runStartedAt]);

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
          setRunStartedAt(null);
          // Capture suggested next goal
          if (event.data?.suggested_next_goal) {
            setSuggestedNextGoal(event.data.suggested_next_goal as string);
          }
          // Fetch full report
          getRunReport(runId)
            .then((r) => {
              setReport(r);
              // Auto-switch to report panel after a brief delay
              setTimeout(() => setMaximized("report"), 500);
            })
            .catch(() => {});
          // Refresh identity
          getIdentity()
            .then(setIdentity)
            .catch(() => {});
        }

        // Detect background optimization completion (matches both "complete" and "finished")
        if (event.message?.includes("Deep Learning complete") || event.message?.includes("Deep Learning finished")) {
          setOptimizing(false);
          setOptimizeDone(true);
          // Refresh identity to show new experience count
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

  const handleStopRun = useCallback(async () => {
    if (!runId) return;
    try {
      await stopRunApi(runId);
      setRunning(false);
    } catch (error) {
      console.error("Failed to stop run:", error);
      setRunning(false);
    }
  }, [runId]);

  const handleStartRun = useCallback(async (task: QATaskInput) => {
    setEvents([]);
    setReport(null);
    setScreenshots([]);
    setRunning(true);
    setElapsedMs(0);
    setRunStartedAt(Date.now());
    setMaximized(null);
    setOptimizing(false);
    setOptimizeDone(false);
    setSuggestedNextGoal(null);

    try {
      const result = await startRun(task);
      setRunId(result.run_id);
    } catch (error) {
      setRunning(false);
      setRunStartedAt(null);
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

  const handleViewReport = useCallback(() => {
    setMaximized("report");
  }, []);

  const [prefillGoal, setPrefillGoal] = useState<string | null>(null);

  const handleSuggestedGoal = useCallback((goal: string) => {
    setPrefillGoal(goal);
    setMaximized(null); // Go back to normal grid
  }, []);

  const handleDeepLearn = useCallback(async () => {
    if (!runId || optimizing) return;
    setOptimizing(true);
    setOptimizeDone(false);
    try {
      await optimizeRun(runId);
      // Optimization runs in background — progress events come via SSE
    } catch (error) {
      console.error("Failed to start optimization:", error);
      setOptimizing(false);
    }
  }, [runId, optimizing]);

  // ─── Panel content builders ───────────────────────────────────────

  const narrationPanel = (
    <PanelWrapper panelId="narration" maximized={maximized} onToggle={setMaximized} label="NARRATION" labelColor="#8b5cf6">
      <NarrationStream
        events={events}
        running={running}
        hideHeader
        reportReady={!!report}
        onViewReport={handleViewReport}
        suggestedNextGoal={suggestedNextGoal}
        onSuggestedGoal={handleSuggestedGoal}
      />
    </PanelWrapper>
  );

  const browserPanel = (
    <PanelWrapper panelId="browser" maximized={maximized} onToggle={setMaximized} label="BROWSER ACTIVITY" labelColor="#60a5fa">
      <BrowserFeed screenshots={screenshots} events={events} hideHeader />
    </PanelWrapper>
  );

  // Bottom-left is always Evidence & Beliefs (shows evidence during run, still shows after)
  const evidencePanel = (
    <PanelWrapper panelId="evidence" maximized={maximized} onToggle={setMaximized} label="EVIDENCE & BELIEFS" labelColor="#fbbf24">
      <EvidencePanel events={events} hideHeader />
    </PanelWrapper>
  );

  const lifetimePanel = (
    <PanelWrapper panelId="lifetime" maximized={maximized} onToggle={setMaximized} label="LIFETIME" labelColor="#f472b6">
      <LifetimePanel identity={identity} events={events} hideHeader />
    </PanelWrapper>
  );

  const reportPanel = report ? (
    <PanelWrapper panelId="report" maximized={maximized} onToggle={setMaximized} label="QA REPORT" labelColor="#22c55e">
      <ReportViewer report={report} hideHeader />
    </PanelWrapper>
  ) : null;

  // ─── Grid style: normal 2x2 or single maximized panel ────────────

  const mainStyle: CSSProperties = maximized
    ? {
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1fr",
        gridTemplateRows: "auto 1fr",
        gap: "1px",
        backgroundColor: "#1e1e2e",
        overflow: "hidden",
      }
    : {
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "auto 1fr 1fr",
        gap: "1px",
        backgroundColor: "#1e1e2e",
        overflow: "hidden",
      };

  return (
    <div style={styles.root}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <img src="/noema-logo.png" alt="NOEMA" style={styles.logo} />
          <div style={styles.title}>NOEMA</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {running && (
            <span style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#fbbf24",
              fontVariantNumeric: "tabular-nums",
              minWidth: 60,
            }}>
              ⏱ {formatElapsedMs(elapsedMs)}
            </span>
          )}
          {/* Report button in header when report is ready */}
          {report && !running && (
            <button
              onClick={handleViewReport}
              style={{
                padding: "4px 12px",
                backgroundColor: "#166534",
                border: "1px solid #22c55e44",
                borderRadius: 4,
                color: "#22c55e",
                fontSize: 11,
                fontFamily: "inherit",
                cursor: "pointer",
                fontWeight: 600,
                letterSpacing: 0.5,
              }}
            >
              📋 View Report
            </button>
          )}
          {/* Deep Learn button — shown after run completes */}
          {report && !running && !optimizeDone && (
            <button
              onClick={handleDeepLearn}
              disabled={optimizing}
              title="Run GRPO-style experience optimization: opens new browser sessions, tries alternative approaches, and extracts reusable heuristics for future runs. Takes ~30-45 seconds."
              style={{
                padding: "4px 12px",
                backgroundColor: optimizing ? "#1e1b4b" : "#312e81",
                border: `1px solid ${optimizing ? "#4338ca44" : "#6366f144"}`,
                borderRadius: 4,
                color: optimizing ? "#818cf8" : "#a5b4fc",
                fontSize: 11,
                fontFamily: "inherit",
                cursor: optimizing ? "wait" : "pointer",
                fontWeight: 600,
                letterSpacing: 0.5,
                opacity: optimizing ? 0.8 : 1,
              }}
            >
              {optimizing ? "🔬 Learning..." : "🔬 Deep Learn"}
            </button>
          )}
          {optimizeDone && (
            <span style={{ fontSize: 10, color: "#22c55e" }}>✓ Deep learning done</span>
          )}
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
      <div style={mainStyle}>
        {/* Task Input - Full Width (always visible) */}
        <div style={styles.taskRow}>
          <TaskInput onSubmit={handleStartRun} onStop={handleStopRun} disabled={running} running={running} prefillGoal={prefillGoal} onPrefillConsumed={() => setPrefillGoal(null)} />
        </div>

        {/* When maximized, show only the selected panel */}
        {maximized === "narration" && (
          <div style={styles.panelCell}>{narrationPanel}</div>
        )}
        {maximized === "browser" && (
          <div style={styles.panelCell}>{browserPanel}</div>
        )}
        {maximized === "evidence" && (
          <div style={styles.panelCell}>{evidencePanel}</div>
        )}
        {maximized === "report" && reportPanel && (
          <div style={styles.panelCell}>{reportPanel}</div>
        )}
        {maximized === "report" && !reportPanel && (
          <div style={styles.panelCell}>{evidencePanel}</div>
        )}
        {maximized === "lifetime" && (
          <div style={styles.panelCell}>{lifetimePanel}</div>
        )}

        {/* Normal 2x2 grid when nothing is maximized */}
        {!maximized && (
          <>
            <div style={styles.panelCell}>{narrationPanel}</div>
            <div style={styles.panelCell}>{browserPanel}</div>
            <div style={styles.panelCell}>{report ? reportPanel : evidencePanel}</div>
            <div style={styles.panelCell}>{lifetimePanel}</div>
          </>
        )}
      </div>
    </div>
  );
}
