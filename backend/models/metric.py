import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, Enum as SAEnum, JSON, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, GUID
from models.enums import MetricType


class Metric(Base):
    """Aggregate metrics row — uses recorded_at (not updated_at)."""

    __tablename__ = "metrics"

    id: Mapped[uuid.UUID] = mapped_column(
        GUID(), primary_key=True, default=uuid.uuid4
    )
    metric_type: Mapped[MetricType] = mapped_column(
        SAEnum(MetricType, native_enum=False, length=50),
        nullable=False,
        index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    value: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    metric_metadata: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata", JSON, nullable=True
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
