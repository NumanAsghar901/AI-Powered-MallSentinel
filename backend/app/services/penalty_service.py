import logging
import uuid

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BadRequest, Forbidden, NotFound
from app.core.security import utcnow
from app.models import EmailStatus, Penalty, PenaltySeverity, User, UserRole, UserStatus
from app.schemas.penalty import REASON_LABELS, REASONS_BY_DEPARTMENT, PenaltyCreate, describe_action
from app.services import audit_service, email_service
from app.services.audit_service import AuditAction
from app.services.email_service import EmailNotConfigured, PenaltyNotice

logger = logging.getLogger(__name__)


def _department_id(actor: User) -> int:
    if actor.supervisor_profile is None:
        raise Forbidden("Your supervisor profile has no department assigned.")
    return actor.supervisor_profile.department_id


async def _load(db: AsyncSession, penalty_id: uuid.UUID) -> Penalty | None:
    stmt = select(Penalty).where(Penalty.id == penalty_id).execution_options(populate_existing=True)
    return await db.scalar(stmt)


async def _send_notice(penalty: Penalty) -> None:
    """Sends the email and records the outcome on the penalty (the caller commits)."""
    notice = PenaltyNotice(
        employee_name=penalty.employee.full_name,
        supervisor_name=penalty.issued_by.full_name,
        section=penalty.department.name,
        reason=REASON_LABELS.get(penalty.reason, penalty.reason),
        severity=penalty.severity.value.capitalize(),
        penalty=describe_action(penalty.action, penalty.amount_pkr, penalty.suspension_days),
        notes=penalty.notes,
        issued_at=penalty.created_at,
    )
    try:
        await email_service.send_penalty_notice(penalty.employee.email, notice)
    except EmailNotConfigured:
        penalty.email_status = EmailStatus.not_configured
        penalty.email_error = "Email is not configured (SMTP_USER / SMTP_PASSWORD)."
    except Exception as exc:  # noqa: BLE001 - delivery problems must never lose the penalty
        logger.exception("Failed to email penalty %s", penalty.id)
        penalty.email_status = EmailStatus.failed
        penalty.email_error = f"{type(exc).__name__}: {exc}"[:250]
    else:
        penalty.email_status = EmailStatus.sent
        penalty.email_sent_at = utcnow()
        penalty.email_error = None


async def create_penalty(db: AsyncSession, actor: User, data: PenaltyCreate, ip: str | None) -> Penalty:
    dept_id = _department_id(actor)
    employee = await db.scalar(
        select(User).where(User.id == data.employee_id).execution_options(populate_existing=True)
    )
    # 404 for other departments, other roles and removed staff: nothing to learn by probing.
    if (
        employee is None
        or employee.role != UserRole.employee
        or employee.status == UserStatus.removed
        or employee.employee_profile is None
        or employee.employee_profile.department_id != dept_id
    ):
        raise NotFound("Employee not found in your department.")
    if employee.status != UserStatus.active:
        raise BadRequest("This employee's account is disabled.", "EMPLOYEE_DISABLED")

    dept = actor.supervisor_profile.department  # type: ignore[union-attr]
    if data.reason not in REASONS_BY_DEPARTMENT.get(dept.code, ("other",)):
        raise BadRequest(f"This reason does not apply to the {dept.name} section.", "INVALID_REASON")

    penalty = Penalty(
        id=uuid.uuid4(),
        employee_id=employee.id,
        issued_by_id=actor.id,
        department_id=dept_id,
        reason=data.reason,
        severity=data.severity,
        action=data.action,
        amount_pkr=data.amount_pkr,
        suspension_days=data.suspension_days,
        notes=data.notes.strip() if data.notes and data.notes.strip() else None,
    )
    db.add(penalty)
    await db.flush()
    await audit_service.record(
        db, AuditAction.PENALTY_ISSUED, actor=actor, entity_type="penalty", entity_id=penalty.id,
        details={
            "employee_id": str(employee.id), "reason": data.reason, "severity": data.severity.value,
            "action": data.action.value, "amount_pkr": data.amount_pkr, "suspension_days": data.suspension_days,
        },
        ip=ip,
    )
    await db.commit()  # the decision is saved and audited before any email is attempted

    penalty = await _load(db, penalty.id)  # type: ignore[assignment]
    assert penalty is not None
    await _send_notice(penalty)
    await db.commit()
    return penalty


async def resend_email(db: AsyncSession, actor: User, penalty_id: uuid.UUID, ip: str | None) -> Penalty:
    penalty = await get_department_penalty(db, actor, penalty_id)
    await _send_notice(penalty)
    await audit_service.record(
        db, AuditAction.PENALTY_EMAIL_RESENT, actor=actor, entity_type="penalty", entity_id=penalty.id,
        details={"status": penalty.email_status.value}, ip=ip,
    )
    await db.commit()
    return penalty


def _filtered(base: Select[tuple[Penalty]], search: str | None, severity: PenaltySeverity | None, employee_id: uuid.UUID | None) -> Select[tuple[Penalty]]:
    if employee_id:
        base = base.where(Penalty.employee_id == employee_id)
    if severity:
        base = base.where(Penalty.severity == severity)
    if search:
        term = f"%{search.strip()}%"
        base = base.join(User, User.id == Penalty.employee_id).where(
            or_(User.full_name.ilike(term), User.email.ilike(term))
        )
    return base


async def _page(db: AsyncSession, stmt: Select[tuple[Penalty]], page: int, page_size: int) -> tuple[list[Penalty], int]:
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Penalty.created_at.desc(), Penalty.id).offset((page - 1) * page_size).limit(page_size)
    return list((await db.scalars(stmt)).unique().all()), total


async def list_department_penalties(
    db: AsyncSession, actor: User, *, search: str | None, severity: PenaltySeverity | None,
    employee_id: uuid.UUID | None, page: int, page_size: int,
) -> tuple[list[Penalty], int]:
    stmt = select(Penalty).where(Penalty.department_id == _department_id(actor))
    return await _page(db, _filtered(stmt, search, severity, employee_id), page, page_size)


async def get_department_penalty(db: AsyncSession, actor: User, penalty_id: uuid.UUID) -> Penalty:
    penalty = await _load(db, penalty_id)
    if penalty is None or penalty.department_id != _department_id(actor):
        raise NotFound("Penalty not found.")
    return penalty


async def list_my_penalties(db: AsyncSession, user: User, *, page: int, page_size: int) -> tuple[list[Penalty], int]:
    """Employees only ever see their own penalties (UC-12 data isolation)."""
    stmt = select(Penalty).where(Penalty.employee_id == user.id)
    return await _page(db, stmt, page, page_size)

