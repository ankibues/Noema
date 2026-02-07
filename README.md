# NOEMA

**A persistent digital cognitive system that accumulates experience and improves behavior over time — without retraining models.**

NOEMA is a cognitive architecture on top of Gemini 3 that gives AI agents persistent memory, evolving beliefs, and training-free GRPO-based learning. 

## Core Loop

```
Sense → Believe → Decide → Act → Observe → Learn → Reflect → Improve
```

1. **Sense** — Ingest multimodal inputs (text, screenshots, logs) → canonical Observations
2. **Believe** — Form and update Mental Models with confidence tracking and evidence links
3. **Decide** — Select actions based on beliefs + accumulated experiences + recent outcomes
4. **Act** — Execute in a real browser via Playwright (navigate, click, fill, screenshot) -- For Hackathon, Demo Focus on Software QA. Actions can be added to other perform any digital tasks. 
5. **Observe** — Action outcomes feed back through sensing as new evidence
6. **Learn** — Compare multiple rollouts via Training-Free GRPO, extract reusable heuristics
7. **Reflect** — Build timeline, generate structured reflection and report
8. **Improve** — Measurable improvement over time via experience accumulation

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
| **Narration** | Live first-person explanation of NOEMA's reasoning |
| **Browser Activity** | Each action with success/fail badges and timing |
| **Evidence & Beliefs** | Captured evidence, formed beliefs, learned experiences |
| **QA Report** | Structured verdict with reflection and improvement analysis |
| **Lifetime** | Persistent identity — age, total runs, accumulated knowledge |

## What Makes NOEMA Different

| | Typical Agent | NOEMA |
|---|---|---|
| **Memory** | Per-session | Persists indefinitely |
| **Learning** | Requires fine-tuning | Training-free GRPO (context injection) |
| **Improvement** | None | Measurable, automatic |
| **Transparency** | Black box | Live first-person narration |
| **Identity** | None | Persistent (age, runs, knowledge) |
| **Beliefs** | Implicit | Explicit Mental Models with confidence |

## Built With

- **Gemini 3** — LLM backbone for reasoning, belief formation, decision making, experience extraction
- **Cognee** — Optional semantic memory (similarity retrieval + auto-extracted graph context)
- **Playwright** — Real browser automation
- **Node.js + TypeScript** — Backend
- **React + Vite** — Frontend cockpit

## Architecture (7 Layers)

| Layer | Description |
|---|---|
| Persistent Storage | JSON repositories with Zod schema validation |
| Semantic Memory | Cognee integration (optional, external service) |
| Sensing | Multimodal perception pipeline (text, screenshots, logs) |
| Cognition | Belief formation, evolution, confidence tracking, belief graph |
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

## Design Philosophy

> Memory remembers. Beliefs explain. Experience improves. Persistence makes it cumulative.

NOEMA doesn't need gradient descent to improve. It needs:
1. A way to **remember** what happened (persistent storage)
2. A way to **understand** what happened (belief formation)
3. A way to **learn** what worked (experience extraction)
4. A way to **apply** what was learned (context injection)
