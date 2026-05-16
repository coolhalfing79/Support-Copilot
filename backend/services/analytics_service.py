"""
Analytics Service
Aggregates metrics for dashboard display.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, and_

from models.message import Message
from models.ticket import Ticket
from models.session import Session
from models.metric import Metric
from models.enums import MessageRole, TicketSeverity
from schemas.analytics import (
    MetricOverview,
    TrendPoint,
    CommonIssue,
    AnalyticsOverviewResponse,
)

class AnalyticsService:
    """Service for analytics and metrics aggregation."""
    
    def __init__(self):
        pass
    
    async def get_overview(
        self,
        db: AsyncSession,
        days: int = 7,
    ) -> MetricOverview:
        """
        Get dashboard overview metrics.
        
        Args:
            db: Database session
            days: Number of days to look back
            
        Returns:
            MetricOverview with aggregated metrics
        """
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        # Count queries (user messages)
        query_count_result = await db.execute(
            select(func.count(Message.id))
            .where(Message.created_at >= start_date, Message.role == MessageRole.user)
        )
        total_queries = query_count_result.scalar() or 0
        
        # Count resolved
        resolved_count_result = await db.execute(
            select(func.count(Message.id))
            .where(
                Message.created_at >= start_date,
                Message.role == MessageRole.assistant,
                Message.sources.isnot(None),
            )
        )
        resolved_count = resolved_count_result.scalar() or 0
        
        # Count escalations (tickets created)
        ticket_count_result = await db.execute(
            select(func.count(Ticket.id))
            .where(Ticket.created_at >= start_date)
        )
        total_tickets = ticket_count_result.scalar() or 0
        
        # Calculate rates
        resolution_rate = (resolved_count / total_queries * 100) if total_queries > 0 else 0.0
        escalation_rate = (total_tickets / total_queries * 100) if total_queries > 0 else 0.0
        
        # Average confidence score
        avg_confidence_result = await db.execute(
            select(func.avg(Message.confidence_score))
            .where(
                Message.created_at >= start_date,
                Message.confidence_score.isnot(None),
            )
        )
        avg_confidence = avg_confidence_result.scalar() or 0.0
        
        # Total sessions
        session_count_result = await db.execute(
            select(func.count(Session.id))
            .where(Session.created_at >= start_date)
        )
        total_sessions = session_count_result.scalar() or 0
        
        return MetricOverview(
            total_queries=total_queries,
            resolution_rate=round(resolution_rate, 2),
            escalation_rate=round(escalation_rate, 2),
            avg_confidence_score=round(float(avg_confidence), 4),
            total_tickets=total_tickets,
            total_sessions=total_sessions,
        )
    
    async def get_trends(
        self,
        db: AsyncSession,
        days: int = 30,
        metric_type: str = "query_count",
    ) -> List[TrendPoint]:
        """
        Get trend data for a specific metric.
        """
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        if metric_type == "query_count":
            result = await db.execute(
                select(
                    func.date(Message.created_at).label("day"),
                    func.count(Message.id).label("count"),
                )
                .where(
                    Message.created_at >= start_date,
                    Message.role == MessageRole.user,
                )
                .group_by(func.date(Message.created_at))
                .order_by(func.date(Message.created_at))
            )
            rows = result.all()
            
            return [
                TrendPoint(
                    date=row.day,
                    value=row.count,
                    label=row.day if isinstance(row.day, str) else row.day.strftime("%Y-%m-%d"),
                )
                for row in rows
            ]
        
        elif metric_type == "resolution_count":
            result = await db.execute(
                select(
                    func.date(Message.created_at).label("day"),
                    func.count(Message.id).label("count"),
                )
                .where(
                    Message.created_at >= start_date,
                    Message.role == MessageRole.assistant,
                    Message.sources.isnot(None),
                )
                .group_by(func.date(Message.created_at))
                .order_by(func.date(Message.created_at))
            )
            rows = result.all()
            
            return [
                TrendPoint(
                    date=row.day,
                    value=row.count,
                    label=row.day if isinstance(row.day, str) else row.day.strftime("%Y-%m-%d"),
                )
                for row in rows
            ]
        
        elif metric_type == "escalation_count":
            result = await db.execute(
                select(
                    func.date(Ticket.created_at).label("day"),
                    func.count(Ticket.id).label("count"),
                )
                .where(Ticket.created_at >= start_date)
                .group_by(func.date(Ticket.created_at))
                .order_by(func.date(Ticket.created_at))
            )
            rows = result.all()
            
            return [
                TrendPoint(
                    date=row.day,
                    value=row.count,
                    label=row.day if isinstance(row.day, str) else row.day.strftime("%Y-%m-%d"),
                )
                for row in rows
            ]
        
        return []
    
    async def get_common_issues(
        self,
        db: AsyncSession,
        limit: int = 10,
    ) -> List[CommonIssue]:
        """
        Get most common issues from tickets.
        """
        result = await db.execute(
            select(
                Ticket.product_module,
                Ticket.severity,
                func.count(Ticket.id).label("count"),
                func.max(Ticket.created_at).label("last_seen"),
            )
            .where(Ticket.product_module.isnot(None))
            .group_by(Ticket.product_module, Ticket.severity)
            .order_by(func.count(Ticket.id).desc())
            .limit(limit)
        )
        rows = result.all()
        
        return [
            CommonIssue(
                pattern=f"{row.product_module} - {row.severity.value}",
                count=row.count,
                severity=row.severity.value,
                last_seen=row.last_seen,
            )
            for row in rows
        ]
