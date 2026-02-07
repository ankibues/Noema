"""
NOEMA Cognee Service - Pydantic Schemas

These schemas define the API contract for the Cognee service.
Cognee stores EVIDENCE ONLY - no mental models, experiences, or beliefs.
"""

from typing import Optional, Literal
from pydantic import BaseModel, Field


# =============================================================================
# Health Check
# =============================================================================

class HealthResponse(BaseModel):
    """Health check response."""
    status: Literal["ok", "error"] = "ok"
    message: Optional[str] = None


# =============================================================================
# Ingest
# =============================================================================

class IngestMetadata(BaseModel):
    """Metadata for ingested evidence."""
    source: str = Field(..., description="Source of the evidence (sensor, file, etc.)")
    timestamp: str = Field(..., description="ISO timestamp of when evidence was captured")
    # Additional metadata fields can be added here
    extra: Optional[dict] = Field(default=None, description="Additional metadata")


class IngestRequest(BaseModel):
    """Request to ingest evidence into Cognee."""
    evidence_id: str = Field(..., description="Unique ID from NOEMA's evidence store")
    content: str = Field(..., description="Raw text content to index")
    content_type: Literal["text", "log", "screenshot_ocr", "transcript"] = Field(
        ..., description="Type of content being ingested"
    )
    metadata: IngestMetadata = Field(..., description="Evidence metadata")


class IngestResponse(BaseModel):
    """Response after ingesting evidence."""
    cognee_id: str = Field(..., description="Cognee's internal identifier for this evidence")


# =============================================================================
# Cognify
# =============================================================================

class CognifyResponse(BaseModel):
    """Response after running cognify/memify."""
    status: Literal["completed", "error"] = "completed"
    message: Optional[str] = None


# =============================================================================
# Search
# =============================================================================

class SearchRequest(BaseModel):
    """Request to search Cognee's memory."""
    query: str = Field(..., description="Natural language search query")
    topK: int = Field(default=5, ge=1, le=50, description="Number of results to return")


class SearchItem(BaseModel):
    """A single search result item."""
    cognee_id: str = Field(..., description="Cognee's internal identifier")
    snippet: str = Field(..., description="Relevant text snippet")
    score: float = Field(..., ge=0.0, le=1.0, description="Relevance score")
    metadata: Optional[dict] = Field(default=None, description="Associated metadata")


class GraphEdge(BaseModel):
    """An edge in the knowledge graph."""
    from_node: str = Field(..., alias="from", description="Source node")
    to_node: str = Field(..., alias="to", description="Target node")
    relation: str = Field(..., description="Relationship type")
    weight: Optional[float] = Field(default=None, description="Edge weight")

    class Config:
        populate_by_name = True


class GraphContext(BaseModel):
    """Graph context from Cognee's knowledge graph."""
    nodes: list[str] = Field(default_factory=list, description="Relevant nodes")
    edges: list[GraphEdge] = Field(default_factory=list, description="Relevant edges")


class SearchResponse(BaseModel):
    """Response from searching Cognee's memory."""
    items: list[SearchItem] = Field(default_factory=list, description="Search results")
    graph_context: Optional[GraphContext] = Field(
        default=None, description="Related graph context"
    )
