import logging
import uuid
from pathlib import Path

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import BadRequest, Forbidden, NotFound
from app.core.security import utcnow
from app.models import (
    CctvEvidence,
    Department,
    EvidenceReviewStatus,
    PenaltySeverity,
    User,
    UserRole,
)
from app.services import audit_service
from app.services.audit_service import AuditAction

logger = logging.getLogger(__name__)


def _supervisor_dept_id(actor: User) -> int:
    if actor.supervisor_profile is None:
        raise Forbidden("Your supervisor profile has no department assigned.")
    return actor.supervisor_profile.department_id


async def list_evidence(
    db: AsyncSession,
    actor: User,
    *,
    department_id: int | None = None,
    evidence_source: str | None = None,
    review_status: EvidenceReviewStatus | None = None,
    severity: PenaltySeverity | None = None,
    camera_id: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[CctvEvidence], int]:
    stmt: Select = select(CctvEvidence)

    # Department scoping based on role:
    if actor.role == UserRole.supervisor:
        dept_id = _supervisor_dept_id(actor)
        if department_id is not None and department_id != dept_id:
            return [], 0
        stmt = stmt.where(CctvEvidence.department_id == dept_id)
    elif actor.role == UserRole.employee:
        stmt = stmt.where(CctvEvidence.employee_id == actor.id)
    elif actor.role == UserRole.admin:
        if department_id is not None:
            stmt = stmt.where(CctvEvidence.department_id == department_id)
    else:
        raise Forbidden("Access denied.")

    if evidence_source:
        stmt = stmt.where(CctvEvidence.evidence_source == evidence_source)

    if review_status:
        stmt = stmt.where(CctvEvidence.review_status == review_status)

    if severity:
        stmt = stmt.where(CctvEvidence.severity == severity)

    if camera_id:
        stmt = stmt.where(CctvEvidence.camera_id == camera_id)

    if search:
        pattern = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(CctvEvidence.camera_id).like(pattern),
                func.lower(CctvEvidence.camera_location).like(pattern),
                func.lower(CctvEvidence.violation_type).like(pattern),
            )
        )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = await db.scalar(count_stmt) or 0

    stmt = (
        stmt.order_by(CctvEvidence.captured_at.desc(), CctvEvidence.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.scalars(stmt)
    return list(result.all()), total


async def get_evidence(db: AsyncSession, actor: User, evidence_id: uuid.UUID) -> CctvEvidence:
    stmt = select(CctvEvidence).where(CctvEvidence.id == evidence_id).execution_options(populate_existing=True)
    evidence = await db.scalar(stmt)
    if evidence is None:
        raise NotFound("Evidence record not found.")

    if actor.role == UserRole.supervisor:
        dept_id = _supervisor_dept_id(actor)
        if evidence.department_id != dept_id:
            raise NotFound("Evidence record not found.")
    elif actor.role == UserRole.employee:
        if evidence.employee_id != actor.id:
            raise NotFound("Evidence record not found.")
    elif actor.role != UserRole.admin:
        raise Forbidden("Access denied.")

    return evidence


async def review_evidence(
    db: AsyncSession,
    actor: User,
    evidence_id: uuid.UUID,
    action: str,
    remarks: str | None,
    ip: str | None,
) -> CctvEvidence:
    if action not in ("approve", "reject"):
        raise BadRequest("Invalid review action; must be 'approve' or 'reject'.")

    evidence = await get_evidence(db, actor, evidence_id)

    if actor.role not in (UserRole.supervisor, UserRole.admin):
        raise Forbidden("Only supervisors or administrators can review evidence.")

    prev_status = evidence.review_status.value
    new_status = EvidenceReviewStatus.approved if action == "approve" else EvidenceReviewStatus.rejected

    evidence.review_status = new_status
    evidence.reviewed_by_id = actor.id
    evidence.reviewed_at = utcnow()
    evidence.supervisor_remarks = remarks.strip() if remarks else None

    await audit_service.record(
        db,
        AuditAction.EVIDENCE_REVIEWED,
        actor=actor,
        entity_type="cctv_evidence",
        entity_id=evidence.id,
        ip=ip,
        details={
            "action": action,
            "previous_status": prev_status,
            "new_status": new_status.value,
            "remarks": remarks,
            "camera_id": evidence.camera_id,
            "violation_type": evidence.violation_type,
            "department_id": evidence.department_id,
        },
    )
    await db.commit()
    await db.refresh(evidence)
    return evidence


def get_evidence_image_path(evidence: CctvEvidence) -> Path:
    filename = evidence.image_filename or f"{evidence.id}.jpg"
    base_dir = Path(settings.EVIDENCE_DIR)
    path = base_dir / filename
    if not path.is_file():
        alt_path = Path("/app") / settings.EVIDENCE_DIR / filename
        if alt_path.is_file():
            return alt_path
        raise NotFound(f"Evidence image file not found on disk: {filename}")
    return path
