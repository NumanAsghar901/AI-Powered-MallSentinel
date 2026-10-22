import asyncio
from datetime import timedelta

from sqlalchemy import select, update

from app.core.config import settings
from app.core.security import hash_token, utcnow
from app.models import PasswordResetToken, RefreshToken, User, UserStatus
from tests.conftest import API, NEW_PASSWORD, PASSWORD, login


async def _login(client, email, password):
    return await client.post(f"{API}/auth/login", json={"email": email, "password": password})


async def test_login_success_returns_role_token_and_httponly_cookie(client, world):
    r = await _login(client, world.admin.email, PASSWORD)
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "admin"
    assert body["access_token"] and body["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    cookie = r.headers["set-cookie"].lower()
    assert settings.REFRESH_COOKIE_NAME in cookie and "httponly" in cookie
    assert "password_hash" not in str(body)


async def test_login_identifies_each_role(client, world):
    for user, role in ((world.bakery_sup, "supervisor"), (world.bakery_emp, "employee")):
        r = await _login(client, user.email, PASSWORD)
        assert r.json()["user"]["role"] == role
    assert (await _login(client, world.bakery_sup.email, PASSWORD)).json()["user"]["department"]["code"] == "bakery"


async def test_login_email_is_case_insensitive(client, world):
    assert (await _login(client, world.admin.email.upper(), PASSWORD)).status_code == 200


async def test_login_wrong_password_and_unknown_email_are_indistinguishable(client, world):
    a = await _login(client, world.admin.email, "wrong-password-1")
    b = await _login(client, "nobody@mallsentinel-tests.com", "wrong-password-1")
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json() == {"detail": "Incorrect email or password.", "code": "INVALID_CREDENTIALS"}


async def test_login_validation_errors(client):
    r = await client.post(f"{API}/auth/login", json={"email": "not-an-email", "password": "x"})
    assert r.status_code == 422 and r.json()["code"] == "VALIDATION_ERROR"
    r = await client.post(f"{API}/auth/login", json={"email": "a@b.co"})
    assert r.status_code == 422


async def test_lockout_after_max_attempts_then_correct_password_is_refused(client, world):
    for _ in range(settings.LOGIN_MAX_ATTEMPTS - 1):
        assert (await _login(client, world.admin.email, "wrong-password-1")).json()["code"] == "INVALID_CREDENTIALS"
    r = await _login(client, world.admin.email, "wrong-password-1")
    assert r.status_code == 423 and r.json()["code"] == "ACCOUNT_LOCKED"
    # Even the right password is refused while locked.
    r = await _login(client, world.admin.email, PASSWORD)
    assert r.status_code == 423 and r.json()["code"] == "ACCOUNT_LOCKED"


async def test_lockout_expires(client, world, db):
    for _ in range(settings.LOGIN_MAX_ATTEMPTS):
        await _login(client, world.admin.email, "wrong-password-1")
    await db.execute(update(User).where(User.id == world.admin.id).values(locked_until=utcnow() - timedelta(seconds=1)))
    await db.commit()
    assert (await _login(client, world.admin.email, PASSWORD)).status_code == 200


async def test_successful_login_resets_failed_counter(client, world, db):
    for _ in range(settings.LOGIN_MAX_ATTEMPTS - 1):
        await _login(client, world.admin.email, "wrong-password-1")
    assert (await _login(client, world.admin.email, PASSWORD)).status_code == 200
    for _ in range(settings.LOGIN_MAX_ATTEMPTS - 1):
        assert (await _login(client, world.admin.email, "wrong-password-1")).status_code == 401


async def test_disabled_account_cannot_login(client, world, db):
    await db.execute(update(User).where(User.id == world.bakery_emp.id).values(status=UserStatus.disabled))
    await db.commit()
    r = await _login(client, world.bakery_emp.email, PASSWORD)
    assert r.status_code == 403 and r.json()["code"] == "ACCOUNT_DISABLED"


async def test_disabled_account_with_wrong_password_gets_generic_error(client, world, db):
    await db.execute(update(User).where(User.id == world.bakery_emp.id).values(status=UserStatus.disabled))
    await db.commit()
    r = await _login(client, world.bakery_emp.email, "wrong-password-1")
    assert r.json()["code"] == "INVALID_CREDENTIALS"


async def test_me_requires_token(client, world, admin_h):
    assert (await client.get(f"{API}/auth/me")).status_code == 401
    r = await client.get(f"{API}/auth/me", headers=admin_h)
    assert r.status_code == 200 and r.json()["email"] == world.admin.email
    r = await client.get(f"{API}/auth/me", headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401 and r.json()["code"] == "INVALID_TOKEN"


async def test_refresh_rotates_token_and_replay_after_grace_revokes_family(client, world, db):
    r = await _login(client, world.admin.email, PASSWORD)
    old_cookie = r.cookies.get(settings.REFRESH_COOKIE_NAME)
    r2 = await client.post(f"{API}/auth/refresh")
    assert r2.status_code == 200 and r2.json()["user"]["email"] == world.admin.email
    new_cookie = r2.cookies.get(settings.REFRESH_COOKIE_NAME)
    assert new_cookie and new_cookie != old_cookie

    # Pretend the rotation happened a while ago, then replay the old token.
    await db.execute(update(RefreshToken).where(RefreshToken.revoked_at.is_not(None)).values(
        revoked_at=utcnow() - timedelta(minutes=5)))
    await db.commit()
    client.cookies.clear()
    client.cookies.set(settings.REFRESH_COOKIE_NAME, old_cookie, path=settings.refresh_cookie_path)
    assert (await client.post(f"{API}/auth/refresh")).status_code == 401
    live = (await db.scalars(select(RefreshToken).where(RefreshToken.revoked_at.is_(None)))).all()
    assert live == []


async def test_refresh_without_cookie_and_expired_token(client, world, db):
    r = await client.post(f"{API}/auth/refresh")
    assert r.status_code == 401 and r.json()["code"] == "SESSION_EXPIRED"
    await _login(client, world.admin.email, PASSWORD)
    await db.execute(update(RefreshToken).values(expires_at=utcnow() - timedelta(seconds=1)))
    await db.commit()
    assert (await client.post(f"{API}/auth/refresh")).status_code == 401


async def test_logout_revokes_refresh_token(client, world):
    await _login(client, world.admin.email, PASSWORD)
    assert (await client.post(f"{API}/auth/logout")).status_code == 200
    client.cookies.clear()
    assert (await client.post(f"{API}/auth/refresh")).status_code == 401


async def test_disabling_user_kills_existing_access_token(client, world, admin_h, emp_h):
    assert (await client.get(f"{API}/auth/me", headers=emp_h)).status_code == 200
    r = await client.post(f"{API}/users/{world.bakery_emp.id}/disable", headers=admin_h)
    assert r.status_code == 200
    r = await client.get(f"{API}/auth/me", headers=emp_h)
    assert r.status_code == 401 and r.json()["code"] == "ACCOUNT_INACTIVE"


# ----------------------------------------------------------------- password reset


async def test_forgot_password_is_generic_and_sends_email_only_for_real_accounts(client, world, sent_emails):
    r = await client.post(f"{API}/auth/forgot-password", json={"email": world.admin.email})
    r2 = await client.post(f"{API}/auth/forgot-password", json={"email": "ghost@mallsentinel-tests.com"})
    assert r.status_code == r2.status_code == 202 and r.json() == r2.json()
    assert [m["to"] for m in sent_emails] == [world.admin.email]


async def test_forgot_password_validation(client):
    assert (await client.post(f"{API}/auth/forgot-password", json={"email": "nope"})).status_code == 422


async def test_reset_password_happy_path_is_single_use_and_revokes_sessions(client, world, sent_emails):
    await _login(client, world.admin.email, PASSWORD)
    await client.post(f"{API}/auth/forgot-password", json={"email": world.admin.email})
    token = sent_emails[0]["token"]

    r = await client.post(f"{API}/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD})
    assert r.status_code == 200
    assert (await _login(client, world.admin.email, PASSWORD)).status_code == 401
    assert (await _login(client, world.admin.email, NEW_PASSWORD)).status_code == 200

    # single use
    r = await client.post(f"{API}/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD + "x"})
    assert r.status_code == 400 and r.json()["code"] == "RESET_TOKEN_INVALID"


async def test_old_access_token_dies_after_password_reset(client, world, sent_emails, admin_h):
    assert (await client.get(f"{API}/auth/me", headers=admin_h)).status_code == 200
    await asyncio.sleep(1.1)  # JWT iat has one-second resolution
    await client.post(f"{API}/auth/forgot-password", json={"email": world.admin.email})
    await client.post(f"{API}/auth/reset-password", json={"token": sent_emails[0]["token"], "new_password": NEW_PASSWORD})
    r = await client.get(f"{API}/auth/me", headers=admin_h)
    assert r.status_code == 401 and r.json()["code"] == "TOKEN_EXPIRED"


async def test_reset_token_expiry(client, world, db, sent_emails):
    await client.post(f"{API}/auth/forgot-password", json={"email": world.admin.email})
    await db.execute(update(PasswordResetToken).values(expires_at=utcnow() - timedelta(seconds=1)))
    await db.commit()
    r = await client.post(f"{API}/auth/reset-password",
                          json={"token": sent_emails[0]["token"], "new_password": NEW_PASSWORD})
    assert r.status_code == 400 and r.json()["code"] == "RESET_TOKEN_EXPIRED"


async def test_reset_token_is_stored_hashed(client, world, db, sent_emails):
    await client.post(f"{API}/auth/forgot-password", json={"email": world.admin.email})
    row = await db.scalar(select(PasswordResetToken))
    assert row.token_hash == hash_token(sent_emails[0]["token"]) and sent_emails[0]["token"] not in row.token_hash


async def test_newer_reset_link_invalidates_older(client, world, sent_emails):
    await client.post(f"{API}/auth/forgot-password", json={"email": world.admin.email})
    await client.post(f"{API}/auth/forgot-password", json={"email": world.admin.email})
    old, new = sent_emails[0]["token"], sent_emails[1]["token"]
    assert (await client.post(f"{API}/auth/reset-password", json={"token": old, "new_password": NEW_PASSWORD})).status_code == 400
    assert (await client.post(f"{API}/auth/reset-password", json={"token": new, "new_password": NEW_PASSWORD})).status_code == 200


async def test_reset_validation_errors(client):
    r = await client.post(f"{API}/auth/reset-password", json={"token": "short", "new_password": "x"})
    assert r.status_code == 422
    r = await client.post(f"{API}/auth/reset-password", json={"token": "x" * 40, "new_password": "onlyletters"})
    assert r.status_code == 422
    r = await client.post(f"{API}/auth/reset-password", json={"token": "x" * 40, "new_password": NEW_PASSWORD})
    assert r.status_code == 400 and r.json()["code"] == "RESET_TOKEN_INVALID"


async def test_reset_unlocks_locked_account(client, world, sent_emails):
    for _ in range(settings.LOGIN_MAX_ATTEMPTS):
        await _login(client, world.admin.email, "wrong-password-1")
    await client.post(f"{API}/auth/forgot-password", json={"email": world.admin.email})
    await client.post(f"{API}/auth/reset-password", json={"token": sent_emails[0]["token"], "new_password": NEW_PASSWORD})
    assert (await _login(client, world.admin.email, NEW_PASSWORD)).status_code == 200


async def test_disabled_user_gets_no_reset_email(client, world, db, sent_emails):
    await db.execute(update(User).where(User.id == world.bakery_emp.id).values(status=UserStatus.disabled))
    await db.commit()
    assert (await client.post(f"{API}/auth/forgot-password", json={"email": world.bakery_emp.email})).status_code == 202
    assert sent_emails == []


async def test_google_ready_columns_exist_and_password_hash_nullable(db):
    from sqlalchemy import text
    rows = (await db.execute(text(
        "SELECT column_name, is_nullable FROM information_schema.columns "
        "WHERE table_name='users' AND column_name IN ('password_hash','google_sub','auth_provider')"))).all()
    cols = dict(rows)
    assert cols == {"password_hash": "YES", "google_sub": "YES", "auth_provider": "NO"}


async def test_passwordless_account_cannot_login(client, db, world):
    from sqlalchemy import text
    await db.execute(text("UPDATE users SET auth_provider='google', google_sub='sub-1', password_hash=NULL "
                          "WHERE email = :e"), {"e": world.bakery_emp.email})
    await db.commit()
    r = await _login(client, world.bakery_emp.email, PASSWORD)
    assert r.status_code == 401 and r.json()["code"] == "INVALID_CREDENTIALS"


# ----------------------------------------------------------------- independent tabs


async def test_tabs_keep_independent_sessions(client, world):
    tab_a, tab_b = {"X-Tab-Id": "tab-aaaaaaaa"}, {"X-Tab-Id": "tab-bbbbbbbb"}
    ra = await client.post(f"{API}/auth/login", json={"email": world.admin.email, "password": PASSWORD}, headers=tab_a)
    rb = await client.post(f"{API}/auth/login", json={"email": world.bakery_emp.email, "password": PASSWORD}, headers=tab_b)
    assert ra.status_code == rb.status_code == 200

    # Signing in as someone else in tab B must not change who tab A is.
    assert (await client.post(f"{API}/auth/refresh", headers=tab_a)).json()["user"]["role"] == "admin"
    assert (await client.post(f"{API}/auth/refresh", headers=tab_b)).json()["user"]["role"] == "employee"

    # Signing out of tab B leaves tab A signed in.
    assert (await client.post(f"{API}/auth/logout", headers=tab_b)).status_code == 200
    assert (await client.post(f"{API}/auth/refresh", headers=tab_b)).status_code == 401
    assert (await client.post(f"{API}/auth/refresh", headers=tab_a)).status_code == 200


async def test_malformed_tab_id_falls_back_to_default_cookie(client, world):
    bad = {"X-Tab-Id": "../evil;path"}
    r = await client.post(f"{API}/auth/login", json={"email": world.admin.email, "password": PASSWORD}, headers=bad)
    assert r.status_code == 200
    assert settings.REFRESH_COOKIE_NAME + "=" in r.headers["set-cookie"]
    assert "evil" not in r.headers["set-cookie"]
