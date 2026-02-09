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

NOEMA is organized into 8 functional layers:

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
│  Plan Generator (Think Before You Act)                  │
│  PlanGenerator → TestPlan → step-by-step execution      │
│  LLM-driven or mock; informed by beliefs + experiences  │
├─────────────────────────────────────────────────────────┤
│  Cognition (Belief Formation + Evolution)               │
│ModelUpdateEngine → CandidateSelector → EvidenceRetriever│
│  LLM-driven belief revision with confidence tracking    │
│  Belief Graph: model-to-model edges with typed relations│
├─────────────────────────────────────────────────────────┤
│  Sensing (Perceptual IO) + Gemini Vision                │
│  SensorHub → Adapters (Text/Log/Screenshot+Vision)      │
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

NOEMA's cognitive architecture is **domain-agnostic**. The core loop — Sense → Believe → Plan → Execute → Learn → Reflect — makes no assumptions about what kind of task is being performed.

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
│   3. PLAN     │  PlanGenerator creates a structured test plan
└───────┬───────┘  informed by beliefs, experiences, and task goals
        │          Each step has title, description, priority,
        │          expected outcome, and failure indicator
        ▼
┌───────────────┐  ┌─────────────────────────────────────────┐
│  4. EXECUTE   │  │  For each plan step:                    │
│   (per step)  │──│   a. DECIDE — action for this step      │
└───────┬───────┘  │   b. ACT — Playwright executes action   │
        │          │   c. SEE — Vision analyzes screenshot    │
        │          │   d. OBSERVE — outcomes → observations   │
        │          │   e. BELIEVE — update beliefs from data  │
        │          │   f. RECORD — step pass/fail/skipped     │
        │          └─────────────────────────────────────────┘
        ▼
┌───────────────┐
│  5. LEARN     │  ExperienceOptimizer runs K rollouts,
└───────┬───────┘  compares outcomes, extracts reusable heuristics
        │
        ▼
┌───────────────┐
│  6. REFLECT   │  Build timeline, evaluate plan outcomes,
└───────┬───────┘  analyze improvement, generate QA report
        │
        ▼
    Next Run Benefits
```

### What Happens When You Submit a Task? (First Run Walkthrough)

To make the cognitive loop concrete, here's exactly what happens when a user submits their **first QA task** — no prior beliefs, no experiences, no history.

**Example:** `{ goal: "Test the login flow", url: "https://myapp.com", critical_scenarios: ["Login with valid credentials", "Login with invalid credentials"] }`

#### Step 1: SENSE — Read the task (no browser yet)

NOEMA converts your task description into a text string and sends it to the `SensorHub`. The SensorHub:
1. **Chunks** the text (splits into sentence-sized pieces via `TextAdapter`)
2. **Scores salience** for each chunk (keyword density, length, structural markers)
3. **Normalizes** each chunk into an `Observation` object (with `observation_id`, `summary`, `key_points`, `entities`, `confidence`)
4. **Persists** the Observation to JSON storage
5. **Publishes** it to the `ObservationBus` so downstream systems can react

At this point, NOEMA hasn't opened a browser. It's reading your intent and converting it into a structured, storable format that the rest of the system can process.

#### Step 2: BELIEVE — Form beliefs from the observation (not from prior beliefs)

The `ModelUpdateEngine` subscribes to the `ObservationBus`. When the seed observation arrives:
1. It tries to **retrieve evidence** from Cognee → first run: nothing found
2. It tries to **select candidate models** from storage → first run: none exist
3. It **fetches graph edges** for those candidates → first run: none
4. It calls **Gemini 3** with the `model_update.md` prompt, which includes the observation, empty candidates, empty evidence, and empty graph edges
5. Gemini sees there are **no existing models** and **creates new ones** from the observation, e.g.:
   - `"Login Form Functionality"` (confidence: 0.50, status: candidate)
   - `"Form Authentication Flow"` (confidence: 0.45, status: candidate)

On the first run, beliefs are born from the **observation of the task itself**. The LLM infers what NOEMA should "believe about" this domain. No prior beliefs are needed — the task observation is the seed.

On later runs, existing beliefs are retrieved as candidates, and the LLM updates them instead of creating from scratch. Confidence values shift based on confirming or contradicting evidence.

#### Step 3: PLAN — Generated from user intent + newly formed beliefs

The `PlanGenerator` receives:
- **Goal, URL, critical scenarios** — from the user's input
- **Beliefs** — the mental models just created in Step 2
- **Experiences** — empty on first run (populated on later runs)

It sends everything to Gemini with the `planning.md` prompt, which instructs the LLM to generate an ordered list of test steps. On a first run, the LLM relies purely on the goal and scenarios. On later runs, it also uses past experiences (e.g., "Submit buttons should be waited for before clicking") to produce better-structured plans.

Example output:
```
Plan: "QA Test: Login Flow" (5 steps)
  Step 1: Navigate to target [critical]
  Step 2: Capture initial page state [critical]
  Step 3: Test valid login [critical]
  Step 4: Test invalid login [critical]
  Step 5: Final verification [important]
```

#### Step 4: EXECUTE — The plan drives browser actions

For each plan step, the run controller builds a **step-specific task** that includes the original goal plus the current step's title, description, expected outcome, and suggested action. The `DecisionEngine` then:
1. Gathers current beliefs + experiences + recent action outcomes + visual context + DOM snapshot
2. Sends everything to Gemini via `decision.md` → Gemini picks ONE browser action (e.g., `navigate_to_url` with `url: "https://myapp.com"`)
3. Playwright executes it
4. Screenshot is captured → Gemini Vision analyzes it (e.g., "I see a login form with username/password fields")
5. DOM is extracted → interactive elements, forms, CSS selectors
6. All feedback (vision analysis, DOM snapshot, console logs, network errors) flows back through the `SensorHub` as **new observations**
7. **Beliefs are updated** from those observations (e.g., "Login Form Functionality" confidence increases from 0.50 → 0.65 because NOEMA actually saw the form)

Each step gets up to `max_cycles_per_step` (default 3) actions. If the total action count reaches `max_total_actions` (default 15), remaining steps are marked as `skipped`.

#### Step 5: LEARN — Compare and distill

The `ExperienceOptimizer` runs 2 rollouts of the same task (with slight variations), compares outcomes on 5 criteria, and extracts reusable heuristics. On the first run, there are no prior experiences to build on, so any extracted heuristics are the **first learned experiences**.

#### Step 6: REFLECT & REPORT — The orchestrated conclusion

NOEMA always concludes a run by:
1. Recording metrics (steps, failures, duration, experiences used/added)
2. Comparing against previous runs of the same task type (on first run: nothing to compare)
3. Building a timeline of all events
4. Generating a reflection (what was observed, believed, tried, learned)
5. **Generating the QA Report** — which includes the test plan (with per-step pass/fail), action details, reflection, and improvement analysis

NOEMA "knows" the end goal is a QA report because the orchestrator (`run_controller.ts`) is architecturally designed to always produce one. It's the natural output of: plan → execute → evaluate → reflect.

### Failure Detection, Pass/Fail, and Bug Discovery

NOEMA detects failures through **5 independent signal channels**, all of which feed into the cognitive loop as observations:

#### Signal 1: Playwright Action Failures

Every browser action is wrapped in a try/catch. If Playwright throws (element not found, navigation timeout, selector invalid), the action returns `{ success: false, error: "Click failed: element not found" }`. The error message is specific — it includes the selector, the timeout, and the Playwright error text.

```
Example: Click on "#login-btn" → Playwright throws "Timeout 5000ms exceeded"
→ ActionOutcome: { status: "failure", error_message: "Click failed: Timeout 5000ms exceeded" }
```

#### Signal 2: Console Errors and JavaScript Exceptions

The `BrowserSession` listens to the browser's console in real-time:
- `page.on("console")` — captures all console messages (info, warn, error)
- `page.on("pageerror")` — captures uncaught JavaScript exceptions (e.g., `TypeError: Cannot read property 'x' of null`)

These are accumulated as artifacts and fed back through sensing as log observations. If the web app throws a JS error during a login attempt, NOEMA sees it.

#### Signal 3: Network Errors and HTTP Status Codes

The `BrowserSession` tracks:
- `page.on("requestfailed")` — failed HTTP requests (DNS failures, connection refused, CORS blocked)
- `page.on("response")` — any response with status ≥ 400 (404 Not Found, 500 Internal Server Error)

Example: After submitting a login form, if the server returns a 500 error, NOEMA captures `[HTTP_500] https://myapp.com/api/login` as a network error artifact.

#### Signal 4: DOM Error Detection

After every action, NOEMA extracts a DOM snapshot that includes error-indicating elements:
```javascript
// Searches for elements matching common error CSS classes:
'.error, .alert-danger, .alert-error, [role="alert"],
 .error-message, .form-error, .validation-error, .toast-error'
```

If the web app displays a red "Invalid credentials" error message in a `.error-message` div after login, NOEMA captures it in `errorMessages[]`.

#### Signal 5: Gemini Vision Analysis

After each action, Gemini Vision (`gemini-3-pro-image-preview`) analyzes the screenshot and describes what it sees. It can detect visual indicators of failure that aren't in the DOM: broken layouts, missing images, incorrect colors, unexpected blank areas, error modals, etc.

#### How These Signals Flow Into Pass/Fail

```
Playwright fails   ──┐
Console errors     ──┤
Network 4xx/5xx    ──┼──→  ActionOutcome  ──→  SensorHub (Observation)  ──→  Belief Update
DOM error elements ──┤                                                          │
Vision analysis    ──┘                                                          ▼
                                                                        Plan Step Result
                                                                        (pass / fail / skipped)
```

1. **Action-level:** Each action is `success` or `failure` based on whether Playwright completed without throwing
2. **Step-level:** A plan step is marked `pass` if **at least one action in that step succeeded**, and `fail` if **all actions in the step failed**
3. **Run-level:** The overall run `result` is `pass` if failures are fewer than total steps, `fail` otherwise

#### How NOEMA Knows When to Stop

NOEMA does not run indefinitely. Stopping conditions are:
1. **Plan exhaustion** — All plan steps have been attempted
2. **Per-step budget** — Each step gets at most `max_cycles_per_step` actions (default 3). If the step hasn't succeeded after 3 actions, it's marked `fail` and NOEMA moves to the next step.
3. **Total action budget** — If `max_total_actions` (default 15) is reached, all remaining steps are marked `skipped` and NOEMA proceeds to reflection
4. **`no_op` signal** — If the Decision Engine selects `no_op` (meaning it has nothing more to do for this step), the step ends immediately

#### How Bugs Are Reported

All failure signals are aggregated into the QA report:
- The **Test Plan tab** shows each step with its pass/fail status, expected vs. actual outcome, and action count
- The **Actions tab** shows individual actions with success/fail badges, error messages, and timing
- The **Reflection tab** captures what NOEMA observed going wrong and what it learned
- Console errors, network errors, and DOM errors are all captured as evidence artifacts

When NOEMA encounters a bug (e.g., login button throws a 500 error), the trace is:
1. Playwright executes `submit_form` → success (form submitted)
2. Network listener captures `[HTTP_500] /api/login`
3. DOM extraction finds `<div class="error-message">Server Error</div>`
4. Gemini Vision sees "Red error banner visible on page"
5. All four signals become observations → belief "Login form validation" confidence drops
6. Plan step is marked `fail` with actual outcome: "Failed after 2 action(s): Server returned 500"
7. In the QA report: Step 3 "Test valid login" → **FAIL** — `Actual: Server returned HTTP 500 on login submission`

NOEMA doesn't just know pass/fail — it knows *why* it failed, through multiple corroborating evidence channels.

### Why Plan Before Acting?

Without a plan, NOEMA would execute actions blindly — one at a time with no strategic direction. The planning layer addresses this:

1. **Intent understanding** — NOEMA analyzes the goal, URL, critical scenarios, existing beliefs, and past experiences before taking any action
2. **Structured execution** — Each plan step has a clear title, description, priority (`critical`, `important`, `nice_to_have`), expected outcome, and failure indicator
3. **Budget control** — The plan respects `max_cycles_per_step` (default 3) and `max_total_actions` (default 15), preventing runaway execution
4. **Step-level learning** — After each step, beliefs are updated from what was observed, so later steps benefit from earlier discoveries
5. **Step-level evaluation** — Each plan step is evaluated as `pass`, `fail`, or `skipped`, appearing in the final QA report
6. **Experience-informed planning** — On later runs, the plan incorporates past experiences, leading to better-structured test plans over time

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

### Persistent Memory → Reduced LLM Usage Over Time

A core architectural property of NOEMA is that **persistent memory directly reduces the number of LLM API calls** needed on subsequent runs. This is not a hypothetical benefit — it's a measurable, tracked metric visible in every QA report.

**There are 4 active paths where past runs reduce future LLM dependency:**

#### Path 1: Plan Cache (saves 1 LLM call per run)

After executing a test plan, NOEMA stores it in `data/plan_cache.json`, indexed by URL domain and goal keywords. On subsequent runs against the same (or similar) target:
- NOEMA checks the cache before calling the LLM planner
- If a matching plan exists (scored by domain match + goal keyword similarity + success rate), it reuses the plan directly
- The narration reports: *"I found a cached test plan from a previous run — reusing it instead of generating a new one"*
- **Result:** 1 fewer LLM call for plan generation per repeated run

#### Path 2: Action Sequence Store (saves N LLM calls per step)

After each successful plan step, NOEMA records the exact sequence of browser actions that worked in `data/action_sequences.json`, keyed by step description keywords + URL domain:
- On future runs, before calling the decision LLM for a step, NOEMA checks if it already knows the action sequence
- If a high-confidence match is found (≥ 0.7), it replays the recorded sequence directly
- Credential values are tokenized (`${username}`, `${password}`) for safe storage and detokenized on replay
- If a replayed sequence fails, confidence is reduced and NOEMA falls back to LLM-driven decisions
- **Result:** N fewer LLM calls per step (where N = number of actions in that step)

#### Path 3: Experience Injection (makes LLM calls more efficient)

Experiences from prior runs are injected into every decision LLM prompt as "token priors" (via `ExperienceInjector`). While this doesn't skip LLM calls, it makes each call more efficient:
- The LLM receives specific heuristics like "Wait for page load before interacting with forms"
- This reduces action failures, retry loops, and stuck-loop detection breaks
- Fewer failed actions → fewer total actions needed → fewer LLM calls overall

#### Path 4: Mental Models (richer context, fewer exploratory actions)

Beliefs formed in prior runs are loaded as context for the decision LLM. On first run, the LLM has no beliefs and must explore. On later runs, beliefs about the target (e.g., "this site has a standard username/password login form") give the LLM immediate context, reducing exploratory actions.

#### How This Is Tracked and Displayed

Every run records:
- `llm_calls_made` — actual LLM API calls during the run
- `llm_calls_saved` — calls that would have been made but were served from persistent memory
- `plan_reused` — whether the test plan came from cache
- `steps_from_memory` — how many plan steps used cached action sequences

These metrics are:
- **Narrated in real-time** — "📊 Persistent memory saved 5 LLM calls this run (33% of 15 total)"
- **Shown in the QA Report** — Details tab includes a "Persistent Memory → LLM Savings" section
- **Tracked in improvement analysis** — the `ImprovementAnalyzer` compares LLM savings across runs
- **Visible in run metrics** — `GET /metrics` includes all savings data

#### The Cumulative Effect

```
Run 1: 15 LLM calls (plan generation + 14 step decisions). All from scratch.
Run 2: 14 LLM calls. Plan reused from cache (saved 1). Experiences make decisions faster.
Run 3: 10 LLM calls. Plan reused. 2 steps replayed from memory (saved 5 total).
Run 4:  8 LLM calls. Plan reused. 4 steps from memory. Experiences avoid retry loops.
```

This demonstrates a key thesis: **a persistent cognitive architecture doesn't just improve task performance — it reduces computational cost over time.** The system becomes not only more capable but more efficient.

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
NOEMA uses 5 dedicated prompt templates (in `prompts/`), all with strict JSON-in/JSON-out contracts:

| Prompt | Purpose | Key Output |
|---|---|---|
| `planning.md` | Generate a structured test plan from task goals, beliefs, and experiences | Plan title, rationale, ordered steps with priority, expected outcomes, failure indicators |
| `model_update.md` | Create/update Mental Models from observations | Model patches, confidence deltas, graph edge instructions, contradiction detection |
| `decision.md` | Select next browser action from beliefs + experiences + visual context + current plan step | Action type, rationale, typed inputs, expected outcome |
| `experience_extraction.md` | Distill rollout comparisons into heuristics | Add/modify/delete experience operations (≤32 word statements) |
| `reflection.md` | Generate run summary for reporting | What changed, why, open questions, next action |

### Gemini Vision Integration
NOEMA uses **two Gemini 3 models** — one for reasoning and one for visual understanding:

| Model | Default | Purpose |
|---|---|---|
| `GEMINI_MODEL` | `gemini-3-flash-preview` | Text reasoning: belief formation, decision making, experience extraction, reflection |
| `GEMINI_VISION_MODEL` | `gemini-3-pro-image-preview` | Screenshot analysis: describes page layout, UI elements, text content, errors, CSS selectors |

**How vision feeds into decisions:**
1. After each browser action, Playwright captures a screenshot
2. The `VisionClient` sends the screenshot to `gemini-3-pro-image-preview` with a QA-focused prompt
3. The vision model returns a structured description of the page (elements, labels, selectors, errors, state)
4. This description is stored as `latestVisualContext` in the Decision Engine
5. On the **next decision cycle**, the visual context is included in the decision prompt alongside beliefs and experiences
6. The reasoning model (`gemini-3-flash-preview`) uses this visual understanding to select more targeted actions (e.g., clicking specific buttons by selector, filling specific form fields)

This creates a **visual feedback loop**: Act → See → Decide → Act → See → ... Each action's visual outcome informs the next decision, giving NOEMA genuine visual understanding of what it's interacting with — not just DOM inspection.

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

Every action produces an `ActionOutcome` with artifacts (screenshots, console logs, network errors) that are fed back through the sensing layer as new observations — closing the cognitive loop. Screenshots are analyzed by Gemini Vision to produce rich visual descriptions that inform subsequent decisions.

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

The `RunController` ties all layers together in a **plan-driven execution flow**:

```typescript
async executeQARun(runId, input):
  1. initializeStorage()
  2. loadIdentity() + recordRunStart()
  3. sensorHub.ingest(taskDescription)            // Sense
  4. modelUpdateEngine.start()                    // Believe (initial)
  5. generateTestPlan(goal, url, beliefs, exps)   // PLAN
  6. for each planStep in plan.steps:             // Plan-Driven Execution
     a. decisionEngine.decideAndAct(stepTask)     //   Decide + Act
        → screenshot captured                     //   Playwright
        → visionClient.analyze(screenshot)        //   Gemini Vision sees the page
        → DOM snapshot extracted                  //   Structural page understanding
     b. narrationEmitter.emit(action events)      //   Narrate
     c. cycleUpdateEngine.start()                 //   Update beliefs from step data
     d. record step result (pass/fail/skipped)    //   Step-level evaluation
  7. experienceOptimizer.optimize(task)            // Learn
  8. recordRunMetrics(metrics)                     // Measure
  9. analyzeImprovement(metrics)                   // Compare
  10. buildRunTimeline(runId)                      // Timeline
  11. generateReflection(runId, timeline)          // Reflect
  12. generateQAReport(runId, ..., plan)           // Report (includes plan)
```

Key difference from blind execution: The plan is generated **once** at the start (step 5), but step-level learning (step 6c) means later plan steps benefit from earlier discoveries. The plan also carries through to the final report, where each step shows its individual pass/fail status.

### Narration System (Architectural, Not Chain-of-Thought)

The `NarrationEmitter` is an event bus that:
- Accepts typed events (narration, action_started, action_completed, plan_generated, plan_step_started, plan_step_completed, etc.)
- Stores ordered history with sequence numbers
- Broadcasts to SSE-connected clients per run
- Supports replay via `getEventsSince(seq)`

The `NarrationFormatter` converts internal events to first-person language:
- "I've analyzed the task and created a test plan: 'QA Test: Login flow' with 5 steps."
- "Plan step 1/5: 'Navigate to target' — Navigate to https://example.com..."
- "I'm navigating to https://example.com to observe the page."
- "I formed a new belief: 'Login form validation' (confidence: 0.72)."
- "Step 1 'Navigate to target' passed. Completed in 2 action(s)."
- "Plan execution complete: 4 passed, 1 failed out of 5 planned steps."
- "I learned something actionable: 'Submit buttons should be waited for before clicking.'"

**Important distinction:** NOEMA's narration is not Chain-of-Thought prompting. CoT is a technique where an LLM generates intermediate reasoning tokens within a single call — ephemeral, unverifiable, and gone when the call ends. NOEMA's narration reports on **real system state**: each narrated belief maps to a `MentalModel` stored on disk with evidence and confidence. Each narrated action maps to a persisted `Action` + `ActionOutcome`. Each narrated learning maps to an `Experience` that will be injected into future runs. The narration is a read-only window into a persistent architecture — not the LLM reasoning out loud.

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

### Why first-person narration (and why it's not CoT)?
- Makes NOEMA's reasoning visible and inspectable
- Demonstrates that actions stem from beliefs and evidence
- Judges can verify the system isn't a black box
- No emotions or consciousness claims — factual description only
- **Not Chain-of-Thought** — narration reports on real persistent state (beliefs, actions, experiences stored on disk), not ephemeral reasoning tokens within an LLM call. Every narrated event is backed by a verifiable, inspectable data object.

---

## File Structure

```
apps/
├── api/
│   └── src/
│       ├── api/
│       │   ├── server.ts           # HTTP server + SSE + routing
│       │   └── run_controller.ts   # Plan-driven QA run orchestration
│       ├── schemas/
│       │   └── index.ts            # All Zod schemas
│       ├── storage/
│       │   ├── base.ts             # BaseRepository (JSON persistence)
│       │   └── *.ts                # Entity-specific repositories
│       └── services/
│           ├── sensing/            # Perceptual IO + Gemini Vision
│           ├── cognition/          # Belief formation
│           ├── decision/           # Action selection + browser execution
│           │   └── plan_generator.ts  # LLM/mock test plan generation
│           ├── experience/         # Training-free GRPO learning
│           ├── identity/           # Persistent identity + lifetime
│           ├── narration/          # Live self-narration (includes plan events)
│           └── reflection/         # Timeline + improvement + plan evaluation
├── web/
│   └── src/
│       ├── api/noemaClient.ts      # API client + SSE subscription
│       ├── App.tsx                 # Cockpit layout
│       └── components/             # 6 cockpit panels (ReportViewer has Plan tab)
├── cognee_service/                 # Python Cognee integration
data/                               # Persistent state (JSON files)
docs/                               # Documentation
prompts/
├── planning.md                     # Test plan generation prompt
├── model_update.md                 # Belief formation prompt
├── decision.md                     # Action selection prompt
├── experience_extraction.md        # GRPO learning prompt
└── reflection.md                   # Run summary prompt
```
