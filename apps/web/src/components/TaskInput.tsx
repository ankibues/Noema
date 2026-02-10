import React, { useState, useEffect } from "react";
import type { QATaskInput } from "../api/noemaClient";

interface Props {
  onSubmit: (task: QATaskInput) => void;
  onStop?: () => void;
  disabled: boolean;
  running?: boolean;
  /** Pre-fill goal from NOEMA suggestion */
  prefillGoal?: string | null;
  /** Called after the prefill has been consumed */
  onPrefillConsumed?: () => void;
}

const styles = {
  container: {
    padding: "12px 20px",
    display: "flex",
    gap: 12,
    alignItems: "center",
    borderBottom: "1px solid #1e1e2e",
  },
  input: {
    flex: 1,
    padding: "8px 12px",
    backgroundColor: "#111118",
    border: "1px solid #2e2e3e",
    borderRadius: 4,
    color: "#d4d4d8",
    fontFamily: "inherit",
    fontSize: 13,
    outline: "none",
  },
  urlInput: {
    width: 200,
    padding: "8px 12px",
    backgroundColor: "#111118",
    border: "1px solid #2e2e3e",
    borderRadius: 4,
    color: "#8b8b9e",
    fontFamily: "inherit",
    fontSize: 12,
    outline: "none",
  },
  button: (disabled: boolean) => ({
    padding: "8px 20px",
    backgroundColor: disabled ? "#1e1e2e" : "#7c3aed",
    color: disabled ? "#4b4b5e" : "#fff",
    border: "none",
    borderRadius: 4,
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    letterSpacing: 1,
    transition: "background-color 0.2s",
  }),
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#9ca3af",
    marginRight: 6,
    letterSpacing: 1,
  },
};

export default function TaskInput({ onSubmit, onStop, disabled, running, prefillGoal, onPrefillConsumed }: Props) {
  const [goal, setGoal] = useState("Test the page structure and content of this website");
  const [url, setUrl] = useState("https://example.com");
  const [urlError, setUrlError] = useState("");

  // Handle prefill from NOEMA suggestion
  useEffect(() => {
    if (prefillGoal) {
      setGoal(prefillGoal);
      onPrefillConsumed?.();
    }
  }, [prefillGoal, onPrefillConsumed]);

  const validateUrl = (input: string): string | null => {
    if (!input.trim()) return "URL is required";
    const httpCount = (input.match(/https?:\/\//g) || []).length;
    if (httpCount > 1) return "Multiple URLs detected — please enter only one URL";
    try {
      const testUrl = input.startsWith("http") ? input : "https://" + input;
      new URL(testUrl);
      return null;
    } catch {
      return "Invalid URL format";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || !goal.trim()) return;

    const error = validateUrl(url);
    if (error) {
      setUrlError(error);
      return;
    }
    setUrlError("");

    onSubmit({
      goal: goal.trim(),
      url: url.trim(),
      mock_llm: false,
      max_cycles_per_step: 5,
      max_total_actions: 40,
      enable_optimization: false,
    });
  };

  return (
    <form style={styles.container} onSubmit={handleSubmit}>
      <span style={styles.label}>GOAL:</span>
      <input
        style={styles.input}
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="Describe the QA task..."
        disabled={disabled}
      />
      <span style={styles.label}>URL:</span>
      <div style={{ position: "relative" }}>
        <input
          style={{
            ...styles.urlInput,
            ...(urlError ? { borderColor: "#ef4444" } : {}),
          }}
          value={url}
          onChange={(e) => { setUrl(e.target.value); setUrlError(""); }}
          placeholder="https://..."
          disabled={disabled}
        />
        {urlError && (
          <div style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            fontSize: 10,
            color: "#ef4444",
            padding: "2px 4px",
            whiteSpace: "nowrap",
          }}>
            {urlError}
          </div>
        )}
      </div>
      {running ? (
        <button
          type="button"
          onClick={onStop}
          style={{
            padding: "8px 20px",
            backgroundColor: "#dc2626",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: 1,
            transition: "background-color 0.2s",
          }}
        >
          ■ STOP
        </button>
      ) : (
        <button type="submit" style={styles.button(disabled)} disabled={disabled}>
          RUN
        </button>
      )}
    </form>
  );
}
