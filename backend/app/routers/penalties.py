import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import client_ip, require_role
from app.db.session import get_db
from app.models import PenaltySeverity, User, UserRole
from app.schemas.common import Page
from app.schemas.penalty import PenaltyCreate, PenaltyOut
from app.services import penalty_service

router = APIRouter(prefix="/penalties", tags=["penalties"])
SupervisorOnly = Depends(require_role(UserRole.supervisor))
EmployeeOnly = Depends(require_role(UserRole.employee))


# Declared before "/{penalty_id}" so "mine" is never parsed as an id.
@router.get("/mine", response_model=Page[PenaltyOut])
async def my_penalties(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = EmployeeOnly,
    db: AsyncSession = Depends(get_db),
) -> Page[PenaltyOut]:
    items, total = await penalty_service.list_my_penalties(db, user, page=page, page_size=page_size)
    return Page(items=[PenaltyOut.from_penalty(p) for p in items], total=total, page=page, page_size=page_size)


@router.get("", response_model=Page[PenaltyOut])
async def list_penalties(
    search: str | None = Query(None, max_length=100),
    severity: PenaltySeverity | None = None,
    employee_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: User = SupervisorOnly,
    db: AsyncSession = Depends(get_db),
) -> Page[PenaltyOut]:
    items, total = await penalty_service.list_department_penalties(
        db, actor, search=search, severity=severity, employee_id=employee_id, page=page, page_size=page_size
    )
    return Page(items=[PenaltyOut.from_penalty(p) for p in items], total=total, page=page, page_size=page_size)


@router.post("", response_model=PenaltyOut, status_code=201)
async def issue_penalty(
    body: PenaltyCreate, request: Request, actor: User = SupervisorOnly, db: AsyncSession = Depends(get_db)
) -> PenaltyOut:
    return PenaltyOut.from_penalty(await penalty_service.create_penalty(db, actor, body, client_ip(request)))


@router.get("/{penalty_id}", response_model=PenaltyOut)
async def get_penalty(
    penalty_id: uuid.UUID, actor: User = SupervisorOnly, db: AsyncSession = Depends(get_db)
) -> PenaltyOut:
    return PenaltyOut.from_penalty(await penalty_service.get_department_penalty(db, actor, penalty_id))


@router.post("/{penalty_id}/resend-email", response_model=PenaltyOut)
async def resend_penalty_email(
    penalty_id: uuid.UUID, request: Request, actor: User = SupervisorOnly, db: AsyncSession = Depends(get_db)
) -> PenaltyOut:
    return PenaltyOut.from_penalty(await penalty_service.resend_email(db, actor, penalty_id, client_ip(request)))
