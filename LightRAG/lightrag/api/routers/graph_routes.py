"""
This module contains all graph-related routes for the LightRAG API.
"""

from typing import Optional, Dict, Any
import traceback
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel

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

router = APIRouter(tags=["graph"])


class EntityUpdateRequest(BaseModel):
    entity_name: str
    updated_data: Dict[str, Any]
    allow_rename: bool = False


class RelationUpdateRequest(BaseModel):
    source_id: str
    target_id: str
    updated_data: Dict[str, Any]


def create_graph_routes(rag, api_key: Optional[str] = None):
    combined_auth = get_combined_auth_dependency(api_key)

    @router.get("/graph/label/list", dependencies=[Depends(combined_auth)])
    async def get_graph_labels():
        """
        Get all graph labels

        Returns:
            List[str]: List of graph labels
        """
        try:
            return await rag.get_graph_labels()
        except Exception as e:
            logger.error(f"Error getting graph labels: {str(e)}")
            logger.error(traceback.format_exc())
            raise HTTPException(
                status_code=500, detail=f"Error getting graph labels: {str(e)}"
            )

    @router.get("/graphs", dependencies=[Depends(combined_auth)])
    async def get_knowledge_graph(
        label: str = Query(..., description="Label to get knowledge graph for"),
        max_depth: int = Query(3, description="Maximum depth of graph", ge=1),
        max_nodes: int = Query(1000, description="Maximum nodes to return", ge=1),
        file_path: Optional[str] = Query(
            None, description="Filter by source file path (supports partial matching)"
        ),
        project_id: Optional[str] = Query(
            None, description="Project identifier required for access control filtering"
        ),
        owner: Optional[str] = Query(
            None, description="Owner user id used for access control filtering"
        ),
        tags: Optional[str] = Query(
            None,
            description=(
                "Tag filters encoded as JSON array or comma separated 'name:value' entries"
            ),
        ),
        current_user: CurrentUser = Depends(get_current_user_optional),
    ):
        """
        Retrieve a connected subgraph of nodes where the label includes the specified label.
        When reducing the number of nodes, the prioritization criteria are as follows:
            1. Hops(path) to the staring node take precedence
            2. Followed by the degree of the nodes

        Args:
            label (str): Label of the starting node
            max_depth (int, optional): Maximum depth of the subgraph,Defaults to 3
            max_nodes: Maxiumu nodes to return
            file_path (str, optional): Filter by source file path (supports partial matching)

        Returns:
            Dict[str, List[str]]: Knowledge graph for label
        """
        try:
            # Log the label parameter to check for leading spaces
            logger.debug(
                f"get_knowledge_graph called with label: '{label}' (length: {len(label)}, repr: {repr(label)})"
            )

            # DEBUG: Log received filter parameters
            logger.info(
                f"DEBUG get_knowledge_graph: Received filters - "
                f"project_id={repr(project_id)}, owner={repr(owner)}, tags={repr(tags)}, "
                f"current_user.is_authenticated={current_user.is_authenticated}"
            )

            filters = AccessFilters(
                project_id=project_id,
                owner=owner,
                tags=normalize_tag_items(tags),
            )

            # DEBUG: Log normalized filters
            logger.info(
                f"DEBUG get_knowledge_graph: Normalized filters - "
                f"project_id={repr(filters.project_id)}, owner={repr(filters.owner)}, tags={filters.tags}"
            )

            accessible_docs = await get_user_accessible_files(
                rag.doc_status,
                current_user,
                project_id=filters.project_id,
                include_shared=True,
                include_public=True,
                filters=filters,
                required_permission=Permission.VIEW,
            )

            # DEBUG: Log accessible documents count
            logger.info(
                f"DEBUG get_knowledge_graph: Found {len(accessible_docs)} accessible documents"
            )

            if not accessible_docs:
                raise HTTPException(
                    status_code=403,
                    detail="No accessible documents found for the provided metadata filters.",
                )

            graph = await rag.get_knowledge_graph(
                node_label=label,
                max_depth=max_depth,
                max_nodes=max_nodes,
                file_path=file_path,
            )

            accessible_paths = [
                path
                for path in (
                    doc_file_path(status) for status in accessible_docs.values()
                )
                if path
            ]

            def node_accessible(node: Any) -> bool:
                props = getattr(node, "properties", None)
                if props is None and isinstance(node, dict):
                    props = node.get("properties")
                if not isinstance(props, dict):
                    return True

                file_values: list[str] = []
                for key in ("file_path", "file_paths", "sources", "documents"):
                    value = props.get(key)
                    if isinstance(value, str):
                        file_values.append(value)
                    elif isinstance(value, list):
                        file_values.extend(
                            [str(v) for v in value if isinstance(v, str)]
                        )

                if not file_values:
                    return True

                return any(
                    any(access_path in candidate for access_path in accessible_paths)
                    for candidate in file_values
                )

            def to_dict(item: Any) -> Dict[str, Any]:
                if hasattr(item, "model_dump"):
                    return item.model_dump()
                if hasattr(item, "dict"):
                    return item.dict()
                return item

            graph_dict = to_dict(graph)
            nodes = graph_dict.get("nodes", [])
            filtered_nodes = [node for node in nodes if node_accessible(node)]
            allowed_ids = {
                (
                    node.get("id")
                    if isinstance(node, dict)
                    else getattr(node, "id", None)
                )
                for node in filtered_nodes
            }

            edges = graph_dict.get("edges", [])
            filtered_edges = []
            for edge in edges:
                edge_dict = to_dict(edge)
                if (
                    edge_dict.get("source") in allowed_ids
                    and edge_dict.get("target") in allowed_ids
                ):
                    filtered_edges.append(edge)

            graph_dict["nodes"] = filtered_nodes
            graph_dict["edges"] = filtered_edges

            if hasattr(graph.__class__, "model_validate"):
                return graph.__class__.model_validate(graph_dict)

            return graph_dict
        except Exception as e:
            logger.error(f"Error getting knowledge graph for label '{label}': {str(e)}")
            logger.error(traceback.format_exc())
            raise HTTPException(
                status_code=500, detail=f"Error getting knowledge graph: {str(e)}"
            )

    @router.get("/graph/entity/exists", dependencies=[Depends(combined_auth)])
    async def check_entity_exists(
        name: str = Query(..., description="Entity name to check"),
    ):
        """
        Check if an entity with the given name exists in the knowledge graph

        Args:
            name (str): Name of the entity to check

        Returns:
            Dict[str, bool]: Dictionary with 'exists' key indicating if entity exists
        """
        try:
            exists = await rag.chunk_entity_relation_graph.has_node(name)
            return {"exists": exists}
        except Exception as e:
            logger.error(f"Error checking entity existence for '{name}': {str(e)}")
            logger.error(traceback.format_exc())
            raise HTTPException(
                status_code=500, detail=f"Error checking entity existence: {str(e)}"
            )

    @router.post("/graph/entity/edit", dependencies=[Depends(combined_auth)])
    async def update_entity(request: EntityUpdateRequest):
        """
        Update an entity's properties in the knowledge graph

        Args:
            request (EntityUpdateRequest): Request containing entity name, updated data, and rename flag

        Returns:
            Dict: Updated entity information
        """
        try:
            result = await rag.aedit_entity(
                entity_name=request.entity_name,
                updated_data=request.updated_data,
                allow_rename=request.allow_rename,
            )
            return {
                "status": "success",
                "message": "Entity updated successfully",
                "data": result,
            }
        except ValueError as ve:
            logger.error(
                f"Validation error updating entity '{request.entity_name}': {str(ve)}"
            )
            raise HTTPException(status_code=400, detail=str(ve))
        except Exception as e:
            logger.error(f"Error updating entity '{request.entity_name}': {str(e)}")
            logger.error(traceback.format_exc())
            raise HTTPException(
                status_code=500, detail=f"Error updating entity: {str(e)}"
            )

    @router.post("/graph/relation/edit", dependencies=[Depends(combined_auth)])
    async def update_relation(request: RelationUpdateRequest):
        """Update a relation's properties in the knowledge graph

        Args:
            request (RelationUpdateRequest): Request containing source ID, target ID and updated data

        Returns:
            Dict: Updated relation information
        """
        try:
            result = await rag.aedit_relation(
                source_entity=request.source_id,
                target_entity=request.target_id,
                updated_data=request.updated_data,
            )
            return {
                "status": "success",
                "message": "Relation updated successfully",
                "data": result,
            }
        except ValueError as ve:
            logger.error(
                f"Validation error updating relation between '{request.source_id}' and '{request.target_id}': {str(ve)}"
            )
            raise HTTPException(status_code=400, detail=str(ve))
        except Exception as e:
            logger.error(
                f"Error updating relation between '{request.source_id}' and '{request.target_id}': {str(e)}"
            )
            logger.error(traceback.format_exc())
            raise HTTPException(
                status_code=500, detail=f"Error updating relation: {str(e)}"
            )

    return router
