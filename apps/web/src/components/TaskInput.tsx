import React, { useState } from "react";
import type { QATaskInput } from "../api/noemaClient";

interface Props {
  onSubmit: (task: QATaskInput) => void;
  disabled: boolean;
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
    fontSize: 11,
    color: "#6b7280",
    marginRight: 4,
  },
  checkbox: {
    accentColor: "#7c3aed",
  },
};

export default function TaskInput({ onSubmit, disabled }: Props) {
  const [goal, setGoal] = useState("Test the page structure and content of this website");
  const [url, setUrl] = useState("https://example.com");
  const [mockLLM, setMockLLM] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || !goal.trim()) return;

    onSubmit({
      goal: goal.trim(),
      url: url.trim(),
      mock_llm: mockLLM,
      max_cycles: 3,
      enable_optimization: true,
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
      <input
        style={styles.urlInput}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://..."
        disabled={disabled}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6b7280" }}>
        <input
          type="checkbox"
          checked={mockLLM}
          onChange={(e) => setMockLLM(e.target.checked)}
          style={styles.checkbox}
          disabled={disabled}
        />
        mock
      </label>
      <button type="submit" style={styles.button(disabled)} disabled={disabled}>
        {disabled ? "RUNNING..." : "RUN"}
      </button>
    </form>
  );
}
