import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import client_ip, require_role
from app.db.session import get_db
from app.models import User, UserRole, UserStatus
from app.schemas.common import Page
from app.schemas.user import SupervisorCreate, SupervisorUpdate, UserOut
from app.services import user_service
from app.services.user_service import SortField, SortOrder

# Admins manage supervisors only. Employees belong to their supervisor and are invisible to admins.
router = APIRouter(prefix="/supervisors", tags=["supervisors (admin)"])
AdminOnly = Depends(require_role(UserRole.admin))


@router.get("", response_model=Page[UserOut])
async def list_supervisors(
    search: str | None = Query(None, max_length=100),
    status: UserStatus | None = None,
    department_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: SortField = "created_at",
    order: SortOrder = "desc",
    _: User = AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> Page[UserOut]:
    users, total = await user_service.list_supervisors(
        db, search=search, status=status, department_id=department_id,
        page=page, page_size=page_size, sort=sort, order=order,
    )
    return Page(items=[UserOut.from_user(u) for u in users], total=total, page=page, page_size=page_size)


@router.post("", response_model=UserOut, status_code=201)
async def create_supervisor(
    body: SupervisorCreate, request: Request, actor: User = AdminOnly, db: AsyncSession = Depends(get_db)
) -> UserOut:
    return UserOut.from_user(await user_service.create_supervisor(db, actor, body, client_ip(request)))


@router.get("/{user_id}", response_model=UserOut)
async def get_supervisor(user_id: uuid.UUID, _: User = AdminOnly, db: AsyncSession = Depends(get_db)) -> UserOut:
    return UserOut.from_user(await user_service.get_supervisor(db, user_id))


@router.patch("/{user_id}", response_model=UserOut)
async def update_supervisor(
    user_id: uuid.UUID, body: SupervisorUpdate, request: Request,
    actor: User = AdminOnly, db: AsyncSession = Depends(get_db),
) -> UserOut:
    return UserOut.from_user(await user_service.update_supervisor(db, actor, user_id, body, client_ip(request)))


@router.post("/{user_id}/disable", response_model=UserOut)
async def disable_supervisor(
    user_id: uuid.UUID, request: Request, actor: User = AdminOnly, db: AsyncSession = Depends(get_db)
) -> UserOut:
    return UserOut.from_user(
        await user_service.set_supervisor_status(db, actor, user_id, UserStatus.disabled, client_ip(request))
    )


@router.post("/{user_id}/enable", response_model=UserOut)
async def enable_supervisor(
    user_id: uuid.UUID, request: Request, actor: User = AdminOnly, db: AsyncSession = Depends(get_db)
) -> UserOut:
    return UserOut.from_user(
        await user_service.set_supervisor_status(db, actor, user_id, UserStatus.active, client_ip(request))
    )


@router.post("/{user_id}/unlock", response_model=UserOut)
async def unlock_supervisor(
    user_id: uuid.UUID, request: Request, actor: User = AdminOnly, db: AsyncSession = Depends(get_db)
) -> UserOut:
    return UserOut.from_user(await user_service.unlock_supervisor(db, actor, user_id, client_ip(request)))
