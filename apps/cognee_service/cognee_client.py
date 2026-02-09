"""
NOEMA Cognee Service - Cognee Client Wrapper

This module wraps the Cognee library, providing a clean interface
for the FastAPI service. Cognee is used ONLY for:
- Storing and indexing evidence
- Semantic retrieval
- Graph-based context

Cognee does NOT:
- Store mental models
- Store experiences
- Make decisions
- Perform cognition

NOEMA remains the "mind". Cognee is "long-term associative memory".
"""

import os
import asyncio
import logging
from typing import Optional
from pathlib import Path

import cognee
from cognee.api.v1.search import SearchType

logger = logging.getLogger(__name__)

# Cognee requires LLM configuration for embeddings
# Set the API key before any Cognee operations
def _configure_llm():
    """Configure Cognee's LLM settings from environment."""
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        cognee.config.set_llm_api_key(api_key)
        logger.info("Configured Cognee with OpenAI API key")
    else:
        logger.warning("OPENAI_API_KEY not set - Cognee operations may fail")


class CogneeClient:
    """
    Wrapper around Cognee for evidence storage and retrieval.
    
    Uses Cognee's defaults:
    - Vector store: LanceDB (local, file-based)
    - Graph store: Kuzu (local)
    """
    
    def __init__(self, data_dir: Optional[str] = None):
        """
        Initialize the Cognee client.
        
        Args:
            data_dir: Directory for Cognee's local storage. 
                      Defaults to ./cognee_data
        """
        self.data_dir = data_dir or os.getenv("COGNEE_DATA_DIR", "./cognee_data")
        self._initialized = False
        # Track ingested evidence IDs to Cognee's internal IDs
        self._evidence_map: dict[str, str] = {}
    
    async def initialize(self) -> None:
        """Initialize Cognee with local storage configuration."""
        if self._initialized:
            return
        
        # Configure LLM API key first
        _configure_llm()
        
        # CRITICAL: Use absolute path to avoid Cognee v0.5+ path resolution bugs
        # Cognee's multi-user storage paths lose the relative prefix when reading back
        data_path = Path(self.data_dir).resolve()
        data_path.mkdir(parents=True, exist_ok=True)
        
        # Configure Cognee to use local storage with absolute path
        # LanceDB and Kuzu are the defaults - no cloud services
        cognee.config.data_root_directory(str(data_path))
        
        # Disable multi-user access control to avoid UUID-based path issues
        os.environ.setdefault("ENABLE_BACKEND_ACCESS_CONTROL", "false")
        
        self._initialized = True
        logger.info(f"Cognee initialized with data directory: {data_path}")
    
    async def ingest(
        self,
        evidence_id: str,
        content: str,
        content_type: str,
        metadata: dict
    ) -> str:
        """
        Ingest evidence into Cognee.
        
        Args:
            evidence_id: NOEMA's evidence ID
            content: Raw text content to index
            content_type: Type of content (text, log, screenshot_ocr, transcript)
            metadata: Associated metadata
            
        Returns:
            Cognee's internal ID for this evidence
        """
        await self.initialize()
        
        # Prepare content with metadata prefix for better retrieval
        # This helps Cognee understand the context
        enriched_content = f"[{content_type}] [source: {metadata.get('source', 'unknown')}]\n{content}"
        
        # Add to Cognee
        # Cognee.add() accepts text content
        await cognee.add(
            enriched_content,
            dataset_name=f"evidence_{evidence_id}"
        )
        
        # Generate a Cognee ID (Cognee doesn't expose internal IDs directly,
        # so we create a mapping based on the evidence_id)
        cognee_id = f"cognee_{evidence_id}"
        self._evidence_map[evidence_id] = cognee_id
        
        logger.info(f"Ingested evidence {evidence_id} as {cognee_id}")
        return cognee_id
    
    async def cognify(self) -> None:
        """
        Run Cognee's cognify process to build internal representations.
        
        This processes all added content and builds:
        - Vector embeddings
        - Knowledge graph
        """
        await self.initialize()
        
        logger.info("Running cognee.cognify()...")
        await cognee.cognify()
        
        logger.info("Cognify completed")
    
    async def search(
        self,
        query: str,
        top_k: int = 5
    ) -> dict:
        """
        Search Cognee's memory for relevant evidence.
        
        Args:
            query: Natural language search query
            top_k: Number of results to return
            
        Returns:
            Dictionary with 'items' and 'graph_context'
        """
        await self.initialize()
        
        logger.info(f"Searching for: {query} (top_k={top_k})")
        
        items = []
        graph_context = {"nodes": [], "edges": []}
        
        try:
            # Perform semantic search using INSIGHTS search type
            # This returns relevant chunks with scores
            search_results = await cognee.search(
                SearchType.INSIGHTS,
                query_text=query
            )
            
            # Process search results
            if search_results:
                for i, result in enumerate(search_results[:top_k]):
                    # Extract content and score from result
                    # Cognee returns different formats depending on search type
                    if isinstance(result, dict):
                        snippet = result.get("text", result.get("content", str(result)))
                        score = result.get("score", 1.0 - (i * 0.1))  # Fallback scoring
                        metadata = result.get("metadata", {})
                    elif hasattr(result, "payload"):
                        # Handle Cognee's data node format
                        snippet = str(result.payload) if hasattr(result, "payload") else str(result)
                        score = getattr(result, "score", 1.0 - (i * 0.1))
                        metadata = {}
                    else:
                        snippet = str(result)
                        score = 1.0 - (i * 0.1)
                        metadata = {}
                    
                    items.append({
                        "cognee_id": f"result_{i}",
                        "snippet": snippet[:500],  # Truncate long snippets
                        "score": min(max(score, 0.0), 1.0),  # Clamp to [0, 1]
                        "metadata": metadata
                    })
            
            # Try to get graph context
            try:
                graph_results = await cognee.search(
                    SearchType.GRAPH_COMPLETION,
                    query_text=query
                )
                
                if graph_results:
                    # Extract nodes and edges from graph results
                    seen_nodes = set()
                    for result in graph_results[:top_k]:
                        if hasattr(result, "name"):
                            seen_nodes.add(str(result.name))
                        elif isinstance(result, dict):
                            if "name" in result:
                                seen_nodes.add(result["name"])
                            if "source" in result and "target" in result:
                                graph_context["edges"].append({
                                    "from": result["source"],
                                    "to": result["target"],
                                    "relation": result.get("relation", "related_to"),
                                    "weight": result.get("weight", 0.5)
                                })
                    
                    graph_context["nodes"] = list(seen_nodes)
                    
            except Exception as e:
                logger.warning(f"Graph search failed (non-fatal): {e}")
                
        except Exception as e:
            logger.error(f"Search failed: {e}")
            # Return empty results on error, don't crash
        
        return {
            "items": items,
            "graph_context": graph_context if graph_context["nodes"] or graph_context["edges"] else None
        }
    
    async def health_check(self) -> bool:
        """Check if Cognee is operational."""
        try:
            await self.initialize()
            return True
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False


# Singleton instance
_client: Optional[CogneeClient] = None


def get_cognee_client() -> CogneeClient:
    """Get the singleton Cognee client instance."""
    global _client
    if _client is None:
        _client = CogneeClient()
    return _client
