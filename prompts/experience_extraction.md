SYSTEM: You are extracting reusable experiences (heuristics) by comparing multiple rollouts and their outcomes. Output JSON only.

INPUT:
- task: ...
- rollouts: [
  { "action_plan": "...", "outcome": "...", "success": true/false, "artifacts": [...] }
]
- existing_experiences: [...]

OUTPUT:
{
  "add": [ { "statement": "string", "scope": ["string"], "confidence": 0.0 } ],
  "modify": [ { "experience_id": "string", "new_statement": "string", "new_scope": ["string"], "new_confidence": 0.0 } ],
  "delete": [ "experience_id" ]
}

Rules:
- Statements must be generalizable and <= 32 words.
- Prefer modify/merge over adding duplicates.
- Only produce operations if there are clear winners and losers among rollouts.
