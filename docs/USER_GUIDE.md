# NOEMA — User Guide

> **All paths below are relative to the project root (`Noema/`).** After cloning or downloading the repository, `cd` into that directory first.

## Prerequisites

- **Node.js** 18+ (recommended: 20 LTS)
- **npm** (ships with Node.js)
- **Python 3.10+** (only if using Cognee semantic memory)
- **Playwright browsers** (installed during setup)

---

## Setup from Scratch

### Step 1: Clone and install dependencies

```bash
# Clone the repo (if you haven't already)
git clone <repo-url> && cd Noema

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

### Step 2: Configure environment

Create `apps/api/.env` with your API keys:

```bash
# Required — Gemini 3 (LLM reasoning backbone)
GEMINI_API_KEY=your-gemini-api-key-here
GEMINI_MODEL=gemini-3-flash-preview

# Gemini Vision — screenshot analysis (uses same API key)
GEMINI_VISION_MODEL=gemini-3-pro-image-preview

# Optional — Cognee semantic memory (improves evidence retrieval across runs)
OPENAI_API_KEY=your-openai-api-key-here

# Optional — Test credentials (injected into decision context, never shown in UI)
TEST_USERNAME=testuser@example.com
TEST_PASSWORD=your-test-password-here

# Server
NOEMA_API_PORT=8200
COGNEE_SERVICE_URL=http://localhost:8100
```

If you plan to use Cognee (recommended), also create `apps/cognee_service/.env`:

```bash
# Required by the Cognee Python service for embeddings
OPENAI_API_KEY=your-openai-api-key-here
```

> **Note:** The Cognee Python service loads its own `.env` from its own directory (`apps/cognee_service/`). It does NOT read `apps/api/.env`. Make sure `OPENAI_API_KEY` is set in **both** files, or export it as a shell variable (`export OPENAI_API_KEY=...`) before starting each service.

**How auto-detection works:**

| Key | Present? | Effect |
|---|---|---|
| `GEMINI_API_KEY` | ✓ | Real Gemini 3 reasoning for beliefs, decisions, experience extraction **+ Gemini Vision for screenshot analysis** |
| `GEMINI_API_KEY` | ✗ | Mock LLM mode — deterministic responses, no API calls, no vision |
| `OPENAI_API_KEY` | ✓ | Cognee semantic memory enabled — evidence indexed and retrievable across runs |
| `OPENAI_API_KEY` | ✗ | Cognee disabled — NOEMA uses its own storage and belief graph (still fully functional) |
| `TEST_USERNAME` + `TEST_PASSWORD` | ✓ | Credentials injected into LLM decision context for login/auth form filling — **never shown in narration or UI** |
| `TEST_USERNAME` + `TEST_PASSWORD` | ✗ | NOEMA attempts login tests without credentials, or notes they are needed |

### Step 3: Build the API

```bash
cd apps/api
npm run build
```

### Step 4: Start the Cognee service (optional, but recommended)

If you have an OpenAI API key and want Cognee semantic memory:

```bash
cd apps/cognee_service

# First time: create virtual environment and install
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Ensure OPENAI_API_KEY is available (either in apps/cognee_service/.env or exported)
# Start the service
uvicorn main:app --host 0.0.0.0 --port 8100 --reload
```

Verify: `curl http://localhost:8100/health` should return `{"status": "ok"}`

### Step 5: Start the API server

In a new terminal (from the project root):

```bash
cd apps/api
npm run server
```

Watch the startup output:
```
NOEMA API server running on http://localhost:8200
─────────────────────────────────────────
LLM:    ✓ Gemini 3 (gemini-3-flash-preview)
        Real reasoning enabled
Vision: ✓ Gemini Vision (gemini-3-pro-image-preview)
        Screenshot analysis active — pages understood visually
Cognee: ✓ Enabled (http://localhost:8100)
        Semantic memory active — start Cognee service separately
Creds:  ✓ Test credentials loaded (TEST_USERNAME/TEST_PASSWORD)
        Credentials injected into decision context — never shown in narration
─────────────────────────────────────────
```

If you see `⚠ No API key` for LLM or `○ Disabled` for Cognee, your `.env` is not loaded — check the file path and contents.

### Step 6: Start the React Cockpit

In a separate terminal (from the project root):

```bash
cd apps/web
npm run dev
# → http://localhost:3000
```

### Step 7: Open the Cockpit

Navigate to **http://localhost:3000** in your browser. You'll see the NOEMA Cockpit with:
- A connection indicator (green = connected)
- NOEMA's identity info in the header (age, runs, experiences)

---

## NOEMA Lifecycle: From Blank Slate to Learned Expert

This section walks through the complete lifecycle of a NOEMA instance — from fresh start to accumulated learning. This is what makes NOEMA different: **every run makes the next one better.**

### Phase A: Birth (First Start)

When NOEMA starts for the first time (or after you delete the `data/` directory), it creates a fresh identity:

- Identity assigned (unique ID, creation timestamp)
- No observations, no beliefs, no experiences
- Empty belief graph
- The Lifetime panel in the cockpit shows: "0 runs, 0 experiences"

**What this means:** NOEMA is a blank slate. It has no prior knowledge and will explore from scratch.

### Phase B: First Run (Exploration)

Submit a QA task (e.g., "Test the login flow" with a target URL). NOEMA:

1. **Senses** — Ingests the task description, creates initial observations
2. **Believes** — Forms initial Mental Models from observations (e.g., "This is a login page with form validation"). Each model has a confidence score and evidence links.
3. **Decides** — Selects browser actions based on its (minimal) beliefs. Without prior experience, these may be naive: navigate, screenshot, click.
4. **Acts** — Playwright executes the actions in a real browser. Captures screenshots, console logs, network data.
   5. **Sees** — Screenshots are analyzed via **Gemini Vision** (`gemini-3-pro-image-preview`), providing rich visual understanding of the current page — UI elements, text, errors, interactive controls. This visual context feeds into the next decision cycle.
   6. **Observes** — Action outcomes (including vision analysis) feed back as new observations, updating beliefs
6. **Learns** — The Experience Optimizer runs multiple rollouts, compares outcomes on 5 weighted criteria, and extracts reusable heuristics (if there's a clear winner)
7. **Reflects** — Builds a timeline, generates a structured reflection and QA report

**What to watch for:**
- The narration panel shows every step in first person
- Browser activity shows actions with ✓/✗ badges
- Some actions may **fail** — this is expected and valuable
- Experiences may or may not be learned (depends on whether rollout comparison produces a clear winner)
- The QA report appears with a verdict (pass/fail/partial) and reflection

**After first run:** NOEMA now has observations, mental models, a belief graph, possibly experiences, and run metrics. Its identity shows "1 run completed."

### Phase C: Second Run (Application)

Run the **same or similar task** again. This time, NOEMA:

1. **Starts with knowledge** — Prior experiences are injected into the decision prompt as "token priors," biasing the LLM toward previously successful strategies
2. **Recalls beliefs** — Existing Mental Models inform cognition. If Cognee is active, evidence is also retrieved from semantic memory
3. **Makes better decisions** — The Experience Injector scores stored experiences against the current task using keyword, scope, and belief-context matching, then injects the most relevant ones
4. **Avoids prior mistakes** — Experiences encode "what worked better," so actions that previously failed are less likely to be chosen
5. **Updates beliefs** — Existing models get updated (confidence changes, new evidence linked), not just created from scratch

**What to watch for:**
- Narration mentions recalled experiences: "I have prior experience suggesting..."
- Fewer action failures compared to Run 1
- Possibly fewer total steps to reach the same result
- The Improvement Analyzer compares this run to prior runs and reports measurable changes
- The Lifetime panel updates: "2 runs, X experiences"

### Phase D: Third+ Run (Measurable Improvement)

After 3+ runs, the improvement signal becomes clear:

- **ImprovementAnalyzer** compares average metrics across similar runs
- Reports things like: "NOEMA used fewer steps to complete (3 vs avg 5.0)"
- Each run adds to the experience library — compounding knowledge
- The belief graph grows: models gain `depends_on`, `explains`, `extends`, `contradicts` edges
- Confidence scores on Mental Models stabilize as evidence accumulates

**Key demo moment:** The third run should visibly demonstrate:
- Fewer steps or fewer failures than Run 1
- Experience library growing
- Improvement summary in the QA report
- Lifetime panel showing accumulated growth

### Phase E: Cross-Run Persistence

NOEMA's identity, beliefs, experiences, and graph persist across **server restarts**:

```bash
# Stop the server (Ctrl+C)
# ... minutes, hours, or days pass ...
# Start again (from project root)
cd apps/api
npm run server
```

The startup log shows the same identity ID and age. All prior learning is intact.

### Reset to Start Over

From the project root:

```bash
rm -rf data/
cd apps/api
npm run server
```

NOEMA starts fresh — new identity, no prior knowledge. Useful for demo resets.

---

## Running a QA Task

### From the Cockpit UI

1. **Enter a Goal** — Describe what you want NOEMA to test (e.g., "Test the login flow of this web app")
2. **Enter a URL** — The target web application URL
3. **Click RUN** — NOEMA starts immediately

### What Happens During a Run

The cockpit shows live panels:

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
    "url": "https://the-internet.herokuapp.com/login",
    "max_cycles_per_step": 3,
    "max_total_actions": 15,
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

# Check NOEMA's identity and lifetime
curl http://localhost:8200/identity

# Check improvement analysis
curl http://localhost:8200/improvement
```

---

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
  "url": "https://the-internet.herokuapp.com/login",
  "critical_scenarios": ["invalid credentials", "empty fields"],
  "max_cycles_per_step": 3,
  "max_total_actions": 15,
  "mock_llm": false,
  "visible_browser": false,
  "enable_optimization": true
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `goal` | string | required | High-level QA goal |
| `url` | string | required | Target URL to test |
| `critical_scenarios` | string[] | `[]` | Specific scenarios to focus on |
| `max_cycles_per_step` | number | `3` | Max decision-action cycles per plan step |
| `max_total_actions` | number | `15` | Max total actions across all steps |
| `mock_llm` | boolean | auto | Auto-detected: `false` if `GEMINI_API_KEY` is set, `true` otherwise. Not exposed in UI. |
| `visible_browser` | boolean | `false` | Show Playwright browser window |
| `enable_optimization` | boolean | `true` | Run experience optimization after actions |

> **Note:** Test credentials (`TEST_USERNAME`, `TEST_PASSWORD`) are loaded from environment variables — **not from the request body**. This keeps credentials out of network traffic, browser history, and the frontend.

---

## Understanding NOEMA's Output

### Narration Event Types

| Type | Icon | Meaning |
|---|---|---|
| `system` | SYS | System lifecycle event |
| `narration` | NAR | NOEMA's self-explanation |
| `plan_generated` | PLN | Test plan created before execution |
| `plan_step_started` | STP | A plan step is starting |
| `plan_step_completed` | ✓ | A plan step finished (pass/fail) |
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

---

## Configuration

### Environment Variables

**API server** — set in `apps/api/.env`:

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | **Required** for real LLM mode and Vision |
| `GEMINI_MODEL` | `gemini-3-flash-preview` | Gemini 3 model for reasoning (beliefs, decisions, experience extraction) |
| `GEMINI_VISION_MODEL` | `gemini-3-pro-image-preview` | Gemini 3 model for screenshot visual analysis |
| `NOEMA_API_PORT` | `8200` | API server port |
| `OPENAI_API_KEY` | — | Enables Cognee semantic memory (for embeddings). Recommended for full functionality |
| `COGNEE_SERVICE_URL` | `http://localhost:8100` | URL of the Cognee Python service |
| `TEST_USERNAME` | — | Test user credentials for login forms — injected into decision context, **never shown in narration or UI** |
| `TEST_PASSWORD` | — | Test user password — same security rules as `TEST_USERNAME` |
| `TEST_CREDENTIALS_JSON` | — | Additional credential fields as JSON — e.g., `{"api_token":"abc","2fa_code":"123456"}` |

**Cognee service** — set in `apps/cognee_service/.env`:

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | **Required** for Cognee embeddings (same key as above) |

> **Tip:** If you prefer not to maintain two `.env` files, you can export `OPENAI_API_KEY` as a shell environment variable and both services will pick it up.

### Data Persistence

All NOEMA state is stored in the `data/` directory at the project root:

```
data/
├── identity.json          # NOEMA instance identity
├── run_metrics.json       # Per-run performance metrics (including LLM savings)
├── observations.json      # All observations
├── mental_models.json     # Belief structures
├── experiences.json       # Learned heuristics
├── actions.json           # Action history
├── action_outcomes.json   # Action results
├── graph_edges.json       # Belief graph edges (depends_on, explains, extends, contradicts)
├── plan_cache.json        # Cached test plans (reused on repeat runs to skip LLM)
├── action_sequences.json  # Recorded action sequences (replayed to skip LLM decisions)
├── runs.json              # Run records (auto-created on first run)
├── screenshots/           # Captured browser screenshots (auto-created)
└── logs/                  # Run logs
```

To reset NOEMA to a fresh state, delete the `data/` directory from the project root and restart.

---

## Demo Playbook (Recommended for Judges)

This is the fastest way to see NOEMA's full capability:

### Preparation

All commands assume you are starting from the **project root** (`Noema/`).

```bash
# 1. Clean state (from project root)
rm -rf data/

# 2. Build
cd apps/api && npm run build && cd ../..

# 3. Start Cognee (optional, separate terminal, from project root)
cd apps/cognee_service && source venv/bin/activate && uvicorn main:app --port 8100

# 4. Start API (separate terminal, from project root)
cd apps/api && npm run server

# 5. Start frontend (separate terminal, from project root)
cd apps/web && npm run dev
```

### Run 1: First Encounter
1. Open http://localhost:3000
2. Goal: `Test the login flow`
3. URL: `https://the-internet.herokuapp.com/login`
4. Click **RUN**
5. Watch: narration, actions, belief formation
6. Note: Lifetime shows "1 run" — no prior experience

### Run 2: Learning Applied + Plan Reused
1. Same goal and URL → Click **RUN** again
2. Watch narration: *"I found a cached test plan from a previous run — reusing it"*
3. Watch narration: *"Prior experiences being injected into decisions"*
4. Compare: fewer failures, possibly fewer steps
5. Check: QA Report → Details tab shows "Persistent Memory → LLM Savings" section
6. Note: Plan was reused (1 LLM call saved), experiences make decisions faster

### Run 3: Measurable Improvement + Action Sequences Replayed
1. Same goal and URL → Click **RUN** again
2. Watch narration: *"Replaying known action sequence from memory — saving N LLM calls"*
3. Check: Improvement Analyzer compares across all 3 runs
4. Check: Lifetime panel shows growth (3 runs, X experiences, X beliefs)
5. Check: QA Report → Details tab shows increasing LLM savings (plan reused + steps from memory)
6. Note: Each successive run should require fewer LLM calls than the last

### What Judges Should See
- **Run 1** → Exploration, possible failures, learning. All actions decided by LLM.
- **Run 2** → Plan reused from cache. Experiences applied. Better decisions with fewer failures.
- **Run 3** → Plan reused + action sequences replayed from memory. Measurable LLM call savings. Improvement signals.
- **LLM Savings** → QA Report Details tab shows `llm_calls_made` vs `llm_calls_saved` with savings percentage
- **Persistence** → Stop and restart server → all learning, cached plans, and action sequences preserved
- **Identity** → Lifetime panel shows cumulative growth across the entire lifecycle

---

## Troubleshooting

| Issue | Solution |
|---|---|
| "Cannot find module" on server start | Run `npm run build` in `apps/api` |
| Playwright browser error | Run `npx playwright install chromium` |
| Frontend can't connect | Ensure API is running on port 8200 |
| Connection shows "disconnected" | Check that `curl http://localhost:8200/health` returns 200 |
| Mock mode produces repetitive actions | Expected — mock LLM uses deterministic responses |
| Gemini API errors | Check `GEMINI_API_KEY` is valid and model identifier is correct |
| Cognee connection refused | Start the Cognee service: `cd apps/cognee_service && uvicorn main:app --port 8100` |
| Cognee "OPENAI_API_KEY not set" warning | Ensure `OPENAI_API_KEY` is in `apps/cognee_service/.env` or exported in your shell |
| No improvement showing | Run 3+ times with the same task type for comparison data |
| "No API key" on startup | Check that `apps/api/.env` exists and has `GEMINI_API_KEY` set |
