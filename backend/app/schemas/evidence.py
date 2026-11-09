import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from app.models.enums import EvidenceReviewStatus, PenaltySeverity
from app.models.evidence import CctvEvidence
from app.schemas.penalty import PersonRef
from app.schemas.user import DepartmentOut


class DetectionItem(BaseModel):
    label: str
    confidence: float
    box: list[int] = Field(description="[x1, y1, x2, y2]")
    color: str | None = None


class EvidenceReviewRequest(BaseModel):
    action: Literal["approve", "reject"]
    remarks: Annotated[str, Field(max_length=1000)] | None = None


class EvidenceOut(BaseModel):
    id: uuid.UUID
    evidence_source: str
    department: DepartmentOut
    employee: PersonRef | None
    camera_id: str
    camera_location: str
    violation_type: str
    severity: PenaltySeverity
    confidence_score: float
    detection_labels: list[dict[str, Any]]
    image_url: str
    cloudinary_public_id: str | None
    captured_at: datetime
    review_status: EvidenceReviewStatus
    reviewed_by: PersonRef | None
    reviewed_at: datetime | None
    supervisor_remarks: str | None
    created_at: datetime

    @classmethod
    def from_evidence(cls, e: CctvEvidence) -> "EvidenceOut":
        emp_ref = None
        if e.employee:
            ep = getattr(e.employee, "employee_profile", None)
            emp_ref = PersonRef(
                id=e.employee.id,
                full_name=e.employee.full_name,
                email=e.employee.email,
                employee_code=ep.employee_code if ep else None,
            )

        rev_ref = None
        if e.reviewed_by:
            rev_ref = PersonRef(
                id=e.reviewed_by.id,
                full_name=e.reviewed_by.full_name,
                email=e.reviewed_by.email,
            )

        return cls(
            id=e.id,
            evidence_source=e.evidence_source,
            department=DepartmentOut.model_validate(e.department),
            employee=emp_ref,
            camera_id=e.camera_id,
            camera_location=e.camera_location,
            violation_type=e.violation_type,
            severity=e.severity,
            confidence_score=e.confidence_score,
            detection_labels=e.detection_labels,
            image_url=e.image_url,
            cloudinary_public_id=e.cloudinary_public_id,
            captured_at=e.captured_at,
            review_status=e.review_status,
            reviewed_by=rev_ref,
            reviewed_at=e.reviewed_at,
            supervisor_remarks=e.supervisor_remarks,
            created_at=e.created_at,
        )

