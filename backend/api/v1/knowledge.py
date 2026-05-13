"""Knowledge Management API endpoints (Admin View)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from api.dependencies import DbSession
from schemas.knowledge import (
    KnowledgeSourceCreate,
    KnowledgeSourceCreateAccepted,
    KnowledgeSourceDeleteResponse,
    KnowledgeSourceListResponse,
    KnowledgeSourceResponse,
)
from services.service_factory import get_knowledge_service

router = APIRouter()


@router.post(
    "/sources",
    response_model=KnowledgeSourceCreateAccepted,
    status_code=status.HTTP_202_ACCEPTED,
)
async def add_knowledge_source(
    body: KnowledgeSourceCreate,
    db: DbSession,
    background_tasks: BackgroundTasks,
) -> KnowledgeSourceCreateAccepted:
    """Add a new knowledge source URL and start background ingestion."""
    knowledge_service = get_knowledge_service()
    source = await knowledge_service.add_source(
        db=db,
        url=body.url,
        title=body.title,
        source_type=body.source_type.value if hasattr(body.source_type, "value") else body.source_type,
        max_pages=body.max_pages,
    )
    # Kick off ingestion in the background.
    background_tasks.add_task(knowledge_service.ingest_source, str(source.id))
    return KnowledgeSourceCreateAccepted(source_id=source.id, status=source.status)


@router.get(
    "/sources",
    response_model=KnowledgeSourceListResponse,
)
async def list_knowledge_sources(db: DbSession) -> KnowledgeSourceListResponse:
    """List all knowledge sources with their status."""
    knowledge_service = get_knowledge_service()
    sources = await knowledge_service.list_sources(db)
    return KnowledgeSourceListResponse(
        sources=[KnowledgeSourceResponse.model_validate(s) for s in sources]
    )


@router.delete(
    "/sources/{source_id}",
    response_model=KnowledgeSourceDeleteResponse,
)
async def delete_knowledge_source(
    source_id: UUID,
    db: DbSession,
) -> KnowledgeSourceDeleteResponse:
    """Delete a knowledge source and its chunks."""
    knowledge_service = get_knowledge_service()
    deleted = await knowledge_service.delete_source(db, str(source_id))
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Knowledge source {source_id} not found",
        )
    return KnowledgeSourceDeleteResponse(success=True)


@router.post(
    "/sources/{source_id}/reindex",
    response_model=KnowledgeSourceResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def reindex_knowledge_source(
    source_id: UUID,
    db: DbSession,
    background_tasks: BackgroundTasks,
) -> KnowledgeSourceResponse:
    """Re-index a knowledge source."""
    knowledge_service = get_knowledge_service()
    source = await knowledge_service.get_source(db, str(source_id))
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Knowledge source {source_id} not found",
        )
    # Mark as processing immediately.
    source.status = "processing"
    await db.flush()
    await db.refresh(source)

    background_tasks.add_task(knowledge_service.reindex_source, str(source_id))
    return KnowledgeSourceResponse.model_validate(source)
