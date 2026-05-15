from typing import TYPE_CHECKING, Any

from sqlalchemy import Enum as SAEnum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import TimestampedModel
from models.enums import TicketSeverity, TicketStatus

if TYPE_CHECKING:
    from models.session import Session


class Ticket(TimestampedModel):
    __tablename__ = "tickets"

    jira_issue_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    jira_issue_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    session_id: Mapped[PGUUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[TicketSeverity] = mapped_column(
        SAEnum(TicketSeverity, native_enum=False, length=20),
        default=TicketSeverity.medium,
        nullable=False,
        index=True,
    )
    status: Mapped[TicketStatus] = mapped_column(
        SAEnum(TicketStatus, native_enum=False, length=20),
        default=TicketStatus.open,
        nullable=False,
        index=True,
    )
    product_module: Mapped[str | None] = mapped_column(String(255), nullable=True)
    environment: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_messages: Mapped[str | None] = mapped_column(Text, nullable=True)
    steps_to_reproduce: Mapped[str | None] = mapped_column(Text, nullable=True)
    troubleshooting_attempted: Mapped[str | None] = mapped_column(Text, nullable=True)
    conversation_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    doc_references: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )
    jira_comments: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSONB, nullable=True
    )
    assignee: Mapped[str | None] = mapped_column(String(100), nullable=True)
    jira_synced: Mapped[bool] = mapped_column(default=False)

    session: Mapped["Session | None"] = relationship(
        "Session", back_populates="tickets"
    )
