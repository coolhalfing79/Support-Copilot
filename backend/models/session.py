import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SAEnum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import GUID, TimestampedModel
from models.enums import SessionStatus

if TYPE_CHECKING:
    from models.message import Message
    from models.ticket import Ticket
    from models.user import User


class Session(TimestampedModel):
    __tablename__ = "sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[SessionStatus] = mapped_column(
        SAEnum(SessionStatus, native_enum=False, length=20),
        default=SessionStatus.active,
        nullable=False,
        index=True,
    )

    user: Mapped["User"] = relationship("User", back_populates="sessions")
    messages: Mapped[list["Message"]] = relationship(
        "Message",
        back_populates="session",
        order_by="Message.created_at",
        cascade="all, delete-orphan",
    )
    tickets: Mapped[list["Ticket"]] = relationship(
        "Ticket",
        back_populates="session",
    )
