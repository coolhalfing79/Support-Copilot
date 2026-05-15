from datetime import datetime
import enum
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TicketSeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class TicketStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"


class TicketCreate(BaseModel):
    session_id: UUID | None = None
    summary: str
    description: str | None = None
    severity: TicketSeverity = TicketSeverity.medium
    product_module: str | None = None
    environment: str | None = None
    error_messages: str | None = None
    steps_to_reproduce: str | None = None
    troubleshooting_attempted: str | None = None
    conversation_summary: str | None = None


class TicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    jira_issue_key: str | None = None
    jira_issue_id: str | None = None
    session_id: UUID | None = None
    summary: str
    description: str | None = None
    severity: TicketSeverity
    status: TicketStatus
    product_module: str | None = None
    environment: str | None = None
    error_messages: str | None = None
    steps_to_reproduce: str | None = None
    troubleshooting_attempted: str | None = None
    conversation_summary: str | None = None
    doc_references: dict[str, Any] | None = None
    jira_comments: list[dict[str, Any]] | None = None
    assignee: str | None = None
    jira_synced: bool = False
    created_at: datetime
    updated_at: datetime

    @field_validator("severity", mode="before")
    @classmethod
    def _coerce_severity(
        cls, value: TicketSeverity | str | enum.Enum
    ) -> TicketSeverity:
        if isinstance(value, TicketSeverity):
            return value
        if isinstance(value, enum.Enum):
            return TicketSeverity(value.value)
        return TicketSeverity(value)

    @field_validator("status", mode="before")
    @classmethod
    def _coerce_status(cls, value: TicketStatus | str | enum.Enum) -> TicketStatus:
        if isinstance(value, TicketStatus):
            return value
        if isinstance(value, enum.Enum):
            return TicketStatus(value.value)
        return TicketStatus(value)


class TicketListResponse(BaseModel):
    tickets: list[TicketResponse]


class TicketDetailResponse(BaseModel):
    ticket: TicketResponse


class TicketEscalateRequest(BaseModel):
    session_id: UUID


class TicketEscalateResponse(BaseModel):
    ticket: TicketResponse
    jira_key: str | None = None


class TicketUpdate(BaseModel):
    status: TicketStatus | None = None
    severity: TicketSeverity | None = None


class TicketUpdateResponse(BaseModel):
    ticket: TicketResponse


class TicketCommentRequest(BaseModel):
    comment: str
    source: str = "copilot"


class TicketCommentResponse(BaseModel):
    comment: dict[str, Any]


class IssueTypeResponse(BaseModel):
    id: str
    name: str
    subtask: bool
    iconUrl: str | None = None


class IssueTypeListResponse(BaseModel):
    issue_types: list[IssueTypeResponse]


class TicketSyncResponse(BaseModel):
    updated_count: int
    message: str
