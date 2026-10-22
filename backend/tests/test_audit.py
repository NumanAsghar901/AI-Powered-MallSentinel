import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.models import AuditLog
from app.services import audit_service
from tests.conftest import API, PASSWORD


async def test_login_success_and_failure_are_audited(client, world, db):
    await client.post(f"{API}/auth/login", json={"email": world.admin.email, "password": "wrong-password-1"})
    await client.post(f"{API}/auth/login", json={"email": world.admin.email, "password": PASSWORD})
    rows = (await db.scalars(select(AuditLog).where(AuditLog.actor_user_id == world.admin.id).order_by(AuditLog.id))).all()
    assert [r.action for r in rows] == ["auth.login_failed", "auth.login_success"]
    assert rows[0].details["reason"] == "wrong_password"


async def test_unknown_email_failure_is_audited_without_password(client, db):
    await client.post(f"{API}/auth/login", json={"email": "ghost@mallsentinel-tests.com", "password": "very-secret-pw1"})
    row = await db.scalar(select(AuditLog).where(AuditLog.actor_email == "ghost@mallsentinel-tests.com"))
    assert row.action == "auth.login_failed" and "very-secret-pw1" not in str(row.details)


async def test_lockout_is_audited(client, world, db):
    for _ in range(5):
        await client.post(f"{API}/auth/login", json={"email": world.admin.email, "password": "wrong-password-1"})
    await client.post(f"{API}/auth/login", json={"email": world.admin.email, "password": PASSWORD})
    actions = [r.action for r in (await db.scalars(select(AuditLog).where(AuditLog.actor_user_id == world.admin.id))).all()]
    assert "auth.account_locked" in actions and "auth.login_blocked" in actions


async def test_chain_is_valid_and_linked(client, world, db):
    await client.post(f"{API}/auth/login", json={"email": world.admin.email, "password": PASSWORD})
    await client.post(f"{API}/auth/login", json={"email": world.admin.email, "password": "wrong-password-1"})
    result = await audit_service.verify_chain(db)
    assert result.ok and result.checked >= 2
    rows = (await db.scalars(select(AuditLog).order_by(AuditLog.id))).all()
    for prev, cur in zip(rows, rows[1:]):
        assert cur.prev_hash == prev.hash


async def test_update_is_blocked_by_trigger(client, world, db):
    await client.post(f"{API}/auth/login", json={"email": world.admin.email, "password": PASSWORD})
    with pytest.raises(DBAPIError, match="append-only"):
        await db.execute(text("UPDATE audit_log SET action = 'tampered'"))
    await db.rollback()


async def test_delete_and_truncate_are_blocked_by_trigger(client, world, db):
    await client.post(f"{API}/auth/login", json={"email": world.admin.email, "password": PASSWORD})
    with pytest.raises(DBAPIError, match="append-only"):
        await db.execute(text("DELETE FROM audit_log"))
    await db.rollback()
    with pytest.raises(DBAPIError, match="append-only"):
        await db.execute(text("TRUNCATE audit_log"))
    await db.rollback()


async def test_verify_chain_detects_tampering(client, world, db):
    await client.post(f"{API}/auth/login", json={"email": world.admin.email, "password": PASSWORD})
    # Bypass the trigger as the table owner, the way a malicious DBA would.
    await db.execute(text("ALTER TABLE audit_log DISABLE TRIGGER USER"))
    try:
        await db.execute(text("UPDATE audit_log SET details = '{\"forged\": true}' "
                              "WHERE id = (SELECT max(id) FROM audit_log)"))
        await db.commit()
        result = await audit_service.verify_chain(db)
        assert not result.ok and result.broken_at_id is not None
    finally:
        await db.execute(text("UPDATE audit_log SET details = '{}' WHERE details = '{\"forged\": true}'::jsonb"))
        await db.execute(text("ALTER TABLE audit_log ENABLE TRIGGER USER"))
        await db.commit()


async def test_password_reset_is_audited(client, world, db, sent_emails):
    await client.post(f"{API}/auth/forgot-password", json={"email": world.admin.email})
    await client.post(f"{API}/auth/reset-password", json={"token": sent_emails[0]["token"], "new_password": "Qq1-new-password"})
    actions = [r.action for r in (await db.scalars(select(AuditLog).where(AuditLog.actor_user_id == world.admin.id))).all()]
    assert "auth.password_reset_requested" in actions and "auth.password_reset_completed" in actions


async def test_error_format_is_consistent(client):
    r = await client.get(f"{API}/does-not-exist")
    assert r.status_code == 404 and set(r.json()) == {"detail", "code"} and r.json()["code"] == "NOT_FOUND"
    r = await client.get(f"{API}/auth/me")
    assert r.json()["code"] == "UNAUTHORIZED"


async def test_health(client):
    r = await client.get(f"{API}/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
