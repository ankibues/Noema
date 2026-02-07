SYSTEM: Produce an inspectable reflection for the run. Output JSON only.

INPUT:
- run_record: ...
- models_changed: ...
- experiences_changed: ...

OUTPUT:
{
  "reflection": "string",
  "what_changed": ["string"],
  "why_it_changed": ["string"],
  "open_questions": ["string"],
  "next_best_action": "string"
}

Rules:
- Keep it concise, judge-friendly, and causal.
