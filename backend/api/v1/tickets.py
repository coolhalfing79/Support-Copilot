"""Ticket API endpoints (Admin View)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from api.dependencies import DbSession
from schemas.ticket import (
    IssueTypeListResponse,
    IssueTypeResponse,
    TicketCommentRequest,
    TicketCommentResponse,
    TicketDetailResponse,
    TicketEscalateRequest,
    TicketEscalateResponse,
    TicketListResponse,
    TicketResponse,
    TicketSyncResponse,
    TicketUpdate,
    TicketUpdateResponse,
)
from services.service_factory import get_ticket_service, get_jira_client

router = APIRouter()


@router.get(
    "",
    response_model=TicketListResponse,
)
async def list_tickets(
    db: DbSession,
    status_filter: str | None = Query(None, alias="status"),
    severity: str | None = Query(None),
    refresh: bool = Query(False),
) -> TicketListResponse:
    """List tickets with optional status/severity filters.
    
    If refresh=True, syncs each ticket's status from Jira before returning.
    """
    ticket_service = get_ticket_service()
    tickets = await ticket_service.list_tickets_with_jira_status(
        db=db, status=status_filter, severity=severity, refresh_from_jira=refresh
    )
    return TicketListResponse(
        tickets=[TicketResponse.model_validate(t) for t in tickets]
    )


@router.get(
    "/{ticket_id}",
    response_model=TicketDetailResponse,
)
async def get_ticket(ticket_id: UUID, db: DbSession) -> TicketDetailResponse:
    """Get a single ticket by ID."""
    ticket_service = get_ticket_service()
    ticket = await ticket_service.get_ticket(db, str(ticket_id))
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticket {ticket_id} not found",
        )
    return TicketDetailResponse(ticket=TicketResponse.model_validate(ticket))


@router.post(
    "/escalate",
    response_model=TicketEscalateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def escalate_ticket(
    body: TicketEscalateRequest,
    db: DbSession,
) -> TicketEscalateResponse:
    """Manually escalate a chat session to a Jira ticket."""
    ticket_service = get_ticket_service()
    try:
        ticket = await ticket_service.create_manual_ticket(
            db=db,
            session_id=str(body.session_id),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    return TicketEscalateResponse(
        ticket=TicketResponse.model_validate(ticket),
        jira_key=ticket.jira_issue_key,
    )


@router.put(
    "/{ticket_id}",
    response_model=TicketUpdateResponse,
)
async def update_ticket(
    ticket_id: UUID,
    body: TicketUpdate,
    db: DbSession,
) -> TicketUpdateResponse:
    """Update ticket status or severity."""
    ticket_service = get_ticket_service()
    update_data = body.model_dump(exclude_none=True)
    ticket = await ticket_service.update_ticket(db, str(ticket_id), **update_data)
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticket {ticket_id} not found",
        )
    return TicketUpdateResponse(ticket=TicketResponse.model_validate(ticket))


@router.post(
    "/{ticket_id}/comment",
    response_model=TicketCommentResponse,
)
async def add_ticket_comment(
    ticket_id: UUID,
    body: TicketCommentRequest,
    db: DbSession,
) -> TicketCommentResponse:
    """Add a comment to a ticket and sync to Jira."""
    ticket_service = get_ticket_service()
    comment = await ticket_service.add_comment_to_ticket(
        db, str(ticket_id), body.comment, body.source
    )
    if comment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticket {ticket_id} not found",
        )
    return TicketCommentResponse(comment=comment)


@router.post(
    "/sync",
    response_model=TicketSyncResponse,
)
async def sync_all_tickets(db: DbSession) -> TicketSyncResponse:
    """Sync all tickets' status from Jira."""
    ticket_service = get_ticket_service()
    tickets = await ticket_service.list_tickets(db)
    updated_count = 0
    for ticket in tickets:
        if ticket.jira_issue_key:
            updated = await ticket_service.sync_ticket_to_jira(db, str(ticket.id))
            if updated:
                updated_count += 1
    
    return TicketSyncResponse(
        updated_count=updated_count,
        message=f"Successfully synced {updated_count} tickets from Jira",
    )


@router.get(
    "/jira/issue-types",
    response_model=IssueTypeListResponse,
)
async def get_issue_types() -> IssueTypeListResponse:
    """Get available Jira issue types."""
    jira_client = get_jira_client()
    issue_types = await jira_client.get_issue_types()
    return IssueTypeListResponse(
        issue_types=[IssueTypeResponse(**it) for it in issue_types]
    )
