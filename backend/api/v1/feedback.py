from fastapi import APIRouter, HTTPException
from typing import Any
from pydantic import BaseModel, Field
import uuid

from api.dependencies import DbSession

router = APIRouter()

class FeedbackCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str
    category: str | None = "general"
    user_id: str | None = None

@router.post("")
async def create_feedback(
    feedback_in: FeedbackCreate,
    db: DbSession
) -> Any:
    """Create new user feedback."""
    from models.feedback import Feedback
    user_id = None
    if feedback_in.user_id:
        try:
            user_id = uuid.UUID(feedback_in.user_id)
        except ValueError:
            pass

    feedback = Feedback(
        user_id=user_id,
        rating=feedback_in.rating,
        comment=feedback_in.comment,
        category=feedback_in.category
    )
    db.add(feedback)
    await db.commit()
    await db.refresh(feedback)
    return {"status": "success", "id": str(feedback.id)}

@router.get("")
async def list_feedbacks(
    db: DbSession
) -> Any:
    """List all feedbacks for admin."""
    import logging
    from sqlalchemy import select
    from models.feedback import Feedback
    logger = logging.getLogger(__name__)
    try:
        stmt = select(Feedback).order_by(Feedback.created_at.desc())
        result = await db.execute(stmt)
        feedbacks = result.scalars().all()
        
        return [
            {
                "id": str(fb.id),
                "rating": fb.rating,
                "comment": fb.comment,
                "category": fb.category,
                "user_id": str(fb.user_id) if fb.user_id else None,
                "created_at": fb.created_at.isoformat() if hasattr(fb.created_at, 'isoformat') else str(fb.created_at)
            } for fb in feedbacks
        ]
    except Exception as e:
        logger.error(f"Error in list_feedbacks: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
