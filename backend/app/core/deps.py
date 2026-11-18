import time
import uuid
from collections.abc import Awaitable, Callable

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, Forbidden
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import EmployeeProfile, SupervisorProfile, User, UserRole, UserStatus

_bearer = HTTPBearer(auto_error=False)
_USER_CACHE: dict[uuid.UUID, tuple[User, float]] = {}


def invalidate_user_cache(user_id: uuid.UUID) -> None:
    _USER_CACHE.pop(user_id, None)


def _unauthorized(detail: str, code: str = "UNAUTHORIZED") -> AppError:
    return AppError(401, code, detail, headers={"WWW-Authenticate": "Bearer"})


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise _unauthorized("Not authenticated.")
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Your session has expired. Please sign in again.", "TOKEN_EXPIRED")
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _unauthorized("Invalid authentication token.", "INVALID_TOKEN")

    now = time.monotonic()
    cached = _USER_CACHE.get(user_id)
    if cached is not None:
        cached_user, expires_at = cached
        if now < expires_at:
            user = await db.merge(cached_user, load=False)
            if user.status != UserStatus.active:
                _USER_CACHE.pop(user_id, None)
                raise _unauthorized("Your account is not active.", "ACCOUNT_INACTIVE")
            if user.password_changed_at and payload.get("iat", 0) < int(user.password_changed_at.timestamp()):
                _USER_CACHE.pop(user_id, None)
                raise _unauthorized("Your session has expired. Please sign in again.", "TOKEN_EXPIRED")
            return user
        else:
            _USER_CACHE.pop(user_id, None)

    stmt = (
        select(User)
        .where(User.id == user_id)
        .options(
            joinedload(User.supervisor_profile).joinedload(SupervisorProfile.department),
            joinedload(User.employee_profile).joinedload(EmployeeProfile.department),
            joinedload(User.admin_profile),
        )
    )
    user = await db.scalar(stmt)
    if user is None or user.status != UserStatus.active:
        raise _unauthorized("Your account is not active.", "ACCOUNT_INACTIVE")
    # Tokens issued before a password change are no longer valid.
    if user.password_changed_at and payload.get("iat", 0) < int(user.password_changed_at.timestamp()):
        raise _unauthorized("Your session has expired. Please sign in again.", "TOKEN_EXPIRED")
    _USER_CACHE[user_id] = (user, now + 20.0)
    return user


def require_role(*roles: UserRole) -> Callable[..., Awaitable[User]]:
    """Dependency factory: `user: User = Depends(require_role(UserRole.admin))`."""

    allowed = set(roles)

    async def _dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise Forbidden("Your role does not have access to this resource.")
        return user

    return _dependency


ANY_ROLE = (UserRole.admin, UserRole.supervisor, UserRole.employee)


def client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None
