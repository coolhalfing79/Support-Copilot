from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator


class SessionStatus(str, Enum):
    active = "active"
    resolved = "resolved"
    escalated = "escalated"


class MessageRole(str, Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


class Action(str, Enum):
    resolve = "resolve"
    clarification = "clarification"
    escalated = "escalated"
    searching = "searching"


class SourceInfo(BaseModel):
    model_config = ConfigDict(extra="allow")

    source_id: str
    title: str
    url: str | None = None
    chunk_excerpt: str | None = None


class TicketInfo(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    jira_issue_key: str | None = None
    jira_url: str | None = None
    summary: str
    severity: str
    status: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    follow_up_responses: list[str] | None = None


class ChatResponse(BaseModel):
    session_id: str
    message_id: str
    response: str
    sources: list[SourceInfo] = []
    action: Action
    follow_up_questions: list[str] | None = None
    ticket: TicketInfo | None = None


class SessionCreate(BaseModel):
    """Optional body for session creation — empty JSON object is valid."""

    model_config = ConfigDict(extra="allow")


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str | None = None
    status: SessionStatus

    @field_validator("status", mode="before")
    @classmethod
    def _coerce_session_status(cls, value: SessionStatus | str | Enum) -> SessionStatus:
        if isinstance(value, SessionStatus):
            return value
        if isinstance(value, Enum):
            return SessionStatus(value.value)
        return SessionStatus(value)
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def session_id(self) -> str:
        """Wire-compat with architecture docs that use `session_id` instead of `id`."""
        return str(self.id)


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_id: UUID
    role: MessageRole
    content: str
    confidence_score: float | None = None
    sources: Any | None = None
    action: Action | None = None
    ticket: TicketInfo | None = None
    created_at: datetime

    @field_validator("role", mode="before")
    @classmethod
    def _coerce_role(cls, value: MessageRole | str | Enum) -> MessageRole:
        if isinstance(value, MessageRole):
            return value
        if isinstance(value, Enum):
            return MessageRole(value.value)
        return MessageRole(value)


class SessionDetailResponse(SessionResponse):
    messages: list[MessageResponse]


class SessionListResponse(BaseModel):
    sessions: list[SessionResponse]
