import os
import secrets
import subprocess
import sys
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

TEST_URL = settings.TEST_DATABASE_URL
if not TEST_URL:
    raise RuntimeError("Set TEST_DATABASE_URL in backend/.env to run the tests.")
if make_url(TEST_URL).database == make_url(settings.DATABASE_URL).database:
    raise RuntimeError("TEST_DATABASE_URL must point at a different database than DATABASE_URL.")

from app.core.deps import get_current_user  # noqa: E402,F401
from app.core.security import hash_password  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    AdminProfile,
    Department,
    EmployeeProfile,
    SupervisorProfile,
    User,
    UserRole,
    UserStatus,
)
from app.services import email_service  # noqa: E402

# Random per run: no credentials are hardcoded anywhere.
PASSWORD = "Aa1" + secrets.token_urlsafe(9)
NEW_PASSWORD = "Bb2" + secrets.token_urlsafe(9)
API = settings.API_PREFIX


@pytest_asyncio.fixture(scope="session")
async def engine():
    url = make_url(TEST_URL)
    admin_engine = create_async_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT", poolclass=NullPool)
    async with admin_engine.connect() as conn:
        exists = await conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": url.database})
        if exists:
            await conn.execute(text(f'DROP DATABASE "{url.database}" WITH (FORCE)'))
        await conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    await admin_engine.dispose()

    env = {**os.environ, "ALEMBIC_DATABASE_URL": TEST_URL}
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True, env=env)

    eng = create_async_engine(TEST_URL, poolclass=NullPool)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session_factory(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async def override() -> AsyncIterator[AsyncSession]:
        async with factory() as s:
            yield s

    app.dependency_overrides[get_db] = override
    yield factory
    app.dependency_overrides.clear()
    # audit_log has no FKs, so CASCADE never touches the append-only ledger.
    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE users, departments RESTART IDENTITY CASCADE"))


@pytest_asyncio.fixture
async def db(session_factory) -> AsyncIterator[AsyncSession]:
    async with session_factory() as s:
        yield s


@pytest_asyncio.fixture
async def client(session_factory) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
def sent_emails(monkeypatch) -> list[dict[str, str]]:
    """Capture reset emails instead of talking to SMTP."""
    outbox: list[dict[str, str]] = []

    async def fake(to: str, full_name: str, reset_url: str) -> None:
        outbox.append({"to": to, "url": reset_url, "token": reset_url.split("token=")[1]})

    monkeypatch.setattr(email_service, "send_password_reset", fake)
    return outbox


@dataclass
class World:
    bakery: Department
    meat: Department
    security: Department
    admin: User
    bakery_sup: User
    meat_sup: User
    bakery_emp: User
    meat_emp: User


def _user(email: str, name: str, role: UserRole, **kw) -> User:
    return User(
        id=uuid.uuid4(), email=email, full_name=name, role=role, status=UserStatus.active,
        password_hash=hash_password(PASSWORD), **kw,
    )


@pytest_asyncio.fixture
async def world(db: AsyncSession) -> World:
    bakery = Department(code="bakery", name="Bakery")
    meat = Department(code="meat_shop", name="Meat Shop")
    security = Department(code="security", name="Security")
    db.add_all([bakery, meat, security])
    await db.flush()

    admin = _user("admin@mallsentinel-tests.com", "Ada Admin", UserRole.admin, admin_profile=AdminProfile())
    bakery_sup = _user("sup.bakery@mallsentinel-tests.com", "Sana Bakery", UserRole.supervisor,
                       supervisor_profile=SupervisorProfile(department_id=bakery.id))
    meat_sup = _user("sup.meat@mallsentinel-tests.com", "Murad Meat", UserRole.supervisor,
                     supervisor_profile=SupervisorProfile(department_id=meat.id))
    db.add_all([admin, bakery_sup, meat_sup])
    await db.flush()
    bakery_emp = _user("emp.bakery@mallsentinel-tests.com", "Bashir Baker", UserRole.employee,
                       employee_profile=EmployeeProfile(department_id=bakery.id, supervisor_id=bakery_sup.id))
    meat_emp = _user("emp.meat@mallsentinel-tests.com", "Mansoor Butcher", UserRole.employee,
                     employee_profile=EmployeeProfile(department_id=meat.id, supervisor_id=meat_sup.id))
    db.add_all([bakery_emp, meat_emp])
    await db.commit()
    return World(bakery, meat, security, admin, bakery_sup, meat_sup, bakery_emp, meat_emp)


async def login(client: AsyncClient, user: User, password: str = PASSWORD) -> dict[str, str]:
    r = await client.post(f"{API}/auth/login", json={"email": user.email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest_asyncio.fixture
async def admin_h(client, world) -> dict[str, str]:
    return await login(client, world.admin)


@pytest_asyncio.fixture
async def sup_h(client, world) -> dict[str, str]:
    return await login(client, world.bakery_sup)


@pytest_asyncio.fixture
async def emp_h(client, world) -> dict[str, str]:
    return await login(client, world.bakery_emp)
