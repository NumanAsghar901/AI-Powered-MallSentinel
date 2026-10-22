import re

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import ANY_ROLE, client_ip, require_role
from app.db.session import get_db
from app.models import User
from app.schemas.auth import ForgotPasswordRequest, LoginRequest, ResetPasswordRequest, TokenResponse
from app.schemas.common import Message
from app.schemas.user import UserOut
from app.services import auth_service
from app.services.auth_service import AuthResult

router = APIRouter(prefix="/auth", tags=["auth"])


_TAB_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")


def _cookie_name(request: Request) -> str:
    """Each browser tab sends its own X-Tab-Id, so tabs keep independent sessions.

    A single shared cookie would make a sign-in in one tab replace the session of every other tab.
    """
    tab = request.headers.get("x-tab-id", "")
    return f"{settings.REFRESH_COOKIE_NAME}_{tab}" if _TAB_ID.match(tab) else settings.REFRESH_COOKIE_NAME


def _set_cookie(request: Request, response: Response, token: str) -> None:
    response.set_cookie(
        _cookie_name(request),
        token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,  # type: ignore[arg-type]
        path=settings.refresh_cookie_path,
    )


def _response(request: Request, result: AuthResult, response: Response) -> TokenResponse:
    _set_cookie(request, response, result.refresh_token)
    return TokenResponse(
        access_token=result.access_token, expires_in=result.expires_in, user=UserOut.from_user(result.user)
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> TokenResponse:
    result = await auth_service.login(
        db, body.email, body.password, client_ip(request), request.headers.get("user-agent")
    )
    return _response(request, result, response)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    raw = request.cookies.get(_cookie_name(request))
    result = await auth_service.refresh(db, raw, client_ip(request), request.headers.get("user-agent"))
    return _response(request, result, response)


@router.post("/logout", response_model=Message)
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> Message:
    await auth_service.logout(db, request.cookies.get(_cookie_name(request)), client_ip(request))
    response.delete_cookie(_cookie_name(request), path=settings.refresh_cookie_path)
    return Message(detail="Signed out.")


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(require_role(*ANY_ROLE))) -> UserOut:
    return UserOut.from_user(user)


@router.post("/forgot-password", response_model=Message, status_code=202)
async def forgot_password(
    body: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)
) -> Message:
    await auth_service.forgot_password(db, body.email, client_ip(request))
    return Message(detail="If an account exists for that email, a reset link has been sent.")


@router.post("/reset-password", response_model=Message)
async def reset_password(
    body: ResetPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)
) -> Message:
    await auth_service.reset_password(db, body.token, body.new_password, client_ip(request))
    return Message(detail="Your password has been reset. You can now sign in.")
