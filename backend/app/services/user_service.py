"""User management, split by responsibility.

* Admin manages **supervisors** (and, in a later phase, the CCTV system). Admins never see or change employees.
* Supervisors manage the **employees of their own department**.
"""

import uuid
from typing import Any, Literal

from sqlalchemy import Select, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.core.security import hash_password, utcnow
from app.models import (
    Department,
    EmployeeProfile,
    SupervisorProfile,
    User,
    UserRole,
    UserStatus,
)
from app.schemas.user import EmployeeCreate, EmployeeUpdate, SupervisorCreate, SupervisorUpdate
from app.services import audit_service
from app.services.audit_service import AuditAction
from app.services.auth_service import revoke_all_sessions

SortField = Literal["full_name", "email", "role", "status", "created_at", "last_login_at"]
SortOrder = Literal["asc", "desc"]

_SORT_COLUMNS = {
    "full_name": User.full_name,
    "email": User.email,
    "role": User.role,
    "status": User.status,
    "created_at": User.created_at,
    "last_login_at": User.last_login_at,
}

_EMPLOYEE_FIELDS = ("designation", "shift", "assigned_area", "employee_code")


# --------------------------------------------------------------------------- queries


async def get_user(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    stmt = select(User).where(User.id == user_id).execution_options(populate_existing=True)
    return await db.scalar(stmt)


def _department_id_expr() -> Any:
    return func.coalesce(SupervisorProfile.department_id, EmployeeProfile.department_id)


def _base_query() -> Select[tuple[User]]:
    return (
        select(User)
        .outerjoin(SupervisorProfile, SupervisorProfile.user_id == User.id)
        .outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
    )


async def list_users(
    db: AsyncSession,
    *,
    search: str | None = None,
    role: UserRole | None = None,
    status: UserStatus | None = None,
    department_id: int | None = None,
    include_removed: bool = True,
    page: int = 1,
    page_size: int = 20,
    sort: SortField = "created_at",
    order: SortOrder = "desc",
) -> tuple[list[User], int]:
    stmt = _base_query()
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(User.full_name.ilike(term), User.email.ilike(term), EmployeeProfile.employee_code.ilike(term))
        )
    if role:
        stmt = stmt.where(User.role == role)
    if status:
        stmt = stmt.where(User.status == status)
    elif not include_removed:
        stmt = stmt.where(User.status != UserStatus.removed)
    if department_id is not None:
        stmt = stmt.where(_department_id_expr() == department_id)

    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    column = _SORT_COLUMNS[sort]
    ordered = column.asc().nulls_last() if order == "asc" else column.desc().nulls_last()
    stmt = stmt.order_by(ordered, User.id).offset((page - 1) * page_size).limit(page_size)
    users = list((await db.scalars(stmt)).unique().all())
    return users, total


# --------------------------------------------------------------------------- shared helpers


async def _ensure_email_free(db: AsyncSession, email: str, exclude_id: uuid.UUID | None = None) -> None:
    stmt = select(User.id).where(User.email == email)
    if exclude_id:
        stmt = stmt.where(User.id != exclude_id)
    if await db.scalar(stmt):
        raise Conflict("A user with this email already exists.", "EMAIL_TAKEN")


async def _ensure_employee_code_free(
    db: AsyncSession, code: str | None, exclude_id: uuid.UUID | None = None
) -> None:
    if not code:
        return
    stmt = select(EmployeeProfile.user_id).where(EmployeeProfile.employee_code == code)
    if exclude_id:
        stmt = stmt.where(EmployeeProfile.user_id != exclude_id)
    if await db.scalar(stmt):
        raise Conflict("This employee code is already in use.", "EMPLOYEE_CODE_TAKEN")


async def _ensure_department(db: AsyncSession, department_id: int) -> Department:
    dept = await db.get(Department, department_id)
    if dept is None:
        raise BadRequest("Selected department does not exist.", "INVALID_DEPARTMENT")
    return dept


def _set_password(user: User, password: str) -> None:
    user.password_hash = hash_password(password)
    user.password_changed_at = utcnow()
    user.failed_login_attempts = 0
    user.locked_until = None


async def _reload(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await get_user(db, user_id)
    assert user is not None
    return user


# --------------------------------------------------------------------------- admin: supervisors only


async def list_supervisors(db: AsyncSession, **filters: Any) -> tuple[list[User], int]:
    return await list_users(db, role=UserRole.supervisor, **filters)


async def get_supervisor(db: AsyncSession, user_id: uuid.UUID) -> User:
    """404 for anything that is not a supervisor, so admins cannot reach employee or admin records."""
    user = await get_user(db, user_id)
    if user is None or user.role != UserRole.supervisor:
        raise NotFound("Supervisor not found.")
    return user


async def create_supervisor(db: AsyncSession, actor: User, data: SupervisorCreate, ip: str | None) -> User:
    await _ensure_email_free(db, data.email)
    dept = await _ensure_department(db, data.department_id)
    user = User(
        id=uuid.uuid4(),
        email=data.email,
        full_name=data.full_name,
        phone=data.phone,
        role=UserRole.supervisor,
        status=UserStatus.active,
        password_hash=hash_password(data.password),
        created_by_id=actor.id,
        supervisor_profile=SupervisorProfile(department_id=dept.id, designation=data.designation),
    )
    db.add(user)
    await db.flush()
    await audit_service.record(
        db, AuditAction.USER_CREATED, actor=actor, entity_type="user", entity_id=user.id,
        details={"email": user.email, "role": "supervisor", "department": dept.code}, ip=ip,
    )
    await db.commit()
    return await _reload(db, user.id)


async def update_supervisor(
    db: AsyncSession, actor: User, user_id: uuid.UUID, data: SupervisorUpdate, ip: str | None
) -> User:
    target = await get_supervisor(db, user_id)
    fields = data.model_fields_set
    changed: list[str] = []

    if "email" in fields and data.email and data.email != target.email:
        await _ensure_email_free(db, data.email, exclude_id=target.id)
        target.email = data.email
        changed.append("email")
    if "full_name" in fields and data.full_name and data.full_name != target.full_name:
        target.full_name = data.full_name
        changed.append("full_name")
    if "phone" in fields and data.phone != target.phone:
        target.phone = data.phone
        changed.append("phone")

    sp = target.supervisor_profile
    assert sp is not None
    if "department_id" in fields and data.department_id and data.department_id != sp.department_id:
        await _ensure_department(db, data.department_id)
        # The supervisor leaves their old section: employees stop pointing at them as their supervisor.
        await db.execute(
            update(EmployeeProfile).where(EmployeeProfile.supervisor_id == target.id).values(supervisor_id=None)
        )
        sp.department_id = data.department_id
        changed.append("department")
    if "designation" in fields and data.designation != sp.designation:
        sp.designation = data.designation
        changed.append("designation")

    if "password" in fields and data.password:
        _set_password(target, data.password)
        await revoke_all_sessions(db, target.id)
        changed.append("password")

    if changed:
        await audit_service.record(
            db, AuditAction.USER_UPDATED, actor=actor, entity_type="user", entity_id=target.id,
            details={"fields": changed}, ip=ip,
        )
    await db.commit()
    return await _reload(db, target.id)


async def set_supervisor_status(
    db: AsyncSession, actor: User, user_id: uuid.UUID, status: UserStatus, ip: str | None
) -> User:
    target = await get_supervisor(db, user_id)
    if target.status != status:
        target.status = status
        if status != UserStatus.active:
            await revoke_all_sessions(db, target.id)
        action = AuditAction.USER_ENABLED if status == UserStatus.active else AuditAction.USER_DISABLED
        await audit_service.record(db, action, actor=actor, entity_type="user", entity_id=target.id, ip=ip)
        await db.commit()
    return await _reload(db, target.id)


async def unlock_supervisor(db: AsyncSession, actor: User, user_id: uuid.UUID, ip: str | None) -> User:
    target = await get_supervisor(db, user_id)
    return await _unlock(db, actor, target, ip)


async def _unlock(db: AsyncSession, actor: User, target: User, ip: str | None) -> User:
    target.locked_until = None
    target.failed_login_attempts = 0
    await audit_service.record(
        db, AuditAction.USER_UNLOCKED, actor=actor, entity_type="user", entity_id=target.id, ip=ip
    )
    await db.commit()
    return await _reload(db, target.id)


# --------------------------------------------------------------------------- supervisor: own department's employees


def _supervisor_department(actor: User) -> int:
    if actor.supervisor_profile is None:
        raise Forbidden("Your supervisor profile has no department assigned.")
    return actor.supervisor_profile.department_id


async def list_department_employees(
    db: AsyncSession, actor: User, **filters: Any
) -> tuple[list[User], int]:
    return await list_users(
        db, role=UserRole.employee, department_id=_supervisor_department(actor), include_removed=False, **filters
    )


async def get_department_employee(db: AsyncSession, actor: User, user_id: uuid.UUID) -> User:
    dept_id = _supervisor_department(actor)
    user = await get_user(db, user_id)
    # 404 rather than 403 so supervisors cannot probe other departments.
    if (
        user is None
        or user.role != UserRole.employee
        or user.status == UserStatus.removed
        or user.employee_profile is None
        or user.employee_profile.department_id != dept_id
    ):
        raise NotFound("Employee not found in your department.")
    return user


async def create_department_employee(
    db: AsyncSession, actor: User, data: EmployeeCreate, ip: str | None
) -> User:
    dept_id = _supervisor_department(actor)
    dept = await _ensure_department(db, dept_id)
    await _ensure_email_free(db, data.email)
    await _ensure_employee_code_free(db, data.employee_code)
    user = User(
        id=uuid.uuid4(),
        email=data.email,
        full_name=data.full_name,
        phone=data.phone,
        role=UserRole.employee,
        status=UserStatus.active,
        password_hash=hash_password(data.password),
        created_by_id=actor.id,
        employee_profile=EmployeeProfile(
            department_id=dept.id,
            supervisor_id=actor.id,
            designation=data.designation,
            shift=data.shift,
            assigned_area=data.assigned_area,
            employee_code=data.employee_code or None,
        ),
    )
    db.add(user)
    await db.flush()
    await audit_service.record(
        db, AuditAction.USER_CREATED, actor=actor, entity_type="user", entity_id=user.id,
        details={"email": user.email, "role": "employee", "department": dept.code}, ip=ip,
    )
    await db.commit()
    return await _reload(db, user.id)


async def update_department_employee(
    db: AsyncSession, actor: User, user_id: uuid.UUID, data: EmployeeUpdate, ip: str | None
) -> User:
    target = await get_department_employee(db, actor, user_id)
    fields = data.model_fields_set
    changed: list[str] = []

    if "email" in fields and data.email and data.email != target.email:
        await _ensure_email_free(db, data.email, exclude_id=target.id)
        target.email = data.email
        changed.append("email")
    if "full_name" in fields and data.full_name and data.full_name != target.full_name:
        target.full_name = data.full_name
        changed.append("full_name")
    if "phone" in fields and data.phone != target.phone:
        target.phone = data.phone
        changed.append("phone")

    ep = target.employee_profile
    assert ep is not None
    for name in _EMPLOYEE_FIELDS:
        if name not in fields:
            continue
        value = getattr(data, name) or None
        if value == getattr(ep, name):
            continue
        if name == "employee_code":
            await _ensure_employee_code_free(db, value, exclude_id=target.id)
        setattr(ep, name, value)
        changed.append(name)

    if "password" in fields and data.password:
        _set_password(target, data.password)
        await revoke_all_sessions(db, target.id)
        changed.append("password")

    if changed:
        await audit_service.record(
            db, AuditAction.USER_UPDATED, actor=actor, entity_type="user", entity_id=target.id,
            details={"fields": changed}, ip=ip,
        )

    if "status" in fields and data.status and data.status != target.status.value:
        new_status = UserStatus(data.status)
        target.status = new_status
        if new_status != UserStatus.active:
            await revoke_all_sessions(db, target.id)
        action = AuditAction.USER_ENABLED if new_status == UserStatus.active else AuditAction.USER_DISABLED
        await audit_service.record(db, action, actor=actor, entity_type="user", entity_id=target.id, ip=ip)

    await db.commit()
    return await _reload(db, target.id)


async def unlock_department_employee(db: AsyncSession, actor: User, user_id: uuid.UUID, ip: str | None) -> User:
    target = await get_department_employee(db, actor, user_id)
    return await _unlock(db, actor, target, ip)


async def remove_department_employee(db: AsyncSession, actor: User, user_id: uuid.UUID, ip: str | None) -> None:
    """Soft delete: keeps the row for audit history and penalty records."""
    target = await get_department_employee(db, actor, user_id)
    target.status = UserStatus.removed
    await revoke_all_sessions(db, target.id)
    await audit_service.record(
        db, AuditAction.USER_REMOVED, actor=actor, entity_type="user", entity_id=target.id,
        details={"email": target.email}, ip=ip,
    )
    await db.commit()
