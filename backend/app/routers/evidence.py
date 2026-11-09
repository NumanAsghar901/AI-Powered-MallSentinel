import uuid
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import client_ip, get_current_user, require_role
from app.core.errors import AppError, Forbidden, NotFound
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import EvidenceReviewStatus, PenaltySeverity, User, UserRole, UserStatus
from app.schemas.common import Page
from app.schemas.evidence import EvidenceOut, EvidenceReviewRequest
from app.services import evidence_service

router = APIRouter(prefix="/evidence", tags=["evidence"])
_bearer = HTTPBearer(auto_error=False)

AdminOrSupervisor = Depends(require_role(UserRole.admin, UserRole.supervisor))
AnyActiveUser = Depends(require_role(UserRole.admin, UserRole.supervisor, UserRole.employee))


async def _resolve_image_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    token: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    raw_token = None
    if credentials:
        raw_token = credentials.credentials
    elif token:
        raw_token = token

    if not raw_token:
        # Check if auth header was sent
        auth_hdr = request.headers.get("Authorization")
        if auth_hdr and auth_hdr.startswith("Bearer "):
            raw_token = auth_hdr[7:].strip()

    if not raw_token:
        raise AppError(401, "UNAUTHORIZED", "Authentication required to view evidence image.")

    try:
        payload = decode_access_token(raw_token)
        user_id = uuid.UUID(payload["sub"])
    except Exception as exc:
        raise AppError(401, "INVALID_TOKEN", "Invalid or expired token.") from exc

    user = await db.get(User, user_id)
    if user is None or user.status != UserStatus.active:
        raise AppError(401, "ACCOUNT_INACTIVE", "Account inactive.")
    return user


@router.get("", response_model=Page[EvidenceOut])
async def list_evidence(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    department_id: int | None = None,
    evidence_source: str | None = None,
    review_status: EvidenceReviewStatus | None = None,
    severity: PenaltySeverity | None = None,
    camera_id: str | None = None,
    search: str | None = Query(None, max_length=100),
    user: User = AnyActiveUser,
    db: AsyncSession = Depends(get_db),
) -> Page[EvidenceOut]:
    items, total = await evidence_service.list_evidence(
        db,
        user,
        department_id=department_id,
        evidence_source=evidence_source,
        review_status=review_status,
        severity=severity,
        camera_id=camera_id,
        search=search,
        page=page,
        page_size=page_size,
    )
    return Page(
        items=[EvidenceOut.from_evidence(e) for e in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{evidence_id}", response_model=EvidenceOut)
async def get_evidence(
    evidence_id: uuid.UUID,
    user: User = AnyActiveUser,
    db: AsyncSession = Depends(get_db),
) -> EvidenceOut:
    evidence = await evidence_service.get_evidence(db, user, evidence_id)
    return EvidenceOut.from_evidence(evidence)


@router.post("/{evidence_id}/review", response_model=EvidenceOut)
async def review_evidence(
    evidence_id: uuid.UUID,
    body: EvidenceReviewRequest,
    request: Request,
    user: User = AdminOrSupervisor,
    db: AsyncSession = Depends(get_db),
) -> EvidenceOut:
    evidence = await evidence_service.review_evidence(
        db,
        user,
        evidence_id,
        action=body.action,
        remarks=body.remarks,
        ip=client_ip(request),
    )
    return EvidenceOut.from_evidence(evidence)


@router.get("/{evidence_id}/image")
async def get_evidence_image(
    evidence_id: uuid.UUID,
    user: User = Depends(_resolve_image_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    evidence = await evidence_service.get_evidence(db, user, evidence_id)
    image_path = evidence_service.get_evidence_image_path(evidence)
    return FileResponse(image_path, media_type="image/jpeg")

