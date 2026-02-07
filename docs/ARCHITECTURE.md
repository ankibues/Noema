# NOEMA — Architecture Deep Dive


## System Identity

**NOEMA** is a persistent digital cognitive system that accumulates experience and improves behavior over time without retraining models.

Unlike conventional AI agents that start fresh each invocation, NOEMA:
- **Persists** — it remembers everything across restarts
- **Learns** — it distills reusable experiences from action outcomes
- **Improves** — each run benefits from all prior runs
- **Explains** — it narrates its own cognition in real-time

---

## Layered Architecture

NOEMA is organized into 7 functional layers:

```
┌─────────────────────────────────────────────────────────┐
│  Human Interface + Narration + Metrics                  │
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │   React Cockpit     │  │  API Server (HTTP+SSE)   │  │
│  │  TaskInput          │  │  /qa/run                 │  │
│  │  NarrationStream    │  │  /run/:id/stream         │  │
│  │  BrowserFeed        │  │  /run/:id/report         │  │
│  │  EvidencePanel      │  │  /identity               │  │
│  │  ReportViewer       │  │  /metrics                │  │
│  │  LifetimePanel      │  │  /improvement            │  │
│  └─────────────────────┘  └──────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  Experience Optimizer (Training-Free GRPO)               │
│  RolloutManager → OutcomeEvaluator → ExperienceExtractor│
│  ExperienceInjector (scores + injects priors into LLM)  │
├─────────────────────────────────────────────────────────┤
│  Decision Engine (Action Selection + Execution)         │
│  DecisionEngine → ActionExecutor → PlaywrightRunner     │
│  BrowserSession management + artifact capture           │
├─────────────────────────────────────────────────────────┤
│  Cognition (Belief Formation + Evolution)               │
│ModelUpdateEngine → CandidateSelector → EvidenceRetriever│
│  LLM-driven belief revision with confidence tracking    │
│  Belief Graph: model-to-model edges with typed relations│
├─────────────────────────────────────────────────────────┤
│  Sensing (Perceptual IO)                                │
│  SensorHub → Adapters (Text/Log/Screenshot)             │
│Processors (Chunker/Normalizer/Salience) → ObservationBus│
├─────────────────────────────────────────────────────────┤
│  Semantic Memory (Cognee — optional, external)          │
│  Evidence retrieval + graph context via HTTP             │
├─────────────────────────────────────────────────────────┤
│  Persistent Storage                                     │
│  JSON file repositories with Zod validation             │
│  Observations, Models, Experiences, Graph Edges, Actions│
└─────────────────────────────────────────────────────────┘
```

---

## Domain Generality

NOEMA's cognitive architecture is **domain-agnostic**. The core loop — Sense → Believe → Decide → Act → Observe → Learn → Reflect — makes no assumptions about what kind of task is being performed.

**What is general-purpose:**
- **Observations** — canonical perception units that represent any input, not just QA artifacts
- **Mental Models** — structured beliefs about any domain (the schema supports `software_QA`, `programming`, `research`, `general`)
- **Experiences** — reusable heuristics scoped by domain/task tags, not tied to any specific action type
- **Belief Graph** — relationships between models (`depends_on`, `explains`, `contradicts`) apply to any knowledge domain
- **Experience Optimizer** — rollout → compare → distill works for any task with observable outcomes

**What is pluggable (domain-specific):**
- **Action types** — currently Playwright browser actions (`navigate`, `click`, `fill`, `screenshot`). New domains require new action adapters (file operations, API calls, terminal commands, code editing)
- **Sensor adapters** — currently text, logs, and screenshots. New input types (API responses, terminal output, file diffs) require new adapters

For this demo, NOEMA is applied to **Software QA** — a high-signal domain where sensing, belief formation, and action selection are clearly visible. But the same architecture applies to any digital task: code review, security auditing, data pipeline monitoring, compliance checking, or customer support triage. The cognitive core doesn't change — only the action set and sensor adapters do.

---

## Core Cognitive Loop

Every run follows NOEMA's cognitive metabolism:

```
Human Intent (e.g. "Test the login flow on example.com")
        │
        ▼
┌───────────────┐
│   1. SENSE    │  Ingest task description → create Observations
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  2. BELIEVE   │  ModelUpdateEngine forms/updates Mental Models
└───────┬───────┘  from observations + retrieved evidence
        │
        ▼
┌───────────────┐
│  3. DECIDE    │  DecisionEngine selects action based on
└───────┬───────┘  models + experiences + recent outcomes
        │
        ▼
┌───────────────┐
│   4. ACT      │  PlaywrightRunner executes browser action
└───────┬───────┘  captures screenshots, logs, network data
        │
        ▼
┌───────────────┐
│  5. OBSERVE   │  Action outcome → new Observations
└───────┬───────┘  fed back through sensing layer
        │
        ▼
┌───────────────┐
│  6. LEARN     │  ExperienceOptimizer runs K rollouts,
└───────┬───────┘  compares outcomes, extracts reusable heuristics
        │
        ▼
┌───────────────┐
│  7. REFLECT   │  Build timeline, analyze improvement,
└───────┬───────┘  generate structured reflection + QA report
        │
        ▼
    Next Run Benefits
```

### The Key Insight: Training-Free GRPO (Group Relative Policy Optimization)

NOEMA's learning mechanism is inspired by GRPO — a reinforcement learning technique that compares groups of outputs to determine which is better — but adapted to work **without gradient updates or model retraining**.

**How it works:**

1. **Multiple rollouts** — For the same task and belief context, the `RolloutManager` generates K action sequences (default K=2) with slight variation prompts
2. **Multi-criteria evaluation** — The `OutcomeEvaluator` scores each rollout on 5 weighted criteria:
   - Success/failure (weight: 0.30)
   - Evidence clarity — did the action produce useful artifacts? (weight: 0.20)
   - Error specificity — how diagnostic was the error message? (weight: 0.20)
   - Ambiguity reduction — did we learn something definitive? (weight: 0.15)
   - Signal strength — how clear and actionable was the outcome? (weight: 0.15)
3. **Winner selection** — A clear winner is declared only if the margin exceeds a configurable threshold (default: 0.15). Ambiguous comparisons produce no learning — avoiding false lessons.
4. **Experience extraction** — The LLM distills the advantage into a short (≤32 words), generalizable heuristic statement with scoped tags
5. **Experience injection** — The `ExperienceInjector` scores stored experiences against the current task using keyword overlap, scope overlap, and belief context matching, then injects the top-N as "token priors" into the decision prompt

This means the LLM's behavior changes **without any weight updates**. Experiences act as advisory context that biases the model toward previously successful strategies. The system explicitly labels them as "advisory, not mandatory" to preserve LLM flexibility.

**Why this is powerful:**
- No GPU infrastructure, no training pipeline
- Experiences are available immediately after extraction
- Fully transparent — you can read, inspect, and audit every heuristic
- Composable — multiple experiences combine naturally in context
- Graceful — if the LLM disagrees with prior experience, it can override it

---

## Cognition Details

### Salience Filtering
Not all observations are equal. The `ModelUpdateEngine` applies a configurable **salience threshold** (default: 0.5). Low-salience observations — routine logs, expected outcomes — are dropped before belief formation. Only observations that exceed the threshold enter the cognition pipeline.

### Confidence Model
Mental Models have a rigorous confidence lifecycle:
- **New models start as "candidate"** status with an initial confidence score
- **Auto-promote to "active"** when confidence reaches ≥ 0.6
- **Confidence changes are bounded** — delta per update is clamped to [-0.25, +0.15], preventing wild swings
- **Full audit trail** — every update is recorded in `update_history` with timestamp, change summary, delta, and evidence IDs
- **Every belief can answer: "Why do you believe this?"** via its evidence chain

### Structured LLM Prompts
NOEMA uses 4 dedicated prompt templates (in `prompts/`), all with strict JSON-in/JSON-out contracts:

| Prompt | Purpose | Key Output |
|---|---|---|
| `model_update.md` | Create/update Mental Models from observations | Model patches, confidence deltas, graph edge instructions, contradiction detection |
| `decision.md` | Select next browser action from beliefs + experiences | Action type, rationale, typed inputs, expected outcome |
| `experience_extraction.md` | Distill rollout comparisons into heuristics | Add/modify/delete experience operations (≤32 word statements) |
| `reflection.md` | Generate run summary for reporting | What changed, why, open questions, next action |

### Browser Action Types
The Decision Engine can select from 8 typed browser actions, each with a structured input schema:

| Action | Description |
|---|---|
| `navigate_to_url` | Navigate browser to a URL (with configurable wait: load/domcontentloaded/networkidle) |
| `click_element` | Click an element by CSS selector |
| `fill_input` | Fill an input field with text (optional clear-first) |
| `submit_form` | Submit a form by selector |
| `check_element_visible` | Verify element visibility with timeout |
| `capture_screenshot` | Capture full-page or element-specific screenshot |
| `wait_for_network_idle` | Wait for network to settle before proceeding |
| `no_op` | Explicitly do nothing (with reason) |

Every action produces an `ActionOutcome` with artifacts (screenshots, console logs, network errors) that are fed back through the sensing layer as new observations — closing the cognitive loop.

---

## Data Architecture

### Persistent Entities

| Entity | Purpose | Schema |
|---|---|---|
| **Observation** | Canonical perception unit from any sensor | `{observation_id, type, summary, key_points, entities, confidence, source}` |
| **MentalModel** | Evolving belief ("thought document") | `{model_id, title, summary, confidence, procedures, failure_modes, update_history}` |
| **Experience** | Reusable learned heuristic | `{experience_id, statement, scope, confidence, source_runs}` |
| **GraphEdge** | Relationship between mental models | `{from_model, to_model, relation, weight}` |
| **Action** | Recorded decision | `{action_id, type, rationale, inputs, expected_outcome}` |
| **ActionOutcome** | Result of executing an action | `{outcome_id, action_id, success, summary, artifacts}` |
| **NoemaIdentity** | Persistent instance identity | `{id, created_at, total_runs, total_observations, total_experiences}` |
| **RunMetrics** | Per-run performance data | `{run_id, task_type, steps_taken, success, experiences_used, duration_ms}` |

### Storage Strategy

All data is stored as JSON files with:
- **In-memory caching** for fast reads
- **Write-through persistence** to disk
- **Zod schema validation** on all writes
- **Async API** ready for future database migration

The `data/` directory is the single source of truth. Delete it to reset.

---

## Service Architecture

### Run Controller (Orchestrator)

The `RunController` ties all layers together:

```typescript
async executeQARun(runId, input):
  1. initializeStorage()
  2. loadIdentity() + recordRunStart()
  3. sensorHub.ingest(taskDescription)        // Sense
  4. modelUpdateEngine.start()                // Believe
  5. for cycle in maxCycles:
     a. decisionEngine.decideAndAct(task)     // Decide + Act
     b. narrationEmitter.emit(action events)  // Narrate
     c. cycleUpdateEngine.start()             // Update beliefs
  6. experienceOptimizer.optimize(task)        // Learn
  7. recordRunMetrics(metrics)                 // Measure
  8. analyzeImprovement(metrics)               // Compare
  9. buildRunTimeline(runId)                   // Timeline
  10. generateReflection(runId, timeline)      // Reflect
  11. generateQAReport(...)                    // Report
```

### Narration System

The `NarrationEmitter` is an event bus that:
- Accepts typed events (narration, action_started, action_completed, etc.)
- Stores ordered history with sequence numbers
- Broadcasts to SSE-connected clients per run
- Supports replay via `getEventsSince(seq)`

The `NarrationFormatter` converts internal events to first-person language:
- "I'm navigating to https://example.com to observe the page."
- "I formed a new belief: 'Login form validation' (confidence: 0.72)."
- "I learned something actionable: 'Submit buttons should be waited for before clicking.'"

### Improvement Analyzer

Compares the current run against the **average of all previous runs of the same task type**:
- **Fewer steps** = more efficient path to the goal
- **Fewer failures** = more reliable action selection
- **Shorter duration** = faster execution
- **More experiences applied** = actively leveraging accumulated learning
- **Success where previously failed** = definitive improvement

Uses a 10% significance threshold — changes smaller than 10% are reported as "same" to avoid noise. Generates human-readable conclusions like "NOEMA used fewer steps to complete (3 vs avg 5.0)".

---

## Frontend Architecture

### React Cockpit

Single-page React application with:
- **No routing** — everything on one screen (cockpit metaphor)
- **SSE streaming** — real-time event feed via EventSource
- **CSS-in-JS** — all styles inline for zero-config
- **Dark theme** — professional monitoring dashboard aesthetic

### Component Flow

```
App.tsx
├── TaskInput       → POST /qa/run → receives run_id
├── NarrationStream → EventSource(/run/:id/stream) → live events
├── BrowserFeed     → extracts action pairs from events
├── EvidencePanel   → filters evidence/belief/experience events
├── ReportViewer    → GET /run/:id/report → structured display
└── LifetimePanel   → GET /identity + /metrics + /improvement
```

### Vite Proxy

The frontend uses Vite's dev server proxy to avoid CORS:
```
http://localhost:3000/api/* → http://localhost:8200/*
```

---

## Knowledge Graph & Memory Systems

NOEMA has **two separate memory systems** — one built entirely by us, one external.

### 1. NOEMA Belief Graph (Core — Built by Us)

This is NOEMA's own graph of relationships between Mental Models. It is **fully implemented** and central to how cognition works.

**How Mental Models are created:**
1. The `ModelUpdateEngine` subscribes to the `ObservationBus`
2. When an observation arrives, it retrieves evidence + selects candidate models
3. It fetches **existing graph edges** for those candidates from the `GraphRepository`
4. It feeds the observation, candidates, evidence, **and graph edges** into the Gemini 3 prompt
5. Gemini 3 returns create/update instructions for models + graph edge instructions
6. The `ModelPersister` persists new models, updates existing ones, and **creates/strengthens graph edges**

**What the belief graph stores** (`data/graph_edges.json`):
- **Edge types:** `depends_on`, `explains`, `extends`, `contradicts`
- **Weights:** Strengthened when supporting evidence arrives, weakened on contradiction
- **Evidence links:** Every edge tracks which observations created or reinforced it

**Graph operations implemented** (`GraphRepository`):
- `findByModel()` — all edges involving a model
- `findBetween()` — edge between two specific models
- `findContradictions()` — all contradicting beliefs for a model
- `findDependencies()` / `findDependents()` — dependency chains
- `strengthen()` / `weaken()` — evidence-driven weight adjustment
- Full CRUD with Zod schema validation and JSON persistence

The graph is fed into the LLM prompt at decision time, so Gemini 3 knows which beliefs relate, support, or contradict each other. This makes NOEMA's reasoning structurally aware — not just a flat list of beliefs.

### 2. Cognee (Semantic Memory — Optional, External)

Cognee (`apps/cognee_service/`) is a separate Python microservice that provides additional evidence retrieval. Internally, Cognee bundles its own backends (LanceDB for vectors, Kuzu for graph) — but these are **Cognee's dependencies**, not something NOEMA implements.

NOEMA's integration with Cognee is three HTTP calls:
- `POST /ingest` — sends evidence text to Cognee for indexing
- `POST /cognify` — triggers Cognee's internal embedding + graph build
- `POST /search` — retrieves relevant evidence

**Key points:**
- Cognee is **optional** — NOEMA functions fully without it using its own persistent storage and belief graph
- Cognee requires an **OpenAI API key** for embeddings (separate from Gemini 3)
- The Cognee service must be running separately (`uvicorn main:app --port 8100`)
- NOEMA does not control Cognee's internal graph — it's auto-extracted and opaque

---

## Design Decisions

### Why JSON files instead of a database?
- Zero infrastructure for hackathon
- Human-readable state for debugging and demo
- Zod validation provides schema safety
- Async API allows future migration to SQLite/Postgres

### Why SSE instead of WebSocket?
- Simpler — no bidirectional protocol needed
- Built-in browser support via EventSource
- Automatic reconnection
- Works through HTTP proxies

### Why training-free GRPO instead of fine-tuning or RL?
- No GPU infrastructure, no training pipeline, no reward model
- Experiences are available immediately after extraction (zero latency)
- Transparent — every learned heuristic is human-readable and auditable
- Composable — multiple experiences combine naturally in the context window
- Safe — LLM can override any prior experience if the current context demands it
- The GRPO insight (compare groups, select winner) applies without gradient updates

### Why first-person narration?
- Makes NOEMA's reasoning visible and inspectable
- Demonstrates that actions stem from beliefs and evidence
- Judges can verify the system isn't a black box
- No emotions or consciousness claims — factual description only

---

## File Structure

```
apps/
├── api/
│   └── src/
│       ├── api/
│       │   ├── server.ts           # HTTP server + SSE + routing
│       │   └── run_controller.ts   # Full QA run orchestration
│       ├── schemas/
│       │   └── index.ts            # All Zod schemas
│       ├── storage/
│       │   ├── base.ts             # BaseRepository (JSON persistence)
│       │   └── *.ts                # Entity-specific repositories
│       └── services/
│           ├── sensing/            # Perceptual IO
│           ├── cognition/          # Belief formation
│           ├── decision/           # Action selection + browser execution
│           ├── experience/         # Training-free GRPO learning
│           ├── identity/           # Persistent identity + lifetime
│           ├── narration/          # Live self-narration
│           └── reflection/         # Timeline + improvement analysis
├── web/
│   └── src/
│       ├── api/noemaClient.ts      # API client + SSE subscription
│       ├── App.tsx                 # Cockpit layout
│       └── components/             # 6 cockpit panels
├── cognee_service/                 # Python Cognee integration
data/                               # Persistent state (JSON files)
docs/                               # Documentation
prompts/                            # LLM prompt templates
```
