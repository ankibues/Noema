"""
NOEMA Cognee Service - FastAPI Application

This service provides HTTP endpoints for NOEMA to interact with Cognee.
Cognee serves as semantic memory infrastructure - NOT intelligence.

Endpoints:
- GET  /health  - Health check
- POST /ingest  - Ingest evidence into Cognee
- POST /cognify - Build/update Cognee's internal representations
- POST /search  - Retrieve relevant evidence snippets + graph context

Run with:
    uvicorn main:app --host 0.0.0.0 --port 8100 --reload
"""

import os
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import (
    HealthResponse,
    IngestRequest,
    IngestResponse,
    CognifyResponse,
    SearchRequest,
    SearchResponse,
    SearchItem,
    GraphContext,
    GraphEdge,
)
from cognee_client import get_cognee_client

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    logger.info("Starting Cognee service...")
    client = get_cognee_client()
    await client.initialize()
    logger.info("Cognee service ready")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Cognee service...")


# Create FastAPI application
app = FastAPI(
    title="NOEMA Cognee Service",
    description="Semantic memory infrastructure for NOEMA. Stores and retrieves evidence only.",
    version="0.1.0",
    lifespan=lifespan,
)

# Add CORS middleware for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Health Check
# =============================================================================

@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Health check endpoint.
    
    Returns:
        Status indicating if the service is operational.
    """
    client = get_cognee_client()
    is_healthy = await client.health_check()
    
    if is_healthy:
        return HealthResponse(status="ok")
    else:
        return HealthResponse(status="error", message="Cognee initialization failed")


# =============================================================================
# Ingest
# =============================================================================

@app.post("/ingest", response_model=IngestResponse)
async def ingest_evidence(request: IngestRequest) -> IngestResponse:
    """
    Ingest evidence into Cognee.
    
    This endpoint accepts raw evidence (text, logs, OCR, transcripts) and
    stores it in Cognee for later retrieval. 
    
    IMPORTANT: This endpoint does NOT accept mental models or experiences.
    Those belong in NOEMA's storage layer, not Cognee.
    
    Args:
        request: Evidence to ingest
        
    Returns:
        Cognee's internal identifier for the evidence
    """
    client = get_cognee_client()
    
    try:
        # Prepare metadata dict
        metadata = {
            "source": request.metadata.source,
            "timestamp": request.metadata.timestamp,
        }
        if request.metadata.extra:
            metadata.update(request.metadata.extra)
        
        # Ingest into Cognee
        cognee_id = await client.ingest(
            evidence_id=request.evidence_id,
            content=request.content,
            content_type=request.content_type,
            metadata=metadata
        )
        
        logger.info(f"Ingested evidence {request.evidence_id} -> {cognee_id}")
        return IngestResponse(cognee_id=cognee_id)
        
    except Exception as e:
        logger.error(f"Ingest failed: {e}")
        raise HTTPException(status_code=500, detail=f"Ingest failed: {str(e)}")


# =============================================================================
# Cognify
# =============================================================================

@app.post("/cognify", response_model=CognifyResponse)
async def run_cognify() -> CognifyResponse:
    """
    Build/update Cognee's internal representations.
    
    This runs Cognee's cognify() process which:
    - Builds vector embeddings
    - Constructs knowledge graph
    - Prepares content for retrieval
    
    For MVP, call this after each ingest. Optimization is out of scope.
    
    Returns:
        Status indicating completion
    """
    client = get_cognee_client()
    
    try:
        await client.cognify()
        logger.info("Cognify completed successfully")
        return CognifyResponse(status="completed")
        
    except Exception as e:
        logger.error(f"Cognify failed: {e}")
        return CognifyResponse(status="error", message=str(e))


# =============================================================================
# Search
# =============================================================================

@app.post("/search", response_model=SearchResponse)
async def search_memory(request: SearchRequest) -> SearchResponse:
    """
    Search Cognee's memory for relevant evidence.
    
    This endpoint returns candidate evidence snippets and graph context.
    It does NOT filter, rank, or reason about results - that's NOEMA's job.
    
    Args:
        request: Search query and parameters
        
    Returns:
        Matching evidence snippets and related graph context
    """
    client = get_cognee_client()
    
    try:
        results = await client.search(
            query=request.query,
            top_k=request.topK
        )
        
        # Convert to response schema
        items = [
            SearchItem(
                cognee_id=item["cognee_id"],
                snippet=item["snippet"],
                score=item["score"],
                metadata=item.get("metadata")
            )
            for item in results.get("items", [])
        ]
        
        graph_context = None
        if results.get("graph_context"):
            gc = results["graph_context"]
            edges = [
                GraphEdge(
                    from_node=e["from"],
                    to_node=e["to"],
                    relation=e["relation"],
                    weight=e.get("weight")
                )
                for e in gc.get("edges", [])
            ]
            graph_context = GraphContext(
                nodes=gc.get("nodes", []),
                edges=edges
            )
        
        logger.info(f"Search for '{request.query}' returned {len(items)} results")
        return SearchResponse(items=items, graph_context=graph_context)
        
    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


# =============================================================================
# Main
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("COGNEE_SERVICE_PORT", "8100"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True
    )
