# NOEMA Cognee Service

Semantic memory infrastructure for NOEMA. This service wraps [Cognee](https://github.com/topoteretes/cognee) to provide evidence storage and retrieval.

## Role in NOEMA

```
┌─────────────────────────────────────────────────────────────────┐
│                         NOEMA                                    │
│                    (The "Mind")                                  │
│                                                                  │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │   Mental    │  │ Experiences │  │   Runs      │            │
│   │   Models    │  │             │  │             │            │
│   └─────────────┘  └─────────────┘  └─────────────┘            │
│          │                │                │                    │
│          └────────────────┼────────────────┘                    │
│                           │                                      │
│                    NOEMA Storage                                │
│                    (Phase 1 - JSON)                             │
│                                                                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ HTTP (ingest, search)
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                    COGNEE SERVICE                               │
│                 (This service - "Memory")                       │
│                                                                  │
│   ┌─────────────┐  ┌─────────────┐                             │
│   │   LanceDB   │  │    Kuzu     │                             │
│   │  (Vectors)  │  │   (Graph)   │                             │
│   └─────────────┘  └─────────────┘                             │
│                                                                  │
│   Stores: Evidence ONLY                                         │
│   Does NOT store: Mental models, experiences, beliefs           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## What This Service Does

- **Stores evidence** (text, logs, OCR, transcripts)
- **Indexes content** for semantic retrieval
- **Builds knowledge graph** from evidence relationships
- **Returns candidates** for NOEMA to reason about

## What This Service Does NOT Do

- ❌ Store mental models
- ❌ Store experiences
- ❌ Make decisions
- ❌ Perform cognition
- ❌ Filter or rank results (beyond Cognee's output)

## Setup

### 1. Create virtual environment

```bash
cd apps/cognee_service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your LLM API keys
```

### 4. Run the service

```bash
# Development
uvicorn main:app --host 0.0.0.0 --port 8100 --reload

# Or directly
python main.py
```

## API Endpoints

### GET /health

Health check.

```bash
curl http://localhost:8100/health
```

Response:
```json
{"status": "ok"}
```

### POST /ingest

Ingest evidence into Cognee.

```bash
curl -X POST http://localhost:8100/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "evidence_id": "obs_001",
    "content": "Error: Connection timeout after 30s",
    "content_type": "log",
    "metadata": {
      "source": "app_server",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  }'
```

Response:
```json
{"cognee_id": "cognee_obs_001"}
```

### POST /cognify

Build/update Cognee's internal representations.

```bash
curl -X POST http://localhost:8100/cognify
```

Response:
```json
{"status": "completed"}
```

### POST /search

Search for relevant evidence.

```bash
curl -X POST http://localhost:8100/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "connection timeout",
    "topK": 5
  }'
```

Response:
```json
{
  "items": [
    {
      "cognee_id": "result_0",
      "snippet": "Error: Connection timeout after 30s",
      "score": 0.95,
      "metadata": {}
    }
  ],
  "graph_context": {
    "nodes": ["connection", "timeout", "error"],
    "edges": [
      {"from": "timeout", "to": "error", "relation": "causes", "weight": 0.8}
    ]
  }
}
```

## Storage

Cognee uses local file-based storage:

- **LanceDB**: Vector embeddings (in `cognee_data/`)
- **Kuzu**: Knowledge graph (in `cognee_data/`)

No external databases or cloud services required.

## Architecture Notes

1. **Clean boundary**: NOEMA (Node.js) ↔ HTTP ↔ Cognee (Python)
2. **Evidence only**: This service stores raw evidence, not beliefs
3. **Candidates, not truth**: Search returns possibilities for NOEMA to evaluate
4. **Stateless API**: Each request is independent; state lives in Cognee's storage
