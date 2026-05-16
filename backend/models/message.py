import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import Enum as SAEnum, Float, ForeignKey, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import GUID, UUIDCreatedModel
from models.enums import MessageRole

if TYPE_CHECKING:
    from models.session import Session


class Message(UUIDCreatedModel):
    __tablename__ = "messages"

    session_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[MessageRole] = mapped_column(
        SAEnum(MessageRole, native_enum=False, length=20),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    sources: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(
        JSON, nullable=True
    )

    session: Mapped["Session"] = relationship("Session", back_populates="messages")
