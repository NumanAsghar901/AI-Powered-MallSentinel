import uuid

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import client_ip, require_role
from app.db.session import get_db
from app.models import User, UserRole, UserStatus
from app.schemas.common import Page
from app.schemas.user import EmployeeCreate, EmployeeUpdate, UserOut
from app.services import user_service
from app.services.user_service import SortField, SortOrder

router = APIRouter(prefix="/employees", tags=["employees (supervisor)"])
SupervisorOnly = Depends(require_role(UserRole.supervisor))


@router.get("", response_model=Page[UserOut])
async def list_employees(
    search: str | None = Query(None, max_length=100),
    status: UserStatus | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: SortField = "full_name",
    order: SortOrder = "asc",
    actor: User = SupervisorOnly,
    db: AsyncSession = Depends(get_db),
) -> Page[UserOut]:
    users, total = await user_service.list_department_employees(
        db, actor, search=search, status=status, page=page, page_size=page_size, sort=sort, order=order
    )
    return Page(items=[UserOut.from_user(u) for u in users], total=total, page=page, page_size=page_size)


@router.post("", response_model=UserOut, status_code=201)
async def create_employee(
    body: EmployeeCreate, request: Request, actor: User = SupervisorOnly, db: AsyncSession = Depends(get_db)
) -> UserOut:
    return UserOut.from_user(await user_service.create_department_employee(db, actor, body, client_ip(request)))


@router.get("/{user_id}", response_model=UserOut)
async def get_employee(
    user_id: uuid.UUID, actor: User = SupervisorOnly, db: AsyncSession = Depends(get_db)
) -> UserOut:
    return UserOut.from_user(await user_service.get_department_employee(db, actor, user_id))


@router.patch("/{user_id}", response_model=UserOut)
async def update_employee(
    user_id: uuid.UUID, body: EmployeeUpdate, request: Request,
    actor: User = SupervisorOnly, db: AsyncSession = Depends(get_db),
) -> UserOut:
    return UserOut.from_user(
        await user_service.update_department_employee(db, actor, user_id, body, client_ip(request))
    )


@router.delete("/{user_id}", status_code=204)
async def remove_employee(
    user_id: uuid.UUID, request: Request, actor: User = SupervisorOnly, db: AsyncSession = Depends(get_db)
) -> Response:
    await user_service.remove_department_employee(db, actor, user_id, client_ip(request))
    return Response(status_code=204)
