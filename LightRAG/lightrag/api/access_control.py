"""Access control utilities for LightRAG API.

This module centralizes:

* JWT-based current-user extraction helpers used as FastAPI dependencies.
* Metadata normalization helpers (tags/share) used during document ingestion.
* Permission evaluation helpers that gate access to documents, chunks, and graph
  entities using metadata supplied during upload.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Iterable, List, Optional

from fastapi import HTTPException, Security, status
from fastapi.security import OAuth2PasswordBearer

from lightrag.base import DocProcessingStatus, DocStatus, QueryParam
from lightrag.constants import GRAPH_FIELD_SEP

from .auth import auth_handler

# Reuse existing OAuth2 scheme (optional auth)
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)


class Permission(str, Enum):
    """Supported permission levels extracted from share metadata."""

    VIEW = "view"
    EDIT = "edit"

    @classmethod
    def from_value(cls, value: str) -> "Permission":
        try:
            return cls(value.lower())
        except ValueError as exc:
            raise ValueError(f"Unsupported permission '{value}'") from exc


@dataclass(frozen=True)
class ShareEntry:
    """Represents a single share rule in the metadata."""

    target_type: str  # "user" | "role"
    permission: Permission
    identifier: str

    def matches_user(self, user_id: Optional[str], user_roles: Iterable[str]) -> bool:
        """Check whether this entry targets the given user or any of their roles.
        
        Supports wildcards: 'all' or '*' in user target_type matches any authenticated user.
        """

        if self.target_type == "user" and user_id:
            # Support wildcards for "all users"
            if self.identifier.lower() in ("all", "*"):
                return True
            return self.identifier == user_id
        if self.target_type == "role":
            # Support wildcards for "all roles"
            if self.identifier.lower() in ("all", "*"):
                return True
            return self.identifier in user_roles
        return False

    def allows(self, required: Permission) -> bool:
        """Evaluate whether this entry satisfies the requested permission level."""

        if self.permission == Permission.EDIT:
            return True  # edit implies view
        return self.permission == required

    def as_dict(self) -> Dict[str, str]:
        return {
            "target_type": self.target_type,
            "permission": self.permission.value,
            "identifier": self.identifier,
        }

    def as_string(self) -> str:
        return f"{self.target_type}:{self.permission.value}:{self.identifier}"


@dataclass
class AccessFilters:
    """Query-time access filters supplied by the caller."""

    project_id: Optional[str] = None
    owner: Optional[str] = None
    tags: List[Dict[str, str]] = field(default_factory=list)
    filename: Optional[str] = None


class CurrentUser:
    """
    Container for current user information extracted from JWT token
    
    Attributes:
        username: Username from token
        user_id: Unique user identifier (from metadata or username)
        role: User role (e.g., "user", "admin", "guest")
        metadata: Additional metadata from token
        is_authenticated: Whether user has valid authentication
    """
    
    def __init__(
        self,
        username: Optional[str] = None,
        user_id: Optional[str] = None,
        role: str = "guest",
        metadata: Optional[dict] = None,
        is_authenticated: bool = False,
        roles: Optional[List[str]] = None,
    ):
        self.username = username
        self.user_id = user_id or username  # Use username as fallback
        self.role = role
        self.metadata = metadata or {}
        self.is_authenticated = is_authenticated
        # Normalize roles from explicit parameter or metadata payload
        role_values: List[str] = []
        if role:
            role_values.append(role)
        if roles:
            role_values.extend(roles)
        token_roles = self.metadata.get("roles", [])
        if isinstance(token_roles, (list, tuple)):
            role_values.extend([str(r) for r in token_roles])
        elif isinstance(token_roles, str):
            role_values.append(token_roles)
        self.roles = sorted({r for r in role_values if r})

    def has_role(self, role: str) -> bool:
        """
        Check if user has a specific role

        Args:
            role: Role name to check
            
        Returns:
            True if user has the role
        """
        return role == self.role or role in self.roles

    def __repr__(self):
        return f"CurrentUser(user_id={self.user_id}, role={self.role}, authenticated={self.is_authenticated})"


async def get_current_user_optional(
    token: Optional[str] = Security(oauth2_scheme_optional)
) -> CurrentUser:
    """
    Extract user information from JWT token (OPTIONAL - doesn't fail if no token)
    
    This function is used as a FastAPI dependency to extract user information
    from the JWT token in the Authorization header. If no token is provided
    or the token is invalid, returns an unauthenticated guest user.
    
    Args:
        token: JWT token from Authorization header (automatically extracted)
        
    Returns:
        CurrentUser object (may be unauthenticated)
        
    Example:
        @router.post("/endpoint")
        async def endpoint(current_user: CurrentUser = Depends(get_current_user_optional)):
            if current_user.is_authenticated:
                print(f"User: {current_user.user_id}")
            else:
                print("Unauthenticated user")
    """
    # No token provided - unauthenticated user
    if not token:
        return CurrentUser(is_authenticated=False, role="guest")
    
    try:
        # Use existing auth_handler to validate token
        token_info = auth_handler.validate_token(token)
        
        # Extract user information from token
        # token_info = {"username": str, "role": str, "metadata": dict, "exp": datetime}
        return CurrentUser(
            username=token_info.get("username"),
            user_id=token_info.get("metadata", {}).get("user_id") or token_info.get("username"),
            role=token_info.get("role", "user"),
            metadata=token_info.get("metadata", {}),
            is_authenticated=True,
            roles=token_info.get("metadata", {}).get("roles"),
        )
        
    except Exception:
        # Invalid token - treat as unauthenticated (don't raise error for optional auth)
        return CurrentUser(is_authenticated=False, role="guest")


async def get_current_user_required(
    token: Optional[str] = Security(oauth2_scheme_optional)
) -> CurrentUser:
    """
    Extract user information from JWT token (REQUIRED - fails if no valid token)
    
    This function is used as a FastAPI dependency for endpoints that require
    authentication. Raises 401 Unauthorized if no token or invalid token.
    
    Args:
        token: JWT token from Authorization header (automatically extracted)
        
    Returns:
        CurrentUser object (always authenticated)
        
    Raises:
        HTTPException: 401 if no token or invalid token
        
    Example:
        @router.post("/protected-endpoint")
        async def endpoint(current_user: CurrentUser = Depends(get_current_user_required)):
            print(f"Authenticated user: {current_user.user_id}")
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Validate token (will raise HTTPException if invalid)
    token_info = auth_handler.validate_token(token)
    
    # Extract user information
    return CurrentUser(
        username=token_info.get("username"),
        user_id=token_info.get("metadata", {}).get("user_id") or token_info.get("username"),
        role=token_info.get("role", "user"),
        metadata=token_info.get("metadata", {}),
        is_authenticated=True,
        roles=token_info.get("metadata", {}).get("roles"),
    )


# ---------------------------------------------------------------------------
# Metadata normalization helpers
# ---------------------------------------------------------------------------

def normalize_tag_items(raw_tags: Any) -> List[Dict[str, str]]:
    """Normalize user-supplied tag payload into a list of name/value dicts.

    Acceptable inputs:
    * None -> []
    * dict -> {name: value}
    * list of dicts {'name': ..., 'value': ...}
    * list of strings "name:value" or "name"
    * single string containing JSON array or comma separated entries
    """

    if raw_tags is None or raw_tags == "":
        return []

    def _coerce_entry(entry: Any) -> Optional[Dict[str, str]]:
        if entry is None:
            return None
        if isinstance(entry, dict):
            name = str(entry.get("name", "")).strip()
            value = str(entry.get("value", "")).strip()
            if not name:
                return None
            return {"name": name, "value": value}
        if isinstance(entry, str):
            parts = entry.split(":", 1)
            name = parts[0].strip()
            value = parts[1].strip() if len(parts) == 2 else ""
            if not name:
                return None
            return {"name": name, "value": value}
        return None

    normalized: List[Dict[str, str]] = []

    if isinstance(raw_tags, str):
        raw_str = raw_tags.strip()
        if not raw_str:
            return []
        try:
            import json

            parsed = json.loads(raw_str)
        except (json.JSONDecodeError, TypeError):
            parsed = [item.strip() for item in raw_str.split(",") if item.strip()]
        raw_iterable = parsed if isinstance(parsed, list) else [parsed]
    elif isinstance(raw_tags, dict):
        raw_iterable = [{"name": k, "value": v} for k, v in raw_tags.items()]
    else:
        raw_iterable = raw_tags

    for entry in raw_iterable:
        coerced = _coerce_entry(entry)
        if coerced:
            normalized.append(coerced)

    # Deduplicate while preserving order
    seen = set()
    unique: List[Dict[str, str]] = []
    for item in normalized:
        key = (item["name"], item["value"])
        if key not in seen:
            seen.add(key)
            unique.append(item)

    return unique


def parse_share_entry(entry: str) -> ShareEntry:
    """Parse a colon-delimited share entry string."""

    parts = [part.strip() for part in entry.split(":") if part.strip()]
    if len(parts) != 3:
        raise ValueError(
            "Share entries must follow 'target_type:permission:identifier' format"
        )
    target_type, permission_raw, identifier = parts
    target_type = target_type.lower()
    if target_type not in {"user", "role"}:
        raise ValueError(f"Unsupported share target_type '{target_type}'")
    permission = Permission.from_value(permission_raw)
    if not identifier:
        raise ValueError("Share entry identifier cannot be empty")
    return ShareEntry(target_type=target_type, permission=permission, identifier=identifier)


def normalize_share_items(raw_share: Any) -> List[ShareEntry]:
    """Normalize user-supplied share payload into ShareEntry objects."""

    if raw_share is None or raw_share == "":
        return []

    if isinstance(raw_share, ShareEntry):
        return [raw_share]

    if isinstance(raw_share, dict):
        raw_share = [raw_share]

    entries: List[ShareEntry] = []

    if isinstance(raw_share, str):
        raw_str = raw_share.strip()
        if not raw_str:
            return []
        try:
            import json

            parsed = json.loads(raw_str)
        except (json.JSONDecodeError, TypeError):
            parsed = [item.strip() for item in raw_str.split(",") if item.strip()]
        raw_iterable = parsed if isinstance(parsed, list) else [parsed]
    else:
        raw_iterable = raw_share

    for item in raw_iterable:
        if isinstance(item, ShareEntry):
            entries.append(item)
            continue
        if isinstance(item, dict):
            try:
                entry = ShareEntry(
                    target_type=str(item.get("target_type", "")).strip().lower(),
                    permission=Permission.from_value(str(item.get("permission", "view"))),
                    identifier=str(item.get("identifier", "")).strip(),
                )
            except ValueError:
                continue
        else:
            try:
                entry = parse_share_entry(str(item))
            except ValueError:
                continue
        if entry.identifier:
            entries.append(entry)

    # Deduplicate by (target_type, permission, identifier)
    seen = set()
    sanitized: List[ShareEntry] = []
    for entry in entries:
        key = (entry.target_type, entry.permission.value, entry.identifier)
        if key not in seen:
            seen.add(key)
            sanitized.append(entry)

    return sanitized


def metadata_owner(metadata: Dict[str, Any]) -> Optional[str]:
    """Resolve owner from metadata with backwards compatibility."""

    owner = metadata.get("owner") or metadata.get("user_id")
    if owner:
        return str(owner)
    return None


def metadata_tags(metadata: Dict[str, Any]) -> List[Dict[str, str]]:
    tags = metadata.get("tags", [])
    return normalize_tag_items(tags)


def metadata_share_entries(metadata: Dict[str, Any]) -> List[ShareEntry]:
    """Extract normalized share entries from metadata (new + legacy formats)."""

    entries: List[ShareEntry] = []

    for key in ("share_parsed", "share"):
        raw_value = metadata.get(key)
        if raw_value:
            entries.extend(normalize_share_items(raw_value))

    # Legacy access_control mapping
    access_control = metadata.get("access_control")
    if isinstance(access_control, dict):
        owner = access_control.get("owner")
        if owner:
            entries.append(
                ShareEntry(target_type="user", permission=Permission.EDIT, identifier=str(owner))
            )
        for viewer in access_control.get("viewers", []) or []:
            entries.append(
                ShareEntry(target_type="user", permission=Permission.VIEW, identifier=str(viewer))
            )
        for editor in access_control.get("editors", []) or []:
            entries.append(
                ShareEntry(target_type="user", permission=Permission.EDIT, identifier=str(editor))
            )

    # Deduplicate
    deduped: List[ShareEntry] = []
    seen = set()
    for entry in entries:
        key = (entry.target_type, entry.permission.value, entry.identifier)
        if key not in seen:
            seen.add(key)
            deduped.append(entry)

    return deduped


def metadata_matches_filters(metadata: Dict[str, Any], filters: AccessFilters) -> bool:
    """Check whether metadata satisfies caller-provided filters."""

    if filters.project_id and metadata.get("project_id") != filters.project_id:
        return False
    owner = metadata_owner(metadata)
    if filters.owner and owner != filters.owner:
        return False
    if filters.tags:
        doc_tags = metadata_tags(metadata)
        doc_lookup = {(tag["name"], tag["value"]) for tag in doc_tags}
        for tag_filter in filters.tags:
            expected = (tag_filter.get("name"), tag_filter.get("value", ""))
            if expected not in doc_lookup:
                return False
    # Note: filename filtering is handled separately in get_user_accessible_files
    # by checking the DocProcessingStatus.file_path field after metadata matching
    return True


# ---------------------------------------------------------------------------
# Access evaluation helpers
# ---------------------------------------------------------------------------

async def get_user_accessible_files(
    doc_status_storage,
    current_user: CurrentUser,
    project_id: Optional[str] = None,
    include_shared: bool = True,
    include_public: bool = True,
    required_permission: Permission = Permission.VIEW,
    filters: Optional[AccessFilters] = None,
) -> dict[str, DocProcessingStatus]:
    """
    Get mapping of document IDs to statuses that the user can access.

    This function filters documents based on:
    - Ownership (user owns the document)
    - Access control lists (user is in viewers or editors)
    - Role-based access (user has required role)
    - Public access (document is marked as public)
    - Project scoping (optional filter by project)
    
    Args:
        doc_status_storage: Document status storage instance
        current_user: Current user from JWT token (may be unauthenticated)
        project_id: Optional project ID to filter documents
        include_shared: Include documents shared with user (default: True)
        include_public: Include public documents (default: True)
        required_permission: Permission required for the operation (view/edit)
        filters: Additional metadata filters supplied by caller
        
    Returns:
        Dict mapping doc_id -> DocProcessingStatus
        
    Example:
        accessible_files = await get_user_accessible_files(
            rag.doc_status,
            current_user,
            project_id="project_123",
            include_shared=True,
            include_public=True
        )
        # Returns: ["doc1.pdf", "doc2.pdf", "doc3.pdf"]
    """
    filters = filters or AccessFilters(project_id=project_id)
    # Get all processed documents
    all_docs = await doc_status_storage.get_docs_by_status(DocStatus.PROCESSED)
    accessible_docs: dict[str, DocProcessingStatus] = {}
    
    # DEBUG: Log total documents found
    from lightrag.utils import logger
    logger.info(f"DEBUG get_user_accessible_files: Found {len(all_docs)} PROCESSED documents")
    logger.info(
        f"DEBUG get_user_accessible_files: Filters - project_id={repr(filters.project_id)}, "
        f"owner={repr(filters.owner)}, tags={filters.tags}, "
        f"current_user.is_authenticated={current_user.is_authenticated}"
    )

    for doc_id, doc_status in all_docs.items():
        metadata_source = getattr(doc_status, "metadata", None)
        if metadata_source is None and isinstance(doc_status, dict):
            metadata_source = doc_status.get("metadata")
        metadata = (metadata_source or {}).copy()

        # DEBUG: Log metadata check
        matches_filters = metadata_matches_filters(metadata, filters)
        if not matches_filters:
            logger.info(
                f"DEBUG get_user_accessible_files: Doc {doc_id} EXCLUDED by metadata filter. "
                f"Doc has project_id={repr(metadata.get('project_id'))}, owner={repr(metadata_owner(metadata))}, "
                f"tags={metadata_tags(metadata)}"
            )
            continue

        # Apply filename filter if provided (checks doc_status.file_path field)
        if filters.filename:
            file_path = doc_file_path(doc_status)
            if not file_path or filters.filename not in file_path:
                logger.info(
                    f"DEBUG get_user_accessible_files: Doc {doc_id} EXCLUDED by filename filter. "
                    f"Expected '{filters.filename}' in '{file_path}'"
                )
                continue

        # Check if document is public (no access control)
        is_public = bool(metadata.get("is_public", False))

        # Unauthenticated users can only see public documents
        if not current_user.is_authenticated:
            if is_public and include_public:
                accessible_docs[doc_id] = doc_status
                logger.info(f"DEBUG get_user_accessible_files: Doc {doc_id} ACCESSIBLE (public, unauthenticated user)")
            else:
                logger.info(
                    f"DEBUG get_user_accessible_files: Doc {doc_id} NOT ACCESSIBLE "
                    f"(unauthenticated user, is_public={is_public}, include_public={include_public})"
                )
            continue

        # Authenticated user access checks
        user_id = current_user.user_id
        user_roles = current_user.roles or []

        # Ownership grants full access (check both owner and uploaded_by)
        owner_id = metadata_owner(metadata)
        is_owner = owner_id == user_id if owner_id and user_id else False
        
        # Also check if user uploaded the document
        uploaded_by = metadata.get("uploaded_by")
        is_uploader = uploaded_by == user_id if uploaded_by and user_id else False

        # Share entries
        share_entries = metadata_share_entries(metadata)

        # Check role-based access (legacy allowed_roles list)
        allowed_roles = metadata.get("allowed_roles", []) or []
        has_role_access = any(role in user_roles for role in allowed_roles)

        # Determine if user has access (use OR logic, not elif chain)
        has_access = False

        # Check 1: User is the owner or uploader
        if is_owner or is_uploader:
            has_access = True
        
        # Check 2: Document is shared with user (if not already granted access)
        if not has_access and include_shared and share_entries:
            for entry in share_entries:
                if entry.matches_user(user_id, user_roles) and entry.allows(required_permission):
                    has_access = True
                    break
        
        # Check 3: User has role-based access (if not already granted access)
        if not has_access and has_role_access and required_permission == Permission.VIEW:
            has_access = True
        
        # Check 4: Document is public (if not already granted access)
        if not has_access and is_public and include_public and required_permission == Permission.VIEW:
            has_access = True

        if has_access:
            accessible_docs[doc_id] = doc_status
            logger.info(
                f"DEBUG get_user_accessible_files: Doc {doc_id} ACCESSIBLE "
                f"(authenticated user, is_owner={is_owner}, is_uploader={is_uploader}, "
                f"has_share_access={include_shared and share_entries}, "
                f"has_role_access={has_role_access}, is_public={is_public})"
            )
        else:
            logger.info(
                f"DEBUG get_user_accessible_files: Doc {doc_id} NOT ACCESSIBLE "
                f"(authenticated user {user_id}, is_owner={is_owner}, is_uploader={is_uploader}, "
                f"share_entries={len(share_entries)}, has_role_access={has_role_access}, is_public={is_public})"
            )

    logger.info(f"DEBUG get_user_accessible_files: Returning {len(accessible_docs)} accessible documents")
    return accessible_docs


async def filter_chunks_by_access(
    chunks: list[dict],
    accessible_files: dict[str, DocProcessingStatus]
) -> list[dict]:
    """
    Filter chunks to only those from accessible files
    
    Args:
        chunks: List of chunk dictionaries with file_path field
        accessible_files: Mapping of accessible doc IDs to status objects
        
    Returns:
        Filtered list of chunks
    """
    accessible_paths = {
        path for path in (doc_file_path(status) for status in accessible_files.values()) if path
    }

    return [
        chunk
        for chunk in chunks
        if any(access_path in (chunk.get("file_path") or "") for access_path in accessible_paths)
    ]


async def filter_entities_by_access(
    entities: list[dict],
    accessible_files: dict[str, DocProcessingStatus]
) -> list[dict]:
    """
    Filter entities to only those from accessible files
    
    Entities can have multiple file_paths (when entity appears in multiple documents)
    separated by GRAPH_FIELD_SEP ("<SEP>"). An entity is accessible if ANY of its
    file_paths are accessible.
    
    Args:
        entities: List of entity dictionaries with file_path field
        accessible_files: List of file_path strings user can access
        
    Returns:
        Filtered list of entities
    """
    filtered = []
    for entity in entities:
        # Entities can have multiple file_paths separated by <SEP>
        entity_file_paths = entity.get("file_path", "").split(GRAPH_FIELD_SEP)
        
        # Check if ANY of the entity's file_paths are accessible
        for accessible_status in accessible_files.values():
            file_path = doc_file_path(accessible_status)
            if not file_path:
                continue
            if any(file_path in fp for fp in entity_file_paths):
                filtered.append(entity)
                break

    return filtered


def doc_file_path(doc_status: Any) -> Optional[str]:
    """Extract file_path from DocProcessingStatus or dict."""

    value = getattr(doc_status, "file_path", None)
    if value is None and isinstance(doc_status, dict):
        value = doc_status.get("file_path")
    return value

