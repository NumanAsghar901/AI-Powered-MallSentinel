import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError
from app.core.security import (
    create_access_token,
    generate_opaque_token,
    hash_password,
    hash_token,
    utcnow,
    verify_password,
)
from app.models import PasswordResetToken, RefreshToken, User, UserStatus
from app.services import audit_service, email_service
from app.services.audit_service import AuditAction

# A rotated refresh token presented again within this window is treated as a benign race
# (two tabs refreshing at once), not as token theft.
_REUSE_GRACE = timedelta(seconds=10)


@dataclass
class AuthResult:
    user: User
    access_token: str
    expires_in: int
    refresh_token: str
    refresh_token_id: uuid.UUID


def _invalid_credentials() -> AppError:
    return AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password.")


def _locked(minutes_left: int) -> AppError:
    unit = "minute" if minutes_left == 1 else "minutes"
    return AppError(
        423,
        "ACCOUNT_LOCKED",
        f"Too many failed sign-in attempts. Your account is locked for {minutes_left} {unit}. "
        "Try again later or contact your administrator.",
    )


def _disabled() -> AppError:
    return AppError(
        403, "ACCOUNT_DISABLED", "Your account has been disabled. Please contact your administrator."
    )


def _session_expired() -> AppError:
    return AppError(401, "SESSION_EXPIRED", "Your session has expired. Please sign in again.")


async def _issue_tokens(db: AsyncSession, user: User, ip: str | None, user_agent: str | None) -> AuthResult:
    raw = generate_opaque_token()
    token_id = uuid.uuid4()
    db.add(
        RefreshToken(
            id=token_id,
            user_id=user.id,
            token_hash=hash_token(raw),
            expires_at=utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            user_agent=(user_agent or "")[:255] or None,
            ip=ip,
        )
    )
    access, expires_in = create_access_token(user.id, user.role.value)
    return AuthResult(
        user=user, access_token=access, expires_in=expires_in, refresh_token=raw, refresh_token_id=token_id
    )


async def revoke_all_sessions(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


async def login(
    db: AsyncSession, email: str, password: str, ip: str | None, user_agent: str | None
) -> AuthResult:
    now = utcnow()
    user = await db.scalar(select(User).where(User.email == email))

    if user is None:
        verify_password(password, None)  # equalise timing
        await audit_service.record(
            db, AuditAction.LOGIN_FAILED, actor_email=email, details={"reason": "unknown_email"}, ip=ip
        )
        await db.commit()
        raise _invalid_credentials()

    if user.locked_until and user.locked_until > now:
        minutes_left = max(1, int((user.locked_until - now).total_seconds() // 60) + 1)
        await audit_service.record(
            db, AuditAction.LOGIN_BLOCKED, actor=user, entity_type="user", entity_id=user.id,
            details={"reason": "locked"}, ip=ip,
        )
        await db.commit()
        raise _locked(minutes_left)

    if user.locked_until:  # lock has expired: start counting again
        user.locked_until = None
        user.failed_login_attempts = 0

    if not verify_password(password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.LOGIN_MAX_ATTEMPTS:
            user.locked_until = now + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
            await audit_service.record(
                db, AuditAction.ACCOUNT_LOCKED, actor=user, entity_type="user", entity_id=user.id,
                details={"attempts": user.failed_login_attempts, "minutes": settings.LOGIN_LOCKOUT_MINUTES},
                ip=ip,
            )
            await db.commit()
            raise _locked(settings.LOGIN_LOCKOUT_MINUTES)
        await audit_service.record(
            db, AuditAction.LOGIN_FAILED, actor=user, entity_type="user", entity_id=user.id,
            details={"reason": "wrong_password", "attempts": user.failed_login_attempts}, ip=ip,
        )
        await db.commit()
        raise _invalid_credentials()

    if user.status != UserStatus.active:
        await audit_service.record(
            db, AuditAction.LOGIN_BLOCKED, actor=user, entity_type="user", entity_id=user.id,
            details={"reason": user.status.value}, ip=ip,
        )
        await db.commit()
        raise _disabled()

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    result = await _issue_tokens(db, user, ip, user_agent)
    await audit_service.record(
        db, AuditAction.LOGIN_SUCCESS, actor=user, entity_type="user", entity_id=user.id,
        details={"role": user.role.value}, ip=ip,
    )
    await db.commit()
    return result


async def refresh(
    db: AsyncSession, raw_token: str | None, ip: str | None, user_agent: str | None
) -> AuthResult:
    if not raw_token:
        raise _session_expired()
    now = utcnow()
    token = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)))
    if token is None:
        raise _session_expired()

    if token.revoked_at is not None:
        if token.replaced_by_id is not None and now - token.revoked_at > _REUSE_GRACE:
            # A rotated token was replayed: assume theft and end every session of this user.
            await revoke_all_sessions(db, token.user_id)
            await audit_service.record(
                db, AuditAction.REFRESH_REUSE, entity_type="user", entity_id=token.user_id, ip=ip
            )
            await db.commit()
        raise _session_expired()

    if token.expires_at <= now:
        raise _session_expired()

    user = await db.get(User, token.user_id)
    if user is None or user.status != UserStatus.active:
        raise _session_expired()

    result = await _issue_tokens(db, user, ip, user_agent)
    token.revoked_at = now
    token.replaced_by_id = result.refresh_token_id
    await db.commit()
    return result


async def logout(db: AsyncSession, raw_token: str | None, ip: str | None) -> None:
    if not raw_token:
        return
    token = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)))
    if token is None or token.revoked_at is not None:
        return
    token.revoked_at = utcnow()
    user = await db.get(User, token.user_id)
    await audit_service.record(
        db, AuditAction.LOGOUT, actor=user, entity_type="user", entity_id=token.user_id, ip=ip
    )
    await db.commit()


async def forgot_password(db: AsyncSession, email: str, ip: str | None) -> None:
    """Always succeeds from the caller's point of view (no account enumeration)."""
    user = await db.scalar(select(User).where(User.email == email))
    eligible = user is not None and user.status == UserStatus.active and user.password_hash is not None

    if not eligible:
        await audit_service.record(
            db, AuditAction.PASSWORD_RESET_REQUESTED, actor_email=email,
            details={"sent": False}, ip=ip,
        )
        await db.commit()
        return

    assert user is not None
    now = utcnow()
    # Only the newest link works.
    await db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=now)
    )
    raw = generate_opaque_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(raw),
            expires_at=now + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES),
        )
    )
    await audit_service.record(
        db, AuditAction.PASSWORD_RESET_REQUESTED, actor=user, entity_type="user", entity_id=user.id,
        details={"sent": True}, ip=ip,
    )
    await db.commit()

    reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={raw}"
    await email_service.send_password_reset(user.email, user.full_name, reset_url)


async def reset_password(db: AsyncSession, raw_token: str, new_password: str, ip: str | None) -> None:
    now = utcnow()
    token = await db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(raw_token))
    )
    if token is None or token.used_at is not None:
        raise AppError(
            400, "RESET_TOKEN_INVALID", "This reset link is invalid or has already been used."
        )
    if token.expires_at <= now:
        raise AppError(400, "RESET_TOKEN_EXPIRED", "This reset link has expired. Please request a new one.")

    user = await db.get(User, token.user_id)
    if user is None or user.status != UserStatus.active:
        raise AppError(400, "RESET_TOKEN_INVALID", "This reset link is invalid or has already been used.")

    token.used_at = now
    user.password_hash = hash_password(new_password)
    user.password_changed_at = now
    user.failed_login_attempts = 0
    user.locked_until = None
    await revoke_all_sessions(db, user.id)
    await audit_service.record(
        db, AuditAction.PASSWORD_RESET_COMPLETED, actor=user, entity_type="user", entity_id=user.id, ip=ip
    )
    await db.commit()
