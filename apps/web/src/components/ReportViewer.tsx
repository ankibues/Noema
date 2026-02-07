import type { QAReport } from "../api/noemaClient";

interface Props {
  report: QAReport;
}

const resultColors = {
  pass: "#22c55e",
  fail: "#ef4444",
  partial: "#fbbf24",
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
    padding: 12,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: "#8b5cf6",
    marginBottom: 6,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
  },
  resultBadge: (result: string) => ({
    display: "inline-block",
    fontSize: 12,
    fontWeight: 700,
    padding: "2px 10px",
    borderRadius: 4,
    backgroundColor: result === "pass" ? "#166534" : result === "fail" ? "#991b1b" : "#854d0e",
    color: resultColors[result as keyof typeof resultColors] || "#fff",
    letterSpacing: 1,
  }),
  stat: {
    display: "flex",
    justifyContent: "space-between",
    padding: "3px 0",
    fontSize: 12,
    color: "#9ca3af",
    borderBottom: "1px solid #111118",
  },
  statValue: {
    color: "#d4d4d8",
    fontWeight: 600,
  },
  listItem: {
    fontSize: 12,
    color: "#9ca3af",
    lineHeight: 1.6,
    paddingLeft: 12,
    position: "relative" as const,
  },
  downloadBtn: {
    padding: "4px 10px",
    backgroundColor: "#1e1e2e",
    border: "1px solid #2e2e3e",
    borderRadius: 3,
    color: "#8b5cf6",
    fontSize: 10,
    fontFamily: "inherit",
    cursor: "pointer",
    fontWeight: 600,
  },
  improvementBadge: (improved: boolean) => ({
    display: "inline-block",
    fontSize: 10,
    fontWeight: 600,
    padding: "1px 6px",
    borderRadius: 3,
    backgroundColor: improved ? "#166534" : "#1e1e2e",
    color: improved ? "#86efac" : "#6b7280",
    marginLeft: 6,
  }),
};

export default function ReportViewer({ report }: Props) {
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
      <div style={styles.header}>
        <span>
          QA REPORT
          <span style={styles.resultBadge(report.result)}>{report.result.toUpperCase()}</span>
        </span>
        <button style={styles.downloadBtn} onClick={handleDownload}>
          JSON
        </button>
      </div>
      <div style={styles.body}>
        {/* Summary */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Summary</div>
          <div style={{ fontSize: 12, color: "#d4d4d8", lineHeight: 1.6 }}>
            {report.summary}
          </div>
        </div>

        {/* Stats */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Stats</div>
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
          <div style={styles.stat}>
            <span>Duration</span>
            <span style={styles.statValue}>{(report.duration_ms / 1000).toFixed(1)}s</span>
          </div>
        </div>

        {/* Improvement */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            Improvement
            <span style={styles.improvementBadge(report.improvement.has_improved)}>
              {report.improvement.has_improved ? "IMPROVED" : "BASELINE"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}>
            {report.improvement.conclusion}
          </div>
        </div>

        {/* Reflection */}
        {report.reflection.what_learned.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>What NOEMA Learned</div>
            {report.reflection.what_learned.map((item, i) => (
              <div key={i} style={styles.listItem}>
                {item}
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
      </div>
    </div>
  );
}
