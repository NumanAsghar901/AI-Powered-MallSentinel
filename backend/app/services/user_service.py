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
from app.schemas.user import EmployeeCreate, EmployeeUpdate, UserCreate, UserUpdate
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

_PROFILE_FIELDS = ("designation", "shift", "assigned_area", "employee_code")


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


# --------------------------------------------------------------------------- validation helpers


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


async def _ensure_supervisor(db: AsyncSession, supervisor_id: uuid.UUID | None, department_id: int) -> None:
    if supervisor_id is None:
        return
    profile = await db.get(SupervisorProfile, supervisor_id)
    sup = await db.get(User, supervisor_id)
    if profile is None or sup is None or sup.status == UserStatus.removed or profile.department_id != department_id:
        raise BadRequest("Supervisor must be an active supervisor of the same department.", "INVALID_SUPERVISOR")


def _supervisor_department(actor: User) -> int:
    if actor.supervisor_profile is None:
        raise Forbidden("Your supervisor profile has no department assigned.")
    return actor.supervisor_profile.department_id


def _ensure_not_self_or_admin(actor: User, target: User) -> None:
    if target.id == actor.id:
        raise BadRequest("You cannot change your own account here.", "SELF_ACTION")
    if target.role == UserRole.admin:
        raise BadRequest("Administrator accounts cannot be changed here.", "ADMIN_PROTECTED")


def _set_password(user: User, password: str) -> None:
    user.password_hash = hash_password(password)
    user.password_changed_at = utcnow()
    user.failed_login_attempts = 0
    user.locked_until = None


# --------------------------------------------------------------------------- admin operations


async def create_user(db: AsyncSession, actor: User, data: UserCreate, ip: str | None) -> User:
    await _ensure_email_free(db, data.email)
    dept = await _ensure_department(db, data.department_id)
    role = UserRole(data.role)

    user = User(
        id=uuid.uuid4(),
        email=data.email,
        full_name=data.full_name,
        phone=data.phone,
        role=role,
        status=UserStatus.active,
        password_hash=hash_password(data.password),
        created_by_id=actor.id,
    )
    if role == UserRole.supervisor:
        user.supervisor_profile = SupervisorProfile(department_id=dept.id, designation=data.designation)
    else:
        await _ensure_employee_code_free(db, data.employee_code)
        await _ensure_supervisor(db, data.supervisor_id, dept.id)
        user.employee_profile = EmployeeProfile(
            department_id=dept.id,
            supervisor_id=data.supervisor_id,
            designation=data.designation,
            shift=data.shift,
            assigned_area=data.assigned_area,
            employee_code=data.employee_code or None,
        )
    db.add(user)
    await db.flush()
    await audit_service.record(
        db, AuditAction.USER_CREATED, actor=actor, entity_type="user", entity_id=user.id,
        details={"email": user.email, "role": role.value, "department": dept.code}, ip=ip,
    )
    await db.commit()
    return await get_user(db, user.id)  # type: ignore[return-value]


async def update_user(
    db: AsyncSession, actor: User, user_id: uuid.UUID, data: UserUpdate, ip: str | None
) -> User:
    target = await get_user(db, user_id)
    if target is None:
        raise NotFound("User not found.")
    _ensure_not_self_or_admin(actor, target)

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

    current_dept_id = target.department.id if target.department else None
    new_dept_id = data.department_id if "department_id" in fields and data.department_id else current_dept_id
    if new_dept_id is None:
        raise BadRequest("A department is required.", "INVALID_DEPARTMENT")
    await _ensure_department(db, new_dept_id)

    old_role = target.role
    new_role = UserRole(data.role) if "role" in fields and data.role else old_role

    if new_role != old_role:
        await _change_role(db, target, new_role, new_dept_id, data)
        await audit_service.record(
            db, AuditAction.USER_ROLE_CHANGED, actor=actor, entity_type="user", entity_id=target.id,
            details={"from": old_role.value, "to": new_role.value}, ip=ip,
        )
    elif new_role == UserRole.supervisor and target.supervisor_profile:
        sp = target.supervisor_profile
        if new_dept_id != sp.department_id:
            await _detach_supervised_employees(db, target.id)
            sp.department_id = new_dept_id
            changed.append("department")
        if "designation" in fields and data.designation != sp.designation:
            sp.designation = data.designation
            changed.append("designation")
    elif new_role == UserRole.employee and target.employee_profile:
        ep = target.employee_profile
        if new_dept_id != ep.department_id:
            ep.department_id = new_dept_id
            ep.supervisor_id = None
            changed.append("department")
        changed += await _apply_employee_fields(db, target, data, fields)
        if "supervisor_id" in fields and data.supervisor_id != ep.supervisor_id:
            await _ensure_supervisor(db, data.supervisor_id, new_dept_id)
            ep.supervisor_id = data.supervisor_id
            changed.append("supervisor")

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
    return await get_user(db, target.id)  # type: ignore[return-value]


async def _detach_supervised_employees(db: AsyncSession, supervisor_id: uuid.UUID) -> None:
    await db.execute(
        update(EmployeeProfile).where(EmployeeProfile.supervisor_id == supervisor_id).values(supervisor_id=None)
    )


async def _change_role(
    db: AsyncSession, target: User, new_role: UserRole, dept_id: int, data: UserUpdate
) -> None:
    fields = data.model_fields_set
    if new_role == UserRole.supervisor:
        designation = data.designation if "designation" in fields else (
            target.employee_profile.designation if target.employee_profile else None
        )
        target.employee_profile = None
        await db.flush()
        target.supervisor_profile = SupervisorProfile(department_id=dept_id, designation=designation)
    else:
        designation = data.designation if "designation" in fields else (
            target.supervisor_profile.designation if target.supervisor_profile else None
        )
        await _detach_supervised_employees(db, target.id)
        target.supervisor_profile = None
        await db.flush()
        await _ensure_employee_code_free(db, data.employee_code, exclude_id=target.id)
        await _ensure_supervisor(db, data.supervisor_id, dept_id)
        target.employee_profile = EmployeeProfile(
            department_id=dept_id,
            supervisor_id=data.supervisor_id,
            designation=designation,
            shift=data.shift,
            assigned_area=data.assigned_area,
            employee_code=data.employee_code or None,
        )
    target.role = new_role


async def _apply_employee_fields(
    db: AsyncSession, target: User, data: UserUpdate | EmployeeUpdate, fields: set[str]
) -> list[str]:
    ep = target.employee_profile
    assert ep is not None
    changed: list[str] = []
    for name in _PROFILE_FIELDS:
        if name not in fields:
            continue
        value = getattr(data, name) or None
        if value == getattr(ep, name):
            continue
        if name == "employee_code":
            await _ensure_employee_code_free(db, value, exclude_id=target.id)
        setattr(ep, name, value)
        changed.append(name)
    return changed


async def set_status(
    db: AsyncSession, actor: User, user_id: uuid.UUID, status: UserStatus, ip: str | None
) -> User:
    target = await get_user(db, user_id)
    if target is None:
        raise NotFound("User not found.")
    _ensure_not_self_or_admin(actor, target)
    if target.status != status:
        target.status = status
        if status != UserStatus.active:
            await revoke_all_sessions(db, target.id)
        action = AuditAction.USER_ENABLED if status == UserStatus.active else AuditAction.USER_DISABLED
        await audit_service.record(db, action, actor=actor, entity_type="user", entity_id=target.id, ip=ip)
        await db.commit()
    return await get_user(db, target.id)  # type: ignore[return-value]


async def unlock(db: AsyncSession, actor: User, user_id: uuid.UUID, ip: str | None) -> User:
    target = await get_user(db, user_id)
    if target is None:
        raise NotFound("User not found.")
    target.locked_until = None
    target.failed_login_attempts = 0
    await audit_service.record(
        db, AuditAction.USER_UNLOCKED, actor=actor, entity_type="user", entity_id=target.id, ip=ip
    )
    await db.commit()
    return await get_user(db, target.id)  # type: ignore[return-value]


# --------------------------------------------------------------------------- supervisor operations


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
    payload = UserCreate(
        **data.model_dump(),
        role="employee",
        department_id=_supervisor_department(actor),
        supervisor_id=actor.id,
    )
    return await create_user(db, actor, payload, ip)


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
    changed += await _apply_employee_fields(db, target, data, fields)
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
    return await get_user(db, target.id)  # type: ignore[return-value]


async def remove_department_employee(db: AsyncSession, actor: User, user_id: uuid.UUID, ip: str | None) -> None:
    """Soft delete: keeps the row for audit history and future violation records."""
    target = await get_department_employee(db, actor, user_id)
    target.status = UserStatus.removed
    await revoke_all_sessions(db, target.id)
    await audit_service.record(
        db, AuditAction.USER_REMOVED, actor=actor, entity_type="user", entity_id=target.id,
        details={"email": target.email}, ip=ip,
    )
    await db.commit()
