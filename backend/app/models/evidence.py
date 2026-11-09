import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.department import Department
from app.models.enums import EvidenceReviewStatus, PenaltySeverity
from app.models.user import User, _pg_enum


class CctvEvidence(Base):
    """CCTV detection evidence records.
    
    Contains annotated detection metadata, bounding box labels, confidence scores,
    and review status by supervisors.
    """

    __tablename__ = "cctv_evidence"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    evidence_source: Mapped[str] = mapped_column(String(20), default="DUMMY", server_default="DUMMY", index=True)

    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), index=True)
    employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    camera_id: Mapped[str] = mapped_column(String(50), index=True)
    camera_location: Mapped[str] = mapped_column(String(100))

    violation_type: Mapped[str] = mapped_column(String(100), index=True)
    severity: Mapped[PenaltySeverity] = mapped_column(_pg_enum(PenaltySeverity, "penalty_severity"), index=True)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)
    detection_labels: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)

    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    image_filename: Mapped[str | None] = mapped_column(String(255))
    cloudinary_public_id: Mapped[str | None] = mapped_column(String(255))

    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    review_status: Mapped[EvidenceReviewStatus] = mapped_column(
        _pg_enum(EvidenceReviewStatus, "evidence_review_status"),
        default=EvidenceReviewStatus.pending,
        server_default="pending",
        index=True,
    )
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    supervisor_remarks: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    department: Mapped[Department] = relationship(lazy="selectin")
    employee: Mapped[User | None] = relationship(foreign_keys=[employee_id], lazy="selectin")
    reviewed_by: Mapped[User | None] = relationship(foreign_keys=[reviewed_by_id], lazy="selectin")

