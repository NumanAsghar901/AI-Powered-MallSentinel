"""Idempotent seed: `python -m app.seed`.

`python -m app.seed --sync-admin` also applies SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from backend/.env to the
existing admin account (use it after changing those values; a normal run never overwrites an existing admin).

Credentials come only from environment variables (backend/.env). Nothing is hardcoded.
"""

import asyncio
import sys

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password, utcnow
from app.db.session import SessionLocal, engine
from app.models import (
    AdminProfile,
    Department,
    EmployeeProfile,
    SupervisorProfile,
    User,
    UserRole,
    UserStatus,
)
from app.services import audit_service

DEPARTMENTS = [
    ("bakery", "Bakery", "Bakery section: hairnet, gloves, mask and apron compliance."),
    ("meat_shop", "Meat Shop", "Meat shop section: hairnet, gloves, mask and apron compliance."),
    ("security", "Security", "Security section: uniform, weapon and duty-zone compliance."),
]

DEMO_STAFF = {
    "bakery": {
        "supervisor": ("Ayesha Khan", "Bakery Supervisor"),
        "employees": [("Bilal Ahmed", "Baker", "morning"), ("Hina Tariq", "Pastry Assistant", "evening")],
    },
    "meat_shop": {
        "supervisor": ("Usman Raza", "Meat Shop Supervisor"),
        "employees": [("Imran Shah", "Butcher", "morning"), ("Zeeshan Ali", "Meat Packer", "evening")],
    },
    "security": {
        "supervisor": ("Kamran Malik", "Security Supervisor"),
        "employees": [("Tariq Mehmood", "Security Guard", "morning"), ("Naveed Iqbal", "Security Guard", "night")],
    },
}


async def _seed_departments(db: AsyncSession) -> dict[str, Department]:
    result: dict[str, Department] = {}
    for code, name, description in DEPARTMENTS:
        dept = await db.scalar(select(Department).where(Department.code == code))
        if dept is None:
            dept = Department(code=code, name=name, description=description)
            db.add(dept)
            await db.flush()
        result[code] = dept
    return result


async def _seed_admin(db: AsyncSession, sync: bool = False) -> User | None:
    email, password = settings.SEED_ADMIN_EMAIL, settings.SEED_ADMIN_PASSWORD
    if not email or not password:
        print("! SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set in backend/.env - admin not created.")
        return None
    try:
        email = validate_email(email.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise SystemExit(f"SEED_ADMIN_EMAIL is not a valid login email: {exc}") from exc
    admin = await db.scalar(select(User).where(User.email == email))
    if admin is None and sync:
        admin = await db.scalar(select(User).where(User.role == UserRole.admin).order_by(User.created_at))
        if admin is not None:
            previous = admin.email
            admin.email = email
            admin.full_name = settings.SEED_ADMIN_NAME
            admin.password_hash = hash_password(password)
            admin.password_changed_at = utcnow()
            admin.failed_login_attempts = 0
            admin.locked_until = None
            await audit_service.record(
                db, "user.updated", actor_email="seed", entity_type="user", entity_id=admin.id,
                details={"fields": ["email", "password"], "from_email": previous, "source": "seed --sync-admin"},
            )
            print(f"~ admin synced: {previous} -> {email}")
            return admin
    if admin is None:
        admin = User(
            email=email,
            full_name=settings.SEED_ADMIN_NAME,
            role=UserRole.admin,
            status=UserStatus.active,
            password_hash=hash_password(password),
            admin_profile=AdminProfile(access_level="full"),
        )
        db.add(admin)
        await db.flush()
        await audit_service.record(
            db, "user.created", actor_email="seed", entity_type="user", entity_id=admin.id,
            details={"email": email, "role": "admin", "source": "seed"},
        )
        print(f"+ admin created: {email}")
    elif sync:
        admin.password_hash = hash_password(password)
        admin.password_changed_at = utcnow()
        admin.failed_login_attempts = 0
        admin.locked_until = None
        await audit_service.record(
            db, "user.updated", actor_email="seed", entity_type="user", entity_id=admin.id,
            details={"fields": ["password"], "source": "seed --sync-admin"},
        )
        print(f"~ admin password synced: {email}")
    else:
        print(f"= admin exists: {email}")
    return admin


async def _seed_demo(db: AsyncSession, depts: dict[str, Department], admin: User | None) -> list[tuple[str, str, str]]:
    password = settings.SEED_DEMO_PASSWORD
    if not password:
        print("! SEED_DEMO_PASSWORD not set in backend/.env - demo accounts skipped.")
        return []
    domain = settings.SEED_DEMO_EMAIL_DOMAIN
    logins: list[tuple[str, str, str]] = []

    for code, staff in DEMO_STAFF.items():
        dept = depts[code]
        sup_name, sup_title = staff["supervisor"]  # type: ignore[misc]
        sup_email = f"supervisor.{code.replace('_', '')}@{domain}"
        sup = await db.scalar(select(User).where(User.email == sup_email))
        if sup is None:
            sup = User(
                email=sup_email, full_name=sup_name, role=UserRole.supervisor, status=UserStatus.active,
                password_hash=hash_password(password), created_by_id=admin.id if admin else None,
                supervisor_profile=SupervisorProfile(department_id=dept.id, designation=sup_title),
            )
            db.add(sup)
            await db.flush()
            await audit_service.record(
                db, "user.created", actor_email="seed", entity_type="user", entity_id=sup.id,
                details={"email": sup_email, "role": "supervisor", "source": "seed"},
            )
        logins.append(("supervisor", dept.name, sup_email))

        for idx, (name, title, shift) in enumerate(staff["employees"], start=1):  # type: ignore[arg-type]
            email = f"employee{idx}.{code.replace('_', '')}@{domain}"
            emp = await db.scalar(select(User).where(User.email == email))
            if emp is None:
                emp = User(
                    email=email, full_name=name, role=UserRole.employee, status=UserStatus.active,
                    password_hash=hash_password(password), created_by_id=sup.id,
                    employee_profile=EmployeeProfile(
                        department_id=dept.id, supervisor_id=sup.id, designation=title, shift=shift,
                        employee_code=f"{code[:3].upper()}-{idx:03d}",
                    ),
                )
                db.add(emp)
                await db.flush()
                await audit_service.record(
                    db, "user.created", actor_email="seed", entity_type="user", entity_id=emp.id,
                    details={"email": email, "role": "employee", "source": "seed"},
                )
            logins.append(("employee", dept.name, email))
    return logins


async def main(sync_admin: bool = False) -> None:
    async with SessionLocal() as db:
        depts = await _seed_departments(db)
        admin = await _seed_admin(db, sync_admin)
        logins = await _seed_demo(db, depts, admin)
        await db.commit()

    if settings.SEED_ADMIN_EMAIL:
        print("\nAdmin login:")
        print(f"  admin       {settings.SEED_ADMIN_EMAIL.strip().lower()}   (password: SEED_ADMIN_PASSWORD)")
    if logins:
        print("\nDemo logins (password: SEED_DEMO_PASSWORD):")
        for role, dept, email in logins:
            print(f"  {role:<11} {dept:<10} {email}")
    await engine.dispose()


if __name__ == "__main__":
    try:
        asyncio.run(main(sync_admin='--sync-admin' in sys.argv))
    except Exception as exc:  # noqa: BLE001
        print(f"Seed failed: {exc}", file=sys.stderr)
        raise
