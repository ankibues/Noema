import { useState, useEffect, useCallback } from "react";
import type { QAReport, QATestStep, QAPlanStep } from "../api/noemaClient";

const API_BASE = "/api";

interface Props {
  report: QAReport;
  hideHeader?: boolean;
}

const resultColors = {
  pass: "#22c55e",
  fail: "#ef4444",
  partial: "#fbbf24",
};

const resultLabels = {
  pass: "PASSED",
  fail: "FAILED",
  partial: "PARTIAL",
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
    fontSize: 11,
    fontWeight: 600,
    color: "#22c55e",
    borderBottom: "1px solid #1e1e2e",
    letterSpacing: 1,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  body: {
    flex: 1,
    overflow: "auto",
    padding: 14,
  },
  // Test Run Info card
  runInfoCard: {
    backgroundColor: "#0d0d14",
    border: "1px solid #1e1e2e",
    borderRadius: 6,
    padding: 14,
    marginBottom: 16,
  },
  testTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#e4e4e7",
    marginBottom: 4,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  testDescription: {
    fontSize: 12,
    color: "#9ca3af",
    lineHeight: 1.5,
    marginBottom: 10,
  },
  runMeta: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 12,
    fontSize: 11,
    color: "#6b7280",
  },
  runMetaItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  // Result badge
  resultBadge: (result: string) => ({
    display: "inline-block",
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: 4,
    backgroundColor: result === "pass" ? "#166534" : result === "fail" ? "#991b1b" : "#854d0e",
    color: resultColors[result as keyof typeof resultColors] || "#fff",
    letterSpacing: 1,
  }),
  // Summary bar
  summaryBar: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
  },
  summaryItem: (color: string) => ({
    flex: 1,
    padding: "10px 12px",
    backgroundColor: "#0d0d14",
    border: `1px solid ${color}22`,
    borderRadius: 6,
    textAlign: "center" as const,
  }),
  summaryValue: (color: string) => ({
    fontSize: 20,
    fontWeight: 700,
    color,
  }),
  summaryLabel: {
    fontSize: 10,
    color: "#6b7280",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  // Section
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: "#8b5cf6",
    marginBottom: 8,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  // Test steps table
  stepsTable: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 12,
  },
  stepRow: (passed: boolean) => ({
    borderBottom: "1px solid #111118",
    backgroundColor: passed ? "transparent" : "#1a0a0a",
  }),
  stepCell: {
    padding: "8px 10px",
    verticalAlign: "top" as const,
  },
  stepNumber: {
    fontSize: 10,
    fontWeight: 600,
    color: "#6b7280",
    width: 30,
  },
  stepBadge: (passed: boolean) => ({
    display: "inline-block",
    fontSize: 9,
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: 3,
    backgroundColor: passed ? "#166534" : "#991b1b",
    color: passed ? "#86efac" : "#fca5a5",
    letterSpacing: 0.5,
    minWidth: 32,
    textAlign: "center" as const,
  }),
  stepAction: {
    fontSize: 10,
    fontWeight: 500,
    color: "#8b5cf6",
    fontFamily: "'JetBrains Mono', monospace",
  },
  stepDesc: {
    fontSize: 12,
    color: "#d4d4d8",
    lineHeight: 1.5,
  },
  stepError: {
    fontSize: 11,
    color: "#f87171",
    marginTop: 2,
    fontStyle: "italic",
  },
  stepDuration: {
    fontSize: 10,
    color: "#6b7280",
    textAlign: "right" as const,
    whiteSpace: "nowrap" as const,
  },
  // Stats row
  stat: {
    display: "flex",
    justifyContent: "space-between",
    padding: "4px 0",
    fontSize: 12,
    color: "#9ca3af",
    borderBottom: "1px solid #111118",
  },
  statValue: {
    color: "#d4d4d8",
    fontWeight: 600,
  },
  // Improvement
  improvementBadge: (improved: boolean) => ({
    display: "inline-block",
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 3,
    backgroundColor: improved ? "#166534" : "#1e1e2e",
    color: improved ? "#86efac" : "#6b7280",
    marginLeft: 6,
  }),
  // Buttons
  downloadBtn: {
    padding: "5px 12px",
    backgroundColor: "#1e1e2e",
    border: "1px solid #2e2e3e",
    borderRadius: 4,
    color: "#8b5cf6",
    fontSize: 10,
    fontFamily: "inherit",
    cursor: "pointer",
    fontWeight: 600,
    letterSpacing: 0.5,
  },
  tabBtn: (active: boolean) => ({
    padding: "4px 10px",
    backgroundColor: active ? "#1e1e2e" : "transparent",
    border: active ? "1px solid #2e2e3e" : "1px solid transparent",
    borderRadius: 3,
    color: active ? "#d4d4d8" : "#6b7280",
    fontSize: 10,
    fontFamily: "inherit",
    cursor: "pointer",
    fontWeight: 500,
  }),
  listItem: {
    fontSize: 12,
    color: "#9ca3af",
    lineHeight: 1.6,
    paddingLeft: 12,
    position: "relative" as const,
    marginBottom: 4,
    wordBreak: "break-word" as const,
    overflowWrap: "break-word" as const,
    whiteSpace: "pre-wrap" as const,
  },
};

type Tab = "plan" | "steps" | "reflection" | "details" | "recording";

export default function ReportViewer({ report, hideHeader }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("plan");
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // Collect all screenshot URLs for navigation
  const allScreenshots: string[] = [];
  if (report.plan?.steps) {
    for (const step of report.plan.steps) {
      if (step.screenshot_urls) {
        for (const url of step.screenshot_urls) {
          allScreenshots.push(`${API_BASE}${url}`);
        }
      }
    }
  }

  const openLightbox = useCallback((src: string) => {
    const idx = allScreenshots.indexOf(src);
    setLightboxIdx(idx >= 0 ? idx : 0);
  }, [allScreenshots.length]);

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `noema-report-${report.run_id.substring(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      {!hideHeader && (
        <div style={styles.header}>
          <span>QA REPORT</span>
          <button style={styles.downloadBtn} onClick={handleDownload}>
            ↓ JSON
          </button>
        </div>
      )}
      {hideHeader && (
        <div style={{ padding: "4px 14px 0", textAlign: "right" as const }}>
          <button style={styles.downloadBtn} onClick={handleDownload}>
            ↓ JSON
          </button>
        </div>
      )}

      <div style={styles.body}>
        {/* Test Run Info Card */}
        <div style={styles.runInfoCard}>
          <div style={styles.testTitle}>
            <span style={styles.resultBadge(report.result)}>
              {resultLabels[report.result]}
            </span>
            <span>{report.test_title || report.task.substring(0, 80)}</span>
          </div>
          <div style={styles.testDescription}>
            {report.test_description || report.task}
          </div>
          <div style={styles.runMeta}>
            {report.target_url && (
              <div style={styles.runMetaItem}>
                <span style={{ color: "#8b5cf6" }}>🔗</span> {report.target_url}
              </div>
            )}
            <div style={styles.runMetaItem}>
              <span style={{ color: "#8b5cf6" }}>⏱</span> {(report.duration_ms / 1000).toFixed(1)}s
            </div>
            <div style={styles.runMetaItem}>
              <span style={{ color: "#8b5cf6" }}>🆔</span> {report.run_id.substring(0, 8)}
            </div>
            <div style={styles.runMetaItem}>
              <span style={{ color: "#6b7280" }}>{new Date(report.timestamp).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Summary Bar */}
        <div style={styles.summaryBar}>
          <div style={styles.summaryItem("#22c55e")}>
            <div style={styles.summaryValue("#22c55e")}>{report.passed_steps}</div>
            <div style={styles.summaryLabel}>PASSED</div>
          </div>
          <div style={styles.summaryItem("#ef4444")}>
            <div style={styles.summaryValue("#ef4444")}>{report.failed_steps}</div>
            <div style={styles.summaryLabel}>FAILED</div>
          </div>
          <div style={styles.summaryItem("#8b5cf6")}>
            <div style={styles.summaryValue("#8b5cf6")}>{report.actions_taken}</div>
            <div style={styles.summaryLabel}>STEPS</div>
          </div>
          <div style={styles.summaryItem("#fbbf24")}>
            <div style={styles.summaryValue("#fbbf24")}>{report.experiences_learned}</div>
            <div style={styles.summaryLabel}>LEARNED</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
          <button style={styles.tabBtn(activeTab === "plan")} onClick={() => setActiveTab("plan")}>
            Test Plan
          </button>
          <button style={styles.tabBtn(activeTab === "steps")} onClick={() => setActiveTab("steps")}>
            Actions
          </button>
          {report.video_url && (
            <button style={styles.tabBtn(activeTab === "recording")} onClick={() => setActiveTab("recording")}>
              ▶ Recording
            </button>
          )}
          <button style={styles.tabBtn(activeTab === "reflection")} onClick={() => setActiveTab("reflection")}>
            Reflection
          </button>
          <button style={styles.tabBtn(activeTab === "details")} onClick={() => setActiveTab("details")}>
            Details
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "plan" && <PlanTab plan={report.plan} onScreenshotClick={openLightbox} />}
        {activeTab === "steps" && <TestStepsTab steps={report.test_steps} />}
        {activeTab === "recording" && report.video_url && <RecordingTab videoUrl={report.video_url} />}
        {activeTab === "reflection" && <ReflectionTab report={report} />}
        {activeTab === "details" && <DetailsTab report={report} />}

        {/* Screenshot Lightbox Modal with arrow key navigation */}
        {lightboxIdx !== null && allScreenshots.length > 0 && (
          <ScreenshotLightbox
            src={allScreenshots[lightboxIdx]}
            onClose={() => setLightboxIdx(null)}
            onPrev={lightboxIdx > 0 ? () => setLightboxIdx(lightboxIdx - 1) : undefined}
            onNext={lightboxIdx < allScreenshots.length - 1 ? () => setLightboxIdx(lightboxIdx + 1) : undefined}
            current={lightboxIdx + 1}
            total={allScreenshots.length}
          />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Plan Tab
// =============================================================================

const priorityColors = {
  critical: "#ef4444",
  important: "#fbbf24",
  nice_to_have: "#6b7280",
};

const planResultLabels = {
  pass: "PASS",
  fail: "FAIL",
  skipped: "SKIP",
};

function PlanTab({ plan, onScreenshotClick }: { plan: QAReport["plan"]; onScreenshotClick: (src: string) => void }) {
  if (!plan || plan.total_steps === 0) {
    return (
      <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center", padding: 20 }}>
        No test plan was generated for this run.
      </div>
    );
  }

  return (
    <div style={styles.section}>
      {/* Plan Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#d4d4d8", marginBottom: 4 }}>
          {plan.plan_title}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5, marginBottom: 8 }}>
          {plan.plan_rationale}
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#6b7280" }}>
          <span>Generated by: <span style={{ color: "#8b5cf6" }}>{plan.generated_by === "gemini" ? "Gemini 3" : "Built-in Planner"}</span></span>
          <span style={{ color: "#22c55e" }}>{plan.passed} passed</span>
          <span style={{ color: "#ef4444" }}>{plan.failed} failed</span>
          {plan.skipped > 0 && <span style={{ color: "#6b7280" }}>{plan.skipped} skipped</span>}
        </div>
      </div>

      {/* Plan Steps */}
      <table style={styles.stepsTable}>
        <tbody>
          {plan.steps.map((step: QAPlanStep) => (
            <tr key={step.step_id} style={styles.stepRow(step.result === "pass")}>
              <td style={{ ...styles.stepCell, ...styles.stepNumber }}>
                #{step.step_id}
              </td>
              <td style={{ ...styles.stepCell, width: 50 }}>
                <span style={styles.stepBadge(step.result === "pass")}>
                  {planResultLabels[step.result] || "—"}
                </span>
              </td>
              <td style={styles.stepCell}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    padding: "1px 5px",
                    borderRadius: 3,
                    backgroundColor: `${priorityColors[step.priority]}22`,
                    color: priorityColors[step.priority],
                    letterSpacing: 0.5,
                  }}>
                    {step.priority.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#d4d4d8" }}>
                    {step.title}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5, marginBottom: 4 }}>
                  {step.description}
                </div>

                {/* Detailed test steps */}
                {step.test_steps && step.test_steps.length > 0 && (
                  <div style={{ marginTop: 6, marginBottom: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#8b5cf6", marginBottom: 3 }}>Test Steps:</div>
                    {step.test_steps.map((ts: string, idx: number) => (
                      <div key={idx} style={{ fontSize: 10, color: "#a1a1aa", lineHeight: 1.6, paddingLeft: 10 }}>
                        {idx + 1}. {ts}
                      </div>
                    ))}
                  </div>
                )}

                {/* Expected results */}
                {step.expected_results && step.expected_results.length > 0 && (
                  <div style={{ marginTop: 4, marginBottom: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#22c55e", marginBottom: 3 }}>Expected Results:</div>
                    {step.expected_results.map((er: string, idx: number) => (
                      <div key={idx} style={{ fontSize: 10, color: "#86efac", lineHeight: 1.6, paddingLeft: 10 }}>
                        ✓ {er}
                      </div>
                    ))}
                  </div>
                )}

                {/* Fallback: show expected_outcome if no detailed expected_results */}
                {(!step.expected_results || step.expected_results.length === 0) && (
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
                    Expected: {step.expected_outcome}
                  </div>
                )}

                {step.actual_outcome && (
                  <div style={{
                    fontSize: 10,
                    color: step.result === "pass" ? "#22c55e" : step.result === "fail" ? "#f87171" : "#6b7280",
                    marginTop: 4,
                    fontWeight: 500,
                  }}>
                    Result: {step.actual_outcome}
                  </div>
                )}

                {/* Screenshot thumbnails for this step */}
                {step.screenshot_urls && step.screenshot_urls.length > 0 && (
                  <div style={{
                    display: "flex",
                    gap: 6,
                    marginTop: 8,
                    flexWrap: "wrap",
                  }}>
                    <div style={{ fontSize: 9, color: "#6b7280", width: "100%", marginBottom: 2 }}>
                      📷 {step.screenshot_urls.length} screenshot{step.screenshot_urls.length > 1 ? "s" : ""}
                    </div>
                    {step.screenshot_urls.map((url, idx) => (
                      <img
                        key={idx}
                        src={`${API_BASE}${url}`}
                        alt={`Step ${step.step_id} screenshot ${idx + 1}`}
                        style={{
                          width: 100,
                          height: 60,
                          objectFit: "cover",
                          borderRadius: 4,
                          border: "1px solid #2e2e3e",
                          cursor: "pointer",
                          transition: "border-color 0.15s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#8b5cf6"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2e2e3e"; }}
                        onClick={() => onScreenshotClick(`${API_BASE}${url}`)}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ))}
                  </div>
                )}
              </td>
              <td style={{ ...styles.stepCell, ...styles.stepDuration }}>
                {step.actions_taken > 0 ? `${step.actions_taken} action${step.actions_taken > 1 ? "s" : ""}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Test Steps Tab
// =============================================================================

function TestStepsTab({ steps }: { steps: QATestStep[] }) {
  if (!steps || steps.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center", padding: 20 }}>
        No test steps recorded.
      </div>
    );
  }

  return (
    <div style={styles.section}>
      <table style={styles.stepsTable}>
        <tbody>
          {steps.map((step) => (
            <tr key={step.step} style={styles.stepRow(step.result === "pass")}>
              <td style={{ ...styles.stepCell, ...styles.stepNumber }}>
                #{step.step}
              </td>
              <td style={{ ...styles.stepCell, width: 50 }}>
                <span style={styles.stepBadge(step.result === "pass")}>
                  {step.result === "pass" ? "PASS" : "FAIL"}
                </span>
              </td>
              <td style={styles.stepCell}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#d4d4d8", marginBottom: 2 }}>
                  {step.action_type}
                </div>
                <div style={{
                  ...styles.stepDesc,
                  wordBreak: "break-word" as const,
                  overflowWrap: "break-word" as const,
                  whiteSpace: "pre-wrap" as const,
                }}>
                  {step.description}
                </div>
                {step.error && (
                  <div style={{
                    ...styles.stepError,
                    wordBreak: "break-word" as const,
                    overflowWrap: "break-word" as const,
                  }}>
                    ⚠ {step.error}
                  </div>
                )}
              </td>
              <td style={{ ...styles.stepCell, ...styles.stepDuration }}>
                {step.duration_ms > 0 ? `${step.duration_ms}ms` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Reflection Tab
// =============================================================================

function ReflectionTab({ report }: { report: QAReport }) {
  return (
    <>
      {/* Improvement */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          Improvement
          <span style={styles.improvementBadge(report.improvement.has_improved)}>
            {report.improvement.has_improved ? "✓ IMPROVED" : "BASELINE"}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}>
          {report.improvement.conclusion}
        </div>
      </div>

      {/* What NOEMA Learned */}
      {report.reflection.what_learned.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>What NOEMA Learned</div>
          {report.reflection.what_learned.map((item, i) => (
            <div key={i} style={styles.listItem}>• {item}</div>
          ))}
        </div>
      )}

      {/* What Worked Better */}
      {report.reflection.what_worked_better.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>What Worked Better</div>
          {report.reflection.what_worked_better.map((item, i) => (
            <div key={i} style={styles.listItem}>• {item}</div>
          ))}
        </div>
      )}

      {/* What Was Tried */}
      {report.reflection.what_tried.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Actions Tried</div>
          {report.reflection.what_tried.map((item, i) => (
            <div key={i} style={styles.listItem}>• {item}</div>
          ))}
        </div>
      )}

      {/* Open Questions */}
      {report.reflection.open_questions.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Open Questions</div>
          {report.reflection.open_questions.map((item, i) => (
            <div key={i} style={styles.listItem}>? {item}</div>
          ))}
        </div>
      )}

      {/* Next Best Action */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Recommended Next</div>
        <div style={{ fontSize: 12, color: "#d4d4d8", lineHeight: 1.6 }}>
          {report.reflection.next_best_action}
        </div>
      </div>
    </>
  );
}

// =============================================================================
// Details Tab
// =============================================================================

function DetailsTab({ report }: { report: QAReport }) {
  const savings = report.memory_savings;
  return (
    <>
      {/* Persistent Memory Savings */}
      {savings && (savings.llm_calls_saved > 0 || savings.plan_reused || savings.steps_from_memory > 0) && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            🧠 Persistent Memory → LLM Savings
            <span style={{
              ...styles.improvementBadge(true),
              backgroundColor: "#1e3a5f",
              color: "#60a5fa",
            }}>
              {savings.savings_percent.toFixed(0)}% SAVED
            </span>
          </div>
          <div style={{
            backgroundColor: "#0d1117",
            border: "1px solid #1e3a5f",
            borderRadius: 6,
            padding: 12,
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.8 }}>
              {savings.plan_reused && (
                <div>📚 <span style={{ color: "#60a5fa" }}>Plan reused from cache</span> — saved 1 LLM planning call</div>
              )}
              {savings.steps_from_memory > 0 && (
                <div>🧠 <span style={{ color: "#60a5fa" }}>{savings.steps_from_memory} step(s) replayed from memory</span> — cached action sequences used</div>
              )}
              <div>📊 LLM calls made: <span style={{ color: "#d4d4d8", fontWeight: 600 }}>{savings.llm_calls_made}</span> · Saved: <span style={{ color: "#60a5fa", fontWeight: 600 }}>{savings.llm_calls_saved}</span></div>
              <div style={{ marginTop: 6, fontSize: 10, color: "#6b7280", fontStyle: "italic" }}>
                Persistent memory (experiences, cached plans, action sequences) reduces LLM dependency over time.
                On repeated runs against the same target, NOEMA requires fewer API calls.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Run Statistics</div>
        <div style={styles.stat}>
          <span>Total Events</span>
          <span style={styles.statValue}>{report.total_events}</span>
        </div>
        <div style={styles.stat}>
          <span>Actions Taken</span>
          <span style={styles.statValue}>{report.actions_taken}</span>
        </div>
        <div style={styles.stat}>
          <span>Observations</span>
          <span style={styles.statValue}>{report.observations_created}</span>
        </div>
        <div style={styles.stat}>
          <span>Models Affected</span>
          <span style={styles.statValue}>{report.models_affected}</span>
        </div>
        <div style={styles.stat}>
          <span>Experiences Learned</span>
          <span style={styles.statValue}>{report.experiences_learned}</span>
        </div>
        {savings && (
          <>
            <div style={styles.stat}>
              <span>LLM Calls Made</span>
              <span style={styles.statValue}>{savings.llm_calls_made}</span>
            </div>
            <div style={styles.stat}>
              <span>LLM Calls Saved (from memory)</span>
              <span style={{ ...styles.statValue, color: "#60a5fa" }}>{savings.llm_calls_saved}</span>
            </div>
          </>
        )}
        <div style={styles.stat}>
          <span>Duration</span>
          <span style={styles.statValue}>{(report.duration_ms / 1000).toFixed(1)}s</span>
        </div>
      </div>

      {/* Improvement Signals */}
      {report.improvement.signals.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Improvement Signals</div>
          {report.improvement.signals.map((signal, i) => (
            <div key={i} style={styles.stat}>
              <span>
                {signal.direction === "improved" ? "✓" : signal.direction === "regressed" ? "✗" : "–"}{" "}
                {signal.description}
              </span>
              <span style={{
                ...styles.statValue,
                color: signal.direction === "improved" ? "#22c55e"
                  : signal.direction === "regressed" ? "#ef4444"
                  : "#6b7280",
              }}>
                {signal.current_value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Identity */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Identity</div>
        <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6, fontStyle: "italic" }}>
          {report.identity_statement}
        </div>
      </div>
    </>
  );
}

// =============================================================================
// Recording Tab (Video Player)
// =============================================================================

function RecordingTab({ videoUrl }: { videoUrl: string }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>
        ▶ Session Recording
      </div>
      <div style={{
        fontSize: 11,
        color: "#6b7280",
        marginBottom: 10,
        lineHeight: 1.5,
      }}>
        Full browser session recording captured by Playwright during this QA run.
        Watch to see exactly what NOEMA did at every step.
      </div>
      <div style={{
        backgroundColor: "#000",
        borderRadius: 6,
        border: "1px solid #1e1e2e",
        overflow: "hidden",
      }}>
        <video
          controls
          style={{
            width: "100%",
            maxHeight: "60vh",
            display: "block",
          }}
          src={`${API_BASE}${videoUrl}`}
        >
          Your browser does not support the video tag.
        </video>
      </div>
      <div style={{ fontSize: 10, color: "#4b5563", marginTop: 6 }}>
        Format: WebM · Recorded at viewport resolution
      </div>
    </div>
  );
}

// =============================================================================
// Screenshot Lightbox Modal
// =============================================================================

function ScreenshotLightbox({ src, onClose, onPrev, onNext, current, total }: {
  src: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  current?: number;
  total?: number;
}) {
  // Arrow key navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPrev, onNext, onClose]);

  const navBtnStyle = (enabled: boolean): React.CSSProperties => ({
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 40,
    height: 60,
    borderRadius: 6,
    border: "1px solid #2e2e3e",
    backgroundColor: enabled ? "#1e1e2ecc" : "#0a0a0f44",
    color: enabled ? "#d4d4d8" : "#4b5563",
    fontSize: 20,
    cursor: enabled ? "pointer" : "default",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "inherit",
    transition: "all 0.15s",
    opacity: enabled ? 1 : 0.3,
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        cursor: "pointer",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          maxWidth: "90vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <img
          src={src}
          alt="Screenshot"
          style={{
            maxWidth: "85vw",
            maxHeight: "80vh",
            borderRadius: 6,
            border: "2px solid #2e2e3e",
            objectFit: "contain",
          }}
        />
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: -12,
            right: -12,
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "1px solid #2e2e3e",
            backgroundColor: "#0a0a0f",
            color: "#d4d4d8",
            fontSize: 14,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "inherit",
          }}
        >
          ✕
        </button>
        {/* Prev button */}
        {onPrev && (
          <button onClick={onPrev} style={{ ...navBtnStyle(true), left: -50 }}>
            ‹
          </button>
        )}
        {/* Next button */}
        {onNext && (
          <button onClick={onNext} style={{ ...navBtnStyle(true), right: -50 }}>
            ›
          </button>
        )}
        {/* Counter & instructions */}
        <div style={{
          textAlign: "center",
          marginTop: 8,
          fontSize: 11,
          color: "#6b7280",
          display: "flex",
          gap: 16,
          alignItems: "center",
        }}>
          {current !== undefined && total !== undefined && (
            <span style={{ color: "#d4d4d8", fontWeight: 600 }}>
              {current} / {total}
            </span>
          )}
          <span>← → arrow keys to navigate · Esc to close</span>
        </div>
      </div>
    </div>
  );
}
