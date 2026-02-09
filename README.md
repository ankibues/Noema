# NOEMA

**A persistent digital cognitive system that accumulates experience and improves behavior over time — without retraining models.**

NOEMA is a cognitive architecture on top of Gemini 3 that gives AI agents persistent memory, evolving beliefs, and training-free GRPO-based learning. 

## Core Loop

```
Sense → Believe → Plan → Execute (Decide→Act→See→Observe) → Learn → Reflect → Improve
```

1. **Sense** — Ingest multimodal inputs (text, screenshots, logs) → canonical Observations
2. **Believe** — Form and update Mental Models with confidence tracking and evidence links
3. **Plan** — Generate a structured test plan from goals, beliefs, and past experiences — each step has a title, priority, expected outcome, and failure indicator
4. **Execute** — For each plan step:
   - **Decide** — Select action based on beliefs + experiences + visual context + current plan step
   - **Act** — Execute in a real browser via Playwright (navigate, click, fill, screenshot)
   - **See** — Gemini Vision (`gemini-3-pro-image-preview`) analyzes screenshots → visual understanding
   - **Observe** — Action outcomes + visual analysis feed back as new evidence
   - **Believe** — Update beliefs from step data (later steps benefit from earlier discoveries)
5. **Learn** — Compare multiple rollouts via Training-Free GRPO, extract reusable heuristics
6. **Reflect** — Build timeline, evaluate plan step outcomes, generate QA report
7. **Improve** — Measurable improvement over time via experience accumulation

> For this hackathon, the demo focuses on Software QA. Action adapters can be added for any digital task.

## Quick Start

```bash
# Install
cd apps/api && npm install && npx playwright install chromium
cd ../web && npm install

# Build
cd ../api && npm run build

# Run API server
npm run server    # → http://localhost:8200

# Run frontend (separate terminal)
cd ../web && npm run dev    # → http://localhost:3000
```

Open **http://localhost:3000** to access the NOEMA Cockpit.

## The Cockpit

The React cockpit provides a live observational interface:

| Panel | Shows |
|---|---|
| **Task Input** | Submit QA goal + target URL |
| **Narration** | Live first-person explanation of NOEMA's reasoning — including plan generation and step-by-step progress |
| **Browser Activity** | Each action with success/fail badges and timing |
| **Evidence & Beliefs** | Captured evidence, formed beliefs, learned experiences |
| **QA Report** | Test Plan tab (step-by-step pass/fail), Actions tab, Reflection tab, Details tab |
| **Lifetime** | Persistent identity — age, total runs, accumulated knowledge |

## What Makes NOEMA Different

| | Typical Agent | NOEMA |
|---|---|---|
| **Memory** | Per-session | Persists indefinitely |
| **Planning** | None or single-shot | Structured test plan before execution, informed by beliefs + past experiences |
| **Learning** | Requires fine-tuning | Training-free GRPO (context injection) |
| **Improvement** | None | Measurable, automatic |
| **LLM Efficiency** | Same cost every run | Persistent memory reduces LLM calls over time |
| **Vision** | DOM inspection | Gemini Vision screenshot analysis + DOM extraction |
| **Transparency** | Black box | Live first-person narration of plan, actions, beliefs, and learning |
| **Identity** | None | Persistent (age, runs, knowledge) |
| **Beliefs** | Implicit | Explicit Mental Models with confidence |

### This Is NOT Chain-of-Thought

NOEMA's narration looks like an LLM "thinking out loud" — but it's architecturally different:

| | Chain-of-Thought | NOEMA |
|---|---|---|
| **What it is** | Prompting trick ("think step by step") | Persistent cognitive architecture |
| **State** | Tokens in a single inference call | Real stored objects (beliefs, experiences, graph edges) |
| **Persistence** | Gone when the call ends | Survives restarts, accumulates across runs |
| **Grounding** | LLM generates plausible-sounding steps | Narration reports on actual system state changes |
| **Learning** | None — next call starts fresh | Experiences extracted, stored, injected into future runs |
| **Verifiability** | No way to check if "reasoning" was followed | Every narrated belief, action, and experience exists as inspectable data |

When NOEMA says "I formed a belief about form validation (confidence: 0.72)" — that belief is a real `MentalModel` object stored on disk with an evidence chain. When CoT says "Let me think about form validation..." — those are just tokens.

## Built With

- **Gemini 3** — Two-model architecture:
  - `gemini-3-flash-preview` — Reasoning (beliefs, decisions, experience extraction)
  - `gemini-3-pro-image-preview` — Visual understanding (screenshot analysis)
- **Cognee** — Optional semantic memory (similarity retrieval + auto-extracted graph context)
- **Playwright** — Real browser automation
- **Node.js + TypeScript** — Backend
- **React + Vite** — Frontend cockpit

## Architecture (8 Layers)

| Layer | Description |
|---|---|
| Persistent Storage | JSON repositories with Zod schema validation |
| Semantic Memory | Cognee integration (optional, external service) |
| Sensing + Vision | Multimodal perception (text, screenshots via Gemini Vision, DOM extraction, logs) |
| Cognition | Belief formation, evolution, confidence tracking, belief graph |
| Plan Generator | Structured test plan generation from goals + beliefs + experiences |
| Decision Engine | Action selection + Playwright browser execution (8 action types) |
| Experience Optimizer | Training-free GRPO — rollout comparison + heuristic extraction |
| Human Interface | React cockpit, live narration, reports, metrics |

## API

| Endpoint | Method | Description |
|---|---|---|
| `/qa/run` | POST | Start a QA task |
| `/run/:id/stream` | GET | SSE live narration |
| `/run/:id/report` | GET | QA report |
| `/identity` | GET | NOEMA lifetime metrics |
| `/metrics` | GET | Run performance data |
| `/improvement` | GET | Improvement analysis |

## Documentation

- **[User Guide](docs/USER_GUIDE.md)** — Setup, configuration, and usage
- **[Architecture](docs/ARCHITECTURE.md)** — Technical deep dive
- **[Hackathon Submission](docs/HACKATHON.md)** — Pitch, capabilities, and demo walkthrough
- **[Design Spec](docs/DESIGN_SPEC.md)** — Original design specification
- **[Data Schemas](docs/DATA_SCHEMAS.md)** — All data structures

## Persistent Memory → Reduced LLM Usage

A key architectural property: **repeated runs cost less.** NOEMA's persistent memory directly reduces the number of Gemini API calls needed:

- **Plan Cache** — After testing a URL, the test plan is cached. On the next run against the same target, the plan is reused (saves 1 LLM call).
- **Action Sequence Store** — Successful action sequences are recorded per step type + URL. On future runs, known sequences are replayed directly (saves N LLM calls per step).
- **Experience Injection** — Learned heuristics make each LLM call more effective, reducing retries and failed actions.
- **Belief Context** — Prior beliefs give the LLM immediate context, reducing exploratory actions.

Every run tracks `llm_calls_made` vs `llm_calls_saved`, displayed in the QA report and narration.

## Design Philosophy

> Memory remembers. Beliefs explain. Plans structure. Experience improves. Persistence makes it cumulative — and more efficient.

NOEMA doesn't need gradient descent to improve. It needs:
1. A way to **remember** what happened (persistent storage)
2. A way to **understand** what happened (belief formation)
3. A way to **plan** what to do (structured test plan generation)
4. A way to **learn** what worked (experience extraction)
5. A way to **apply** what was learned (context injection)
6. A way to **reuse** what was learned (plan cache + action sequence store → reduced LLM calls)