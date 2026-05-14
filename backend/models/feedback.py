import uuid
from typing import TYPE_CHECKING
from sqlalchemy import ForeignKey, String, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from models.base import TimestampedModel

if TYPE_CHECKING:
    from models.user import User

class Feedback(TimestampedModel):
    __tablename__ = "feedbacks"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=True)

    user: Mapped["User"] = relationship("User")
