import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.department import Department
from app.models.enums import EmailStatus, PenaltyAction, PenaltySeverity
from app.models.user import User, _pg_enum


class Penalty(Base):
    """A decision by a supervisor about one employee. Rows are never deleted; the email outcome is tracked on the row."""

    __tablename__ = "penalties"
    __table_args__ = (
        CheckConstraint(
            "(action = 'fine' AND amount_pkr > 0 AND suspension_days IS NULL) "
            "OR (action = 'suspension' AND suspension_days > 0 AND amount_pkr IS NULL) "
            "OR (action NOT IN ('fine', 'suspension') AND amount_pkr IS NULL AND suspension_days IS NULL)",
            name="ck_penalties_action_details",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    issued_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), index=True)

    reason: Mapped[str] = mapped_column(String(40))
    severity: Mapped[PenaltySeverity] = mapped_column(_pg_enum(PenaltySeverity, "penalty_severity"))
    action: Mapped[PenaltyAction] = mapped_column(_pg_enum(PenaltyAction, "penalty_action"))
    amount_pkr: Mapped[int | None] = mapped_column(Integer)
    suspension_days: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)

    email_status: Mapped[EmailStatus] = mapped_column(
        _pg_enum(EmailStatus, "email_status"), default=EmailStatus.pending, server_default="pending"
    )
    email_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email_error: Mapped[str | None] = mapped_column(String(255))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    employee: Mapped[User] = relationship(foreign_keys=[employee_id], lazy="selectin")
    issued_by: Mapped[User] = relationship(foreign_keys=[issued_by_id], lazy="selectin")
    department: Mapped[Department] = relationship(lazy="selectin")
