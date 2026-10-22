from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import ANY_ROLE, require_role
from app.db.session import get_db
from app.models import Department, User
from app.schemas.user import DepartmentOut

router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("", response_model=list[DepartmentOut])
async def list_departments(
    _: User = Depends(require_role(*ANY_ROLE)), db: AsyncSession = Depends(get_db)
) -> list[Department]:
    return list((await db.scalars(select(Department).order_by(Department.id))).all())
