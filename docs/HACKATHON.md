# NOEMA — Google Hackathon Submission

## One-Line Pitch

**NOEMA is a persistent digital cognitive system that accumulates experience and improves behavior over time — without retraining models.**

---

## The Problem

Current AI agents are **amnesiac**. Every invocation starts from scratch. They can't:
- Remember what worked last time
- Learn from their own failures
- Build on accumulated experience
- Demonstrate measurable improvement over time

Even sophisticated agents with tool use and chain-of-thought lack **persistence** — the ability to carry knowledge forward across sessions.

---

## What NOEMA Does

NOEMA is a **cognitive architecture** that gives AI agents:

### 1. Persistent Memory
Every observation, belief, and action is stored across restarts. NOEMA's identity — its age, total runs, accumulated knowledge — survives indefinitely.

### 2. Belief Formation
Raw inputs (text, screenshots, logs) are transformed into structured **Mental Models** — evolving belief documents with confidence scores, procedures, failure modes, and evidence links.

### 3. Plan-Driven Execution (Think Before You Act)
Before taking any action, NOEMA generates a **structured test plan** using Gemini 3:
- Analyzes the task goal, target URL, critical scenarios, existing beliefs, and past experiences
- Produces an ordered list of test steps, each with a title, description, priority (`critical`/`important`/`nice_to_have`), expected outcome, and failure indicator
- Executes the plan step by step, with belief updates after each step — later steps benefit from earlier discoveries
- Each step records its result (`pass`/`fail`/`skipped`) and the actions taken
- On subsequent runs, past experiences inform the plan, leading to better-structured and more efficient test strategies

This transforms NOEMA from reactive ("try something → observe") to strategic ("understand → plan → execute → learn per step").

### 4. Training-Free GRPO (Group Relative Policy Optimization)
NOEMA adapts **GRPO** — a reinforcement learning technique — to work **without gradient updates**:
- Run K different approaches to the same task (same belief context, varied strategies)
- Score each approach on **5 weighted criteria**: success, evidence clarity, error specificity, ambiguity reduction, signal strength
- Only learn when there's a **clear winner** (margin ≥ 0.15) — ambiguous results produce no learning
- Extract a short (≤32 words), generalizable heuristic via Gemini 3
- **Inject** the best heuristics into future decision prompts as "token priors" using keyword, scope, and belief-context matching

**Result:** The LLM's behavior improves without changing a single weight. Experiences are transparent, auditable, and override-safe.

### 5. Measurable Improvement
Every run records metrics (steps, failures, duration, experiences used). An `ImprovementAnalyzer` compares runs over time to detect:
- Fewer steps to complete similar tasks
- Fewer failures
- Faster execution
- More learned experiences being applied

### 6. Live Narration (Not Chain-of-Thought)
NOEMA explains its own cognition in real-time:
> "I'm navigating to the login page to observe the form structure."
> "I formed a new belief: 'Form validation appears client-side' (confidence: 0.72)."
> "I learned something actionable: 'Wait for page load before interacting with forms.'"

**This is fundamentally different from Chain-of-Thought prompting.** CoT is a prompting technique where an LLM generates intermediate reasoning tokens within a single inference call — those tokens are ephemeral, unverifiable, and gone when the call ends. NOEMA's narration reports on **real architectural state**: every narrated belief is a `MentalModel` stored on disk, every narrated action is a persisted `Action` with recorded `ActionOutcome`, and every narrated experience is a heuristic that will influence future runs. The narration is an observational window into a persistent cognitive system — not an LLM "thinking out loud."

---

## Technical Architecture

### Built With
- **Gemini 3** — Two-model architecture:
  - `gemini-3-flash-preview` — LLM backbone for reasoning, belief formation, decision making, experience extraction
  - `gemini-3-pro-image-preview` — Visual understanding of screenshots (page layout, UI elements, errors, CSS selectors)
- **Cognee** (optional semantic memory — similarity retrieval + auto-extracted graph context)
- **NOEMA Belief Graph** (our own implementation — typed model-to-model edges with `depends_on`, `explains`, `extends`, `contradicts` relations, evidence-driven weight adjustment)
- **Playwright** (browser automation — 8 typed action types with full artifact capture)
- **Node.js + TypeScript** (backend runtime with Zod schema validation)
- **React + Vite** (frontend cockpit with SSE streaming)


### Data Flow

```
Human Intent → Sensing → Beliefs → PLAN → Execute Step-by-Step
                  ↑                          │
                  │                   ┌──────┴──────────────────┐
                  │                   │ Decide → Act → See →    │
                  │                   │ Observe → Believe       │
                  │                   │ Record step pass/fail   │
                  │                   └──────┬──────────────────┘
                  │                          │
                  └─── Experience Library ◄──┘ → Reflect + QA Report
                       (training-free)
```

---

## Demo Walkthrough

### What You'll See

1. **Start** — Human submits a QA task via the React cockpit
2. **Sense** — NOEMA ingests the task description, creates initial observations
3. **Believe** — Mental models form from the observations
4. **Plan** — NOEMA generates a structured test plan (visible in narration panel)
5. **Execute** — For each plan step:
   - NOEMA selects and executes browser actions (navigate, click, fill, capture)
   - Gemini Vision analyzes screenshots for visual understanding
   - DOM snapshot extracted for structural context
   - Beliefs update from step results
   - Step evaluated as pass/fail/skipped
6. **Learn** — Experience optimizer runs rollouts, extracts heuristics
7. **Reflect** — Structured reflection and QA report generated (with plan tab)
8. **Improve** — Second run benefits from learned experiences *and* better planning

### Key Moments to Watch

- **Narration panel** — NOEMA explains its plan, then narrates each step as it executes
- **Plan steps** — Watch NOEMA announce each plan step, execute actions, and report step results
- **Browser activity** — Real actions with success/fail indicators per plan step
- **Evidence panel** — Screenshots and beliefs forming in real-time
- **Lifetime panel** — Accumulated runs, experiences, and improvement trends
- **Report (Plan tab)** — Each planned step with expected vs actual outcome, priority, and pass/fail

### The Improvement Loop

Run 1: NOEMA encounters a task for the first time. It explores, may fail, but learns.
Run 2: NOEMA recalls what it learned. It takes fewer steps, avoids prior failures. The test plan is reused from cache.
Run 3: Further refinement. Action sequences from successful steps are replayed directly — no LLM needed. The improvement analyzer shows measurable gains.

### Persistent Memory → Reduced LLM Costs

A key differentiator: **NOEMA gets cheaper to run over time.** Every run tracks `llm_calls_made` vs `llm_calls_saved`:

- **Plan Cache** — Tested this URL before? Reuse the plan (saves 1 LLM call per run)
- **Action Sequence Store** — Successful browser actions are recorded per step type. On future runs, known sequences replay directly (saves N calls per step)
- **Experience Injection** — Learned heuristics make each LLM call more effective (fewer retries, fewer failures)
- **Belief Context** — Prior beliefs give the LLM immediate context (fewer exploratory actions)

The savings are tracked, narrated, and displayed in every QA report.

---

## What Makes NOEMA Different

| Feature | Typical Agent | NOEMA |
|---|---|---|
| Memory | Per-session only | Persists indefinitely |
| Planning | None or single-shot | Structured test plan before execution; experience-informed |
| Learning | Requires fine-tuning | Training-free GRPO (context injection) |
| Improvement | None | Measurable, automatic |
| LLM Efficiency | Same cost every run | Persistent memory reduces LLM calls over time |
| Vision | DOM inspection or none | Gemini Vision analyzes screenshots for visual understanding |
| Transparency | Black box | Live narration grounded in real state |
| Identity | None | Persistent (age, runs, knowledge) |
| Beliefs | Implicit in prompt | Explicit Mental Models with confidence |
| Knowledge | Static | Accumulated experiences + evolving beliefs + belief graph |

### Why This Isn't Just Chain-of-Thought

Judges may notice NOEMA narrating its reasoning and ask: *"Isn't this just CoT?"* The answer is no — and the difference is architectural:

- **CoT** = a prompting technique. The LLM generates "Let me think step by step..." tokens within one inference call. Those tokens are **ephemeral** — gone when the call ends, never stored, never used again.
- **NOEMA** = a persistent cognitive architecture. When NOEMA says "I formed a belief," that belief is a real `MentalModel` object stored on disk with a confidence score, evidence links, and an update history. When it says "I learned something," that's a real `Experience` that will be injected into the next run's decision prompts.

**The key test:** After an LLM with CoT finishes, you can't ask "What did you learn?" — because it learned nothing. After NOEMA finishes a run, you can inspect every belief it formed, every experience it extracted, every graph edge it created, and measure how those change the next run. That's the difference between a prompting trick and a cognitive architecture.

---

## Gemini 3 Integration

NOEMA uses **two Gemini 3 models** as its reasoning and perception backbone:

### Two-Model Architecture

| Model | Default | Purpose |
|---|---|---|
| **Reasoning** (`GEMINI_MODEL`) | `gemini-3-flash-preview` | Text reasoning: belief formation, decision making, experience extraction, reflection |
| **Vision** (`GEMINI_VISION_MODEL`) | `gemini-3-pro-image-preview` | Screenshot analysis: visual understanding of page layout, UI elements, text, errors, CSS selectors |

### Reasoning Pipelines (5 dedicated prompt templates)

| Pipeline | Prompt | What Gemini 3 Does |
|---|---|---|
| **Planning** | `planning.md` | Generates a structured test plan from task goal, URL, critical scenarios, beliefs, and experiences. Produces ordered steps with priority, expected outcomes, and failure indicators |
| **Belief Formation** | `model_update.md` | Creates/updates Mental Models, assigns confidence deltas (bounded [-0.25, +0.15]), generates graph edge instructions, detects contradictions |
| **Decision Making** | `decision.md` | Selects from 8 typed browser actions given beliefs + experiences + **visual context** + current plan step context; explains rationale |
| **Experience Extraction** | `experience_extraction.md` | Compares rollout winners/losers, distills ≤32-word generalizable heuristics, manages experience lifecycle (add/modify/delete) |
| **Reflection** | `reflection.md` | Generates causal summaries: what changed, why, open questions, next action |

### Vision Pipeline (Visual Feedback Loop)

After every browser action:
1. Playwright captures a screenshot
2. `VisionClient` sends it to `gemini-3-pro-image-preview` with a QA-focused prompt
3. The vision model describes the page: elements, labels, selectors, errors, state
4. This description becomes `visual_context` in the next decision prompt
5. The reasoning model uses this to select more precise, targeted actions

**Result:** NOEMA doesn't just click blindly — it **sees** the page, understands what's visible, and makes informed decisions about what to interact with next. This visual feedback loop (`Act → See → Decide → Act → See → ...`) gives NOEMA genuine visual understanding, not just DOM inspection.

All calls use the Gemini REST API directly (no SDK dependency). Both models are configurable via environment variables. Mock fallbacks are available for offline demos.

**Key architectural choice:** Gemini 3 doesn't maintain state — NOEMA does. The LLMs are stateless reasoning and perception tools; persistence, learning, identity, and improvement are all handled by NOEMA's architecture.

---

## Memory & Knowledge Systems

NOEMA has **two complementary memory systems**:

### NOEMA Belief Graph (Core — Built by Us)
An explicit, inspectable graph of relationships between Mental Models, fully implemented in TypeScript:
- **4 relation types:** `depends_on`, `explains`, `extends`, `contradicts`
- **Evidence-driven weights** — edges strengthen when supporting evidence arrives, weaken on contradiction
- **Full graph operations:** `findByModel()`, `findContradictions()`, `findDependencies()`, `strengthen()`, `weaken()`
- **Fed into Gemini 3 prompts** — so the LLM sees belief structure, not just a flat list
- **Persisted as JSON** with Zod schema validation

### Cognee (Optional — External Service)
A separate Python microservice for semantic retrieval. Internally bundles LanceDB (vectors) and Kuzu (auto-graph), but NOEMA interacts with it purely over HTTP:
- `POST /ingest` → `POST /cognify` → `POST /search`
- Provides similarity-based evidence recall + auto-extracted graph context
- **Optional** — NOEMA functions fully without it using its own storage and belief graph

---

## Metrics & Measurement

### Per-Run Metrics
```json
{
  "steps_taken": 3,
  "failure_count": 1,
  "duration_ms": 4500,
  "experiences_used": 2,
  "experiences_added": 1,
  "models_created": 1,
  "observations_created": 8
}
```

### Improvement Signals
```json
{
  "metric": "steps_taken",
  "previous_value": 5,
  "current_value": 3,
  "direction": "improved",
  "description": "NOEMA used fewer steps to complete (3 vs avg 5.0)"
}
```

### Identity Statement
> "This NOEMA instance has been active for 2 minutes, completed 3 runs, learned 4 reusable experiences, formed 2 mental models."

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `POST /qa/run` | Start a QA task |
| `GET /run/:id/stream` | SSE live narration stream |
| `GET /run/:id/report` | Generated QA report |
| `GET /identity` | NOEMA identity & lifetime |
| `GET /metrics` | Performance metrics per run |
| `GET /improvement` | Improvement analysis |

---

## Design Philosophy

> Memory remembers. Beliefs explain. Experience improves. Persistence makes it cumulative.

NOEMA is not trying to be "AGI." It's an engineered system that gives LLMs something they fundamentally lack: **the ability to learn from their own history and get better over time, without any parameter changes.**

The key insight is that you don't need gradient descent to improve. You need:
1. A way to **remember** what happened (persistent storage)
2. A way to **understand** what happened (belief formation)
3. A way to **plan** what to do (structured test plan generation)
4. A way to **learn** what worked (experience extraction at step and plan level)
5. A way to **apply** what was learned (context injection into plans and decisions)

NOEMA provides all five.

---

## Running Locally

```bash
# Install
cd apps/api && npm install
cd ../web && npm install

# Build API
cd ../api && npm run build

# Start API server
npm run server

# Start frontend (separate terminal)
cd ../web && npm run dev

# Open http://localhost:3000
```

For detailed setup, see [USER_GUIDE.md](./USER_GUIDE.md).
For architecture details, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Future Vision

NOEMA's cognitive architecture is **domain-agnostic by design**. The core loop — Sense → Believe → Plan → Execute → Learn → Reflect — makes no assumptions about the task being performed.

For this hackathon, we demonstrate **Software QA** because it's a high-signal domain where sensing, belief formation, and measurable improvement are clearly visible. But the same architecture applies to any digital task:

| Domain | Action Adapters Needed | Sensor Adapters Needed |
|---|---|---|
| **Code Review** | File read, diff analysis, comment posting | Git diffs, PR metadata, CI logs |
| **Security Auditing** | Port scanning, header inspection, payload testing | Network responses, vulnerability reports |
| **Data Pipeline QA** | Query execution, schema validation, data sampling | Query results, schema diffs, data quality metrics |
| **Compliance Checking** | Document scanning, policy matching, flag generation | Legal text, regulatory docs, audit logs |
| **Customer Support** | Ticket classification, response drafting, escalation | Support tickets, customer history, product docs |

The cognitive core — persistent memory, evolving beliefs, training-free GRPO, measurable improvement — remains identical. Only the action set and sensor adapters change.

**The long-term vision:** A single NOEMA instance that accumulates expertise across multiple domains simultaneously, with experiences from one domain informing decisions in another.

---

## Known Limitations (Honest Assessment)

- **Cognee's graph is opaque** — auto-extracted, not hand-structured. NOEMA reads what Cognee returns but doesn't control the graph schema.
- **NOEMA's belief graph is lightweight** — JSON-persisted model-to-model edges with typed relations, weight management, and dependency/contradiction queries — but no SPARQL/Cypher or complex graph inference.
- **Browser actions fail in sandboxed environments** — Playwright needs real network access to navigate websites.
- **Vision analysis adds latency** — each screenshot is sent to `gemini-3-pro-image-preview`, adding ~1-3s per action cycle. This is a tradeoff for genuine visual understanding.
- **Experience extraction depends on LLM quality** — Gemini 3 produces strong heuristics.
- **Single-instance only** — no multi-agent coordination or distributed runs.
