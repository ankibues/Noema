# NOEMA — User Guide

## Prerequisites

- **Node.js** 18+ (recommended: 20 LTS)
- **npm** (ships with Node.js)
- **Playwright browsers** (auto-installed on first run)

## Quick Start

### 1. Install dependencies

```bash
# API (backend)
cd apps/api
npm install

# Web cockpit (frontend)
cd ../web
npm install

# Install Playwright browsers (first time only)
cd ../api
npx playwright install chromium
```

### 2. Build the API

```bash
cd apps/api
npm run build
```

### 3. Start the API server

```bash
npm run server
# → NOEMA API server running on http://localhost:8200
```

### 4. Start the React Cockpit

In a separate terminal:

```bash
cd apps/web
npm run dev
# → Local: http://localhost:3000
```

### 5. Open the Cockpit

Navigate to **http://localhost:3000** in your browser. You'll see the NOEMA Cockpit with:
- A connection indicator (green = connected)
- NOEMA's identity info in the header (age, runs, experiences)

## Running a QA Task

### From the Cockpit UI

1. **Enter a Goal** — Describe what you want NOEMA to test (e.g., "Test the login flow of this web app")
2. **Enter a URL** — The target web application URL
3. **Toggle Mock Mode** — Check "mock" to use simulated LLM responses (faster, no API key needed). Uncheck for real Gemini 3 LLM calls.
4. **Click RUN** — NOEMA starts immediately

### What Happens During a Run

The cockpit shows six live panels:

| Panel | What You See |
|---|---|
| **Narration** | NOEMA's first-person explanation of what it's doing and why |
| **Browser Activity** | Each action (navigate, click, screenshot) with success/fail badges and timing |
| **Evidence & Beliefs** | Captured evidence, newly formed beliefs, learned experiences |
| **QA Report** | After completion: structured report with pass/fail/partial verdict, stats, reflection |
| **Lifetime** | NOEMA's persistent identity — age, total runs, accumulated experiences, improvement trends |

### From the API (curl / scripts)

```bash
# Start a run
curl -X POST http://localhost:8200/qa/run \
  -H 'Content-Type: application/json' \
  -d '{
    "goal": "Test the login flow",
    "url": "https://your-app.com",
    "mock_llm": false,
    "max_cycles": 3,
    "enable_optimization": true
  }'
# Returns: { "success": true, "data": { "run_id": "...", "status": "started" } }

# Stream live events (SSE)
curl -N http://localhost:8200/run/{run_id}/stream

# Get run state
curl http://localhost:8200/run/{run_id}/state

# Get full report
curl http://localhost:8200/run/{run_id}/report

# Get all narration events
curl http://localhost:8200/run/{run_id}/events
```

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/identity` | GET | NOEMA instance identity and lifetime metrics |
| `/qa/run` | POST | Start a new QA run |
| `/runs` | GET | List all runs in this session |
| `/run/:id/state` | GET | Get current run status |
| `/run/:id/stream` | GET | SSE stream of live narration events |
| `/run/:id/events` | GET | Full narration history for a run |
| `/run/:id/report` | GET | Generated QA report with reflection |
| `/metrics` | GET | All recorded run metrics |
| `/improvement` | GET | Improvement analysis comparing recent runs |
| `/ingest` | POST | Ingest raw content (text/log/screenshot) |

### POST /qa/run — Request Body

```json
{
  "goal": "Test the login flow of this web app",
  "url": "https://example.com",
  "critical_scenarios": ["invalid credentials", "empty fields"],
  "max_cycles": 3,
  "mock_llm": true,
  "visible_browser": false,
  "enable_optimization": true
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `goal` | string | required | High-level QA goal |
| `url` | string | required | Target URL to test |
| `critical_scenarios` | string[] | `[]` | Specific scenarios to focus on |
| `max_cycles` | number | `3` | Max decision-action cycles |
| `mock_llm` | boolean | `true` | Use mock LLM (no API key needed) |
| `visible_browser` | boolean | `false` | Show Playwright browser window |
| `enable_optimization` | boolean | `true` | Run experience optimization after actions |

## Understanding NOEMA's Output

### Narration Event Types

| Type | Icon | Meaning |
|---|---|---|
| `system` | SYS | System lifecycle event |
| `narration` | NAR | NOEMA's self-explanation |
| `action_started` | ACT | An action is about to execute |
| `action_completed` | OK | An action finished (with status) |
| `evidence_captured` | EVD | Evidence captured (screenshots, logs) |
| `belief_formed` | BLF | A mental model created or updated |
| `experience_learned` | EXP | A reusable experience was learned |
| `run_started` | RUN | The run began |
| `run_completed` | END | The run finished |
| `error` | ERR | Something went wrong |

### QA Report Structure

```json
{
  "run_id": "...",
  "task": "Test the login flow",
  "result": "pass | fail | partial",
  "summary": "Human-readable summary of findings",
  "reflection": {
    "what_observed": ["..."],
    "what_believed": ["..."],
    "what_tried": ["..."],
    "what_worked_better": ["..."],
    "what_learned": ["..."],
    "improvement_summary": "...",
    "open_questions": ["..."],
    "next_best_action": "..."
  },
  "improvement": {
    "has_improved": true,
    "conclusion": "NOEMA used fewer steps...",
    "signals": [...]
  },
  "identity_statement": "This NOEMA instance has been active for..."
}
```

## Configuration

### Environment Variables

Set these in `apps/api/.env` (see `.env.example` at project root):

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | **Required** for real LLM mode. Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Gemini 3 model identifier |
| `NOEMA_API_PORT` | `8200` | API server port |
| `OPENAI_API_KEY` | — | Only needed if Cognee semantic memory service is enabled (for embeddings) |
| `COGNEE_SERVICE_URL` | `http://localhost:8100` | URL of the Cognee Python service |

The server auto-detects the API key on startup:
- **Key present** → real Gemini 3 LLM reasoning
- **Key absent** → mock LLM mode (deterministic, no API calls)

### Data Persistence

All NOEMA state is stored in the `data/` directory at the project root:

```
data/
├── identity.json          # NOEMA instance identity
├── run_metrics.json       # Per-run performance metrics
├── observations.json      # All observations
├── mental_models.json     # Belief structures
├── experiences.json       # Learned heuristics
├── actions.json           # Action history
├── action_outcomes.json   # Action results
├── graph_edges.json       # Belief graph edges (depends_on, explains, extends, contradicts)
├── runs.json              # Run records
└── screenshots/           # Captured browser screenshots
```

To reset NOEMA to a fresh state, delete the `data/` directory and restart.

## Troubleshooting

| Issue | Solution |
|---|---|
| "Cannot find module" on server start | Run `npm run build` in `apps/api` |
| Playwright browser error | Run `npx playwright install chromium` |
| Frontend can't connect | Ensure API is running on port 8200 |
| Connection shows "disconnected" | Check that `/health` returns 200 |
| Mock mode produces repetitive actions | Expected — mock LLM uses deterministic responses |
