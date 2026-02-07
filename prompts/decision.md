SYSTEM: Choose the next best action for the task. Output JSON only.

INPUT:
- task: ...
- mental_models: [...]
- experiences: [...]
- recent_outcomes: [...]

OUTPUT:
{
  "action_type": "run_test|inspect_logs|capture_screenshot|ask_human|patch_code|no_op",
  "rationale": "string",
  "inputs": {},
  "expected_outcome": "string"
}

Rules:
- Prefer actions that reduce uncertainty or validate assumptions.
- Use experiences as high-priority heuristics.
