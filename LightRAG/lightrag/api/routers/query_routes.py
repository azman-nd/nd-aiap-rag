"""
This module contains all query-related routes for the LightRAG API.
"""

import json
import logging
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from lightrag.base import QueryParam
from lightrag.utils import logger
from ..utils_api import get_combined_auth_dependency
from ..access_control import (
    AccessFilters,
    CurrentUser,
    Permission,
    doc_file_path,
    get_current_user_optional,
    get_user_accessible_files,
    normalize_tag_items,
)
from pydantic import BaseModel, Field, field_validator

from ascii_colors import trace_exception

router = APIRouter(tags=["query"])


class TagFilter(BaseModel):
    """Tag filter for metadata-based access control."""

    name: str = Field(..., description="Tag name to match")
    value: Optional[str] = Field(default="", description="Tag value to match")

    @field_validator("name", mode="after")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Tag name cannot be empty")
        return value

    @field_validator("value", mode="after")
    @classmethod
    def normalize_value(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if isinstance(value, str) else value


class AccessFilterPayload(BaseModel):
    """Metadata filters provided by the client to scope query results."""

    project_id: Optional[str] = Field(
        default=None,
        description="Project identifier used to scope accessible documents",
    )
    owner: Optional[str] = Field(
        default=None, description="Owner user id used to scope accessible documents"
    )
    tags: Optional[List[TagFilter]] = Field(
        default=None,
        description="List of tags (name/value pairs) that documents must contain",
    )
    filename: Optional[str] = Field(
        default=None,
        description="Filter by document filename (supports partial matching)",
    )

    @field_validator("project_id", "owner", "filename", mode="after")
    @classmethod
    def strip_strings(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if isinstance(value, str) else value


class QueryRequest(BaseModel):
    query: str = Field(
        min_length=1,
        description="The query text",
    )

    mode: Literal["local", "global", "hybrid", "naive", "mix", "bypass"] = Field(
        default="mix",
        description="Query mode",
    )

    only_need_context: Optional[bool] = Field(
        default=None,
        description="If True, only returns the retrieved context without generating a response.",
    )

    only_need_prompt: Optional[bool] = Field(
        default=None,
        description="If True, only returns the generated prompt without producing a response.",
    )

    response_type: Optional[str] = Field(
        min_length=1,
        default=None,
        description="Defines the response format. Examples: 'Multiple Paragraphs', 'Single Paragraph', 'Bullet Points'.",
    )

    top_k: Optional[int] = Field(
        ge=1,
        default=None,
        description="Number of top items to retrieve. Represents entities in 'local' mode and relationships in 'global' mode.",
    )

    chunk_top_k: Optional[int] = Field(
        ge=1,
        default=None,
        description="Number of text chunks to retrieve initially from vector search and keep after reranking.",
    )

    max_entity_tokens: Optional[int] = Field(
        default=None,
        description="Maximum number of tokens allocated for entity context in unified token control system.",
        ge=1,
    )

    max_relation_tokens: Optional[int] = Field(
        default=None,
        description="Maximum number of tokens allocated for relationship context in unified token control system.",
        ge=1,
    )

    max_total_tokens: Optional[int] = Field(
        default=None,
        description="Maximum total tokens budget for the entire query context (entities + relations + chunks + system prompt).",
        ge=1,
    )

    conversation_history: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Stores past conversation history to maintain context. Format: [{'role': 'user/assistant', 'content': 'message'}].",
    )

    history_turns: Optional[int] = Field(
        ge=0,
        default=None,
        description="Number of complete conversation turns (user-assistant pairs) to consider in the response context.",
    )

    ids: list[str] | None = Field(
        default=None, description="List of ids to filter the results."
    )

    user_prompt: Optional[str] = Field(
        default=None,
        description="User-provided prompt for the query. If provided, this will be used instead of the default value from prompt template.",
    )

    enable_rerank: Optional[bool] = Field(
        default=None,
        description="Enable reranking for retrieved text chunks. If True but no rerank model is configured, a warning will be issued. Default is True.",
    )

    access_filters: Optional[AccessFilterPayload] = Field(
        default=None,
        description="Metadata filters (project/owner/tags) applied before executing the query",
    )

    @field_validator("query", mode="after")
    @classmethod
    def query_strip_after(cls, query: str) -> str:
        return query.strip()

    @field_validator("conversation_history", mode="after")
    @classmethod
    def conversation_history_role_check(
        cls, conversation_history: List[Dict[str, Any]] | None
    ) -> List[Dict[str, Any]] | None:
        if conversation_history is None:
            return None
        for msg in conversation_history:
            if "role" not in msg or msg["role"] not in {"user", "assistant"}:
                raise ValueError(
                    "Each message must have a 'role' key with value 'user' or 'assistant'."
                )
        return conversation_history

    def to_query_params(self, is_stream: bool) -> "QueryParam":
        """Converts a QueryRequest instance into a QueryParam instance."""
        # Use Pydantic's `.model_dump(exclude_none=True)` to remove None values automatically
        request_data = self.model_dump(
            exclude_none=True,
            exclude={"query", "access_filters"},
        )

        # Ensure `mode` and `stream` are set explicitly
        param = QueryParam(**request_data)
        param.stream = is_stream
        return param


def build_access_filters(payload: AccessFilterPayload | None) -> AccessFilters:
    """Convert request payload into AccessFilters used by access control layer."""

    if payload is None:
        return AccessFilters()

    tags_payload = [tag.model_dump() for tag in payload.tags] if payload.tags else None
    tags = normalize_tag_items(tags_payload)
    return AccessFilters(
        project_id=payload.project_id,
        owner=payload.owner,
        tags=tags,
        filename=payload.filename,
    )


class QueryResponse(BaseModel):
    response: str = Field(
        description="The generated response",
    )


class QueryDataResponse(BaseModel):
    entities: List[Dict[str, Any]] = Field(
        description="Retrieved entities from knowledge graph"
    )
    relationships: List[Dict[str, Any]] = Field(
        description="Retrieved relationships from knowledge graph"
    )
    chunks: List[Dict[str, Any]] = Field(
        description="Retrieved text chunks from documents"
    )
    metadata: Dict[str, Any] = Field(
        description="Query metadata including mode, keywords, and processing information"
    )


def create_query_routes(rag, api_key: Optional[str] = None, top_k: int = 60):
    combined_auth = get_combined_auth_dependency(api_key)

    def apply_doc_id_filter(param: QueryParam, accessible_docs: dict[str, Any]) -> None:
        """Set QueryParam.ids based on accessible documents and client request."""
        accessible_ids = list(accessible_docs.keys())

        if param.ids:
            # Client provided specific IDs - intersect with accessible docs
            param.ids = [doc_id for doc_id in param.ids if doc_id in accessible_docs]
        else:
            # No client filter - use all accessible docs
            param.ids = accessible_ids

    @router.post(
        "/query", response_model=QueryResponse, dependencies=[Depends(combined_auth)]
    )
    async def query_text(
        request: QueryRequest,
        current_user: CurrentUser = Depends(get_current_user_optional),
    ):
        """
        Handle a POST request at the /query endpoint to process user queries using RAG capabilities.

        Document ID filtering: The system now filters results by document IDs during retrieval.
        - Vector databases filter chunks by full_doc_id field (supported in Milvus, MongoDB, PostgreSQL, Qdrant, Faiss, NanoVectorDB)
        - Graph databases filter entities/relationships by their source_id (chunk IDs)
        - See _get_chunk_ids_for_doc_ids() in operate.py for the doc_id → chunk_id mapping logic

        Parameters:
            request (QueryRequest): The request object containing the query parameters.
        Returns:
            QueryResponse: A Pydantic model containing the result of the query processing.
                       If a string is returned (e.g., cache hit), it's directly returned.
                       Otherwise, an async generator may be used to build the response.

        Raises:
            HTTPException: Raised when an error occurs during the request handling process,
                       with status code 500 and detail containing the exception message.
        """
        try:
            param = request.to_query_params(False)
            filters = build_access_filters(request.access_filters)

            accessible_docs = await get_user_accessible_files(
                rag.doc_status,
                current_user,
                project_id=filters.project_id,
                include_shared=True,
                include_public=True,
                filters=filters,
                required_permission=Permission.VIEW,
            )

            if not accessible_docs:
                detail = (
                    "No accessible documents found for the provided metadata filters."
                    if current_user.is_authenticated
                    else "Please authenticate or provide appropriate metadata to access documents."
                )
                return QueryResponse(response=detail)

            apply_doc_id_filter(param, accessible_docs)

            logger.info(
                f"[query_text] Invoking rag.aquery() with param.ids={param.ids}"
            )
            response = await rag.aquery(request.query, param=param)

            if isinstance(response, str):
                return QueryResponse(response=response)

            if isinstance(response, dict):
                return QueryResponse(response=json.dumps(response, indent=2))

            return QueryResponse(response=str(response))
        except Exception as e:
            trace_exception(e)
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/query/stream", dependencies=[Depends(combined_auth)])
    async def query_text_stream(
        request: QueryRequest,
        current_user: CurrentUser = Depends(get_current_user_optional),
    ):
        """
        This endpoint performs a retrieval-augmented generation (RAG) query and streams the response.

        Args:
            request (QueryRequest): The request object containing the query parameters.
            optional_api_key (Optional[str], optional): An optional API key for authentication. Defaults to None.

        Returns:
            StreamingResponse: A streaming response containing the RAG query results.
        """
        try:
            param = request.to_query_params(True)
            filters = build_access_filters(request.access_filters)

            accessible_docs = await get_user_accessible_files(
                rag.doc_status,
                current_user,
                project_id=filters.project_id,
                include_shared=True,
                include_public=True,
                filters=filters,
                required_permission=Permission.VIEW,
            )

            if not accessible_docs:
                raise HTTPException(
                    status_code=403,
                    detail="No accessible documents found for the provided metadata filters.",
                )

            apply_doc_id_filter(param, accessible_docs)

            logger.info(
                f"[query_text_stream] Invoking rag.aquery() with param.ids={param.ids}"
            )
            response = await rag.aquery(request.query, param=param)

            async def stream_generator():
                if isinstance(response, str):
                    # If it's a string, send it all at once
                    yield f"{json.dumps({'response': response})}\n"
                elif response is None:
                    # Handle None response (e.g., when only_need_context=True but no context found)
                    yield f"{json.dumps({'response': 'No relevant context found for the query.'})}\n"
                else:
                    # If it's an async generator, send chunks one by one
                    try:
                        async for chunk in response:
                            if chunk:  # Only send non-empty content
                                yield f"{json.dumps({'response': chunk})}\n"
                    except Exception as e:
                        logging.error(f"Streaming error: {str(e)}")
                        yield f"{json.dumps({'error': str(e)})}\n"

            return StreamingResponse(
                stream_generator(),
                media_type="application/x-ndjson",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "Content-Type": "application/x-ndjson",
                    "X-Accel-Buffering": "no",  # Ensure proper handling of streaming response when proxied by Nginx
                },
            )
        except Exception as e:
            trace_exception(e)
            raise HTTPException(status_code=500, detail=str(e))

    @router.post(
        "/query/data",
        response_model=QueryDataResponse,
        dependencies=[Depends(combined_auth)],
    )
    async def query_data(
        request: QueryRequest,
        current_user: CurrentUser = Depends(get_current_user_optional),
    ):
        """
        Retrieve structured data without LLM generation.

        This endpoint returns raw retrieval results including entities, relationships,
        and text chunks that would be used for RAG, but without generating a final response.
        All parameters are compatible with the regular /query endpoint.

        Parameters:
            request (QueryRequest): The request object containing the query parameters.

        Returns:
            QueryDataResponse: A Pydantic model containing structured data with entities,
                             relationships, chunks, and metadata.

        Raises:
            HTTPException: Raised when an error occurs during the request handling process,
                         with status code 500 and detail containing the exception message.
        """
        try:
            param = request.to_query_params(False)  # No streaming for data endpoint
            filters = build_access_filters(request.access_filters)
            accessible_docs = await get_user_accessible_files(
                rag.doc_status,
                current_user,
                project_id=filters.project_id,
                include_shared=True,
                include_public=True,
                filters=filters,
                required_permission=Permission.VIEW,
            )

            if not accessible_docs:
                raise HTTPException(
                    status_code=403,
                    detail="No accessible documents found for the provided metadata filters.",
                )

            apply_doc_id_filter(param, accessible_docs)

            logger.info(
                f"[query_data] Invoking rag.aquery_data() with param.ids={param.ids}"
            )
            response = await rag.aquery_data(request.query, param=param)

            # The aquery_data method returns a dict with entities, relationships, chunks, and metadata
            # No need to post-filter since filtering happens during retrieval via param.ids
            if isinstance(response, dict):
                # Results are already filtered by param.ids during retrieval
                filtered_chunks = response.get("chunks", [])
                filtered_entities = response.get("entities", [])
                filtered_relationships = response.get("relationships", [])
                metadata = response.get("metadata", {})

                if not isinstance(filtered_entities, list):
                    filtered_entities = []
                if not isinstance(filtered_relationships, list):
                    filtered_relationships = []
                if not isinstance(filtered_chunks, list):
                    filtered_chunks = []
                if not isinstance(metadata, dict):
                    metadata = {}

                accessible_paths = [
                    path
                    for path in (
                        doc_file_path(status) for status in accessible_docs.values()
                    )
                    if path
                ]
                metadata.update(
                    {
                        "accessible_files": accessible_paths,
                        "total_accessible_files": len(accessible_docs),
                        "applied_filters": filters.__dict__,
                    }
                )

                return QueryDataResponse(
                    entities=filtered_entities,
                    relationships=filtered_relationships,
                    chunks=filtered_chunks,
                    metadata=metadata,
                )

            return QueryDataResponse(
                entities=[],
                relationships=[],
                chunks=[],
                metadata={
                    "error": "Unexpected response format",
                    "raw_response": str(response),
                },
            )
        except Exception as e:
            trace_exception(e)
            raise HTTPException(status_code=500, detail=str(e))

    return router
