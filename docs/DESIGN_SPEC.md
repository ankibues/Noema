# NOEMA — Design Specification (MVP)

## 0. One-line definition
NOEMA is a **persistent digital cognitive system** that senses multimodal data, converts it into Observations (memory), builds/updates mental models, and improves its actions via training-free experience optimization — enabling it to perform increasingly complex digital tasks over time.

---

## 1. Design goals
### 1.1 MVP goals
- Persistent identity through time (state survives restarts)
- Multimodal sensing -> canonical Observations
- Persistent semantic memory (Cognee)
- Mental models ("thought documents") that update with confidence + evidence
- Action selection based on models + experiences
- Training-free GRPO learning loop (multi-rollout -> compare -> distill experiences)
- Transparent / inspectable internal state for demo

### 1.2 Non-goals (MVP)
- Physical embodiment (touch/force)
- Fine-tuning / parameter updates
- Full general autonomy (keep scope: 1 domain demo)

---

## 2. Architecture overview

### 2.1 Layered architecture
1) **Sensing / Perception Layer**
   - Ingest raw audio/video/text/logs/screenshots/human input
   - Chunk + normalize
   - Summarize to Observation objects (strict schema)
   - Emit Observation events

2) **Memory Layer**
   - Evidence store (raw artifacts + metadata)
   - Cognee store (vector + graph; persistent semantic recall)
   - Local structured stores (mental models, experiences, thought graph)

3) **Cognition Layer**
   - Model Update Engine (belief revision)
   - Thought Graph Manager (relations between models)
   - Decision Engine (chooses actions)
   - Reflection Engine (explains change)
   - Experience Optimizer (training-free GRPO-style learning loop)

4) **Agency / Tools Layer**
   - QA runner (Playwright/Appium/etc.)
   - Browser/tool execution (optional)
   - Repo/code operations (optional)
   - Human help requests

### 2.2 Runtime model: long-lived organism
NOEMA should run as:
- a service that accepts continuous ingest events,
- maintains state across time,
- processes Observations in an event loop (queue/bus),
- performs actions and records outcomes.

---

## 3. The “Sensing” model (critical)
### 3.1 Sensing definition
Sensing = converting environment signals (audio/video/text) into **canonical Observations**.

### 3.2 Why chunking is mandatory
Audio/video/log streams exceed any context window.
Solution: segment -> summarize -> store -> retrieve only relevant slices.

### 3.3 Minimum viable sensing
MVP must support:
- text/log ingest
- screenshot ingest with **Gemini Vision analysis** (`gemini-3-pro-image-preview`) — visual understanding of page layout, UI elements, text, errors, CSS selectors
Optional:
- audio -> transcript -> Observation
- video -> frames -> Observation

---

## 4. Memory model (three layers)

### Layer A: Evidence (raw)
- file artifacts (png, mp4, wav, txt)
- metadata, timestamps, source ids
Purpose: audit + reprocessing

### Layer B: Semantic memory (Cognee)
- embeddings for retrieval
- graph relations for structure
Purpose: long-term recall + grounding for updates

### Layer C: Cognition memory (NOEMA docs)
- mental models: “my understanding written down”
- experiences: “reusable heuristics that bias action selection”
- thought graph: relations among mental models

---

## 5. Mental models (“thought documents”)
Mental models are the system’s evolving understanding of a domain.
They are structured documents with:
- summary, assumptions, procedures, failure modes, diagnostics
- evidence links
- confidence + update history

The LLM edits these documents; the system enforces schema and confidence rules.

---

## 6. Experience library (Training-Free GRPO)
The experience library stores short (≤32 words), generalizable heuristics extracted by comparing multiple rollouts using multi-criteria evaluation (success, evidence clarity, error specificity, ambiguity reduction, signal strength).
Experiences are injected as **token priors** into future prompts to steer behavior — adapting the GRPO (Group Relative Policy Optimization) approach to work without gradient updates.

---

## 7. Cognition and learning loop

### 7.0 Not Chain-of-Thought
NOEMA's cognitive loop is **architectural**, not a prompting technique. Chain-of-Thought asks an LLM to "think step by step" within a single inference call — those reasoning tokens are ephemeral and unverifiable. NOEMA's loop is a real software pipeline: each stage (Sense, Believe, Decide, Act, Learn, Reflect) reads and writes persistent data objects (Observations, Mental Models, Experiences, Graph Edges). The LLM is called at specific stages as a stateless reasoning tool — but the state, learning, and improvement are all managed by the architecture, not by the LLM's token generation.

### 7.1 End-to-end loop
Observe
→ Retrieve memory (Cognee search + model lookup)
→ Update mental models + thought graph
→ Generate K candidate actions (K=2–3)
→ Execute / simulate actions
→ Compare outcomes
→ Distill experiences (add/modify/delete)
→ Reflect + persist state
→ Continue

### 7.2 Why this improves over time
- Models become more accurate (belief revision)
- Experiences reduce repeated mistakes (policy shifts via context)
- Decision engine uses both to choose better actions
- No weight updates required

---

## 8. Context window strategy
Context window limits what the LLM sees at once.
NOEMA mitigates via:
- chunking + summarization into Observations
- targeted retrieval (top-K evidence + top-K models + top-K experiences)
- “context budgeter” to keep prompts within token limits

---

## 9. Human-in-the-loop
Humans provide:
- clarifications (text/audio/video)
- corrections (ground truth labels)
- preferences/constraints

Human input enters sensing as `Observation.type = "human"` and is treated as high-weight evidence.

---

## 10. MVP deliverable definition
Minimum product is complete when:
- You can ingest artifacts -> produce Observations -> store in Cognee + evidence store
- Mental models update with confidence changes and evidence links
- Decision engine selects actions from models + experiences
- Experience optimizer demonstrates improvement after multiple attempts
- Demo clearly shows internal state evolution (models + experiences + actions + outcomes)
