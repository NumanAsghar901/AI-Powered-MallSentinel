import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.security import utcnow
from app.models import User
from app.models.enums import AuthProvider, UserRole, UserStatus
from app.schemas.common import Name, NormalizedEmail, Password, Phone

Shift = Literal["morning", "evening", "night"]
ShortText = Annotated[str, Field(max_length=150)]


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    description: str | None = None


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    role: UserRole
    status: UserStatus
    auth_provider: AuthProvider
    is_locked: bool
    last_login_at: datetime | None
    created_at: datetime
    department: DepartmentOut | None = None
    designation: str | None = None
    shift: str | None = None
    assigned_area: str | None = None
    employee_code: str | None = None
    supervisor_id: uuid.UUID | None = None
    access_level: str | None = None

    @classmethod
    def from_user(cls, user: User) -> "UserOut":
        sp, ep, ap = user.supervisor_profile, user.employee_profile, user.admin_profile
        dept = user.department
        return cls(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            phone=user.phone,
            role=user.role,
            status=user.status,
            auth_provider=user.auth_provider,
            is_locked=bool(user.locked_until and user.locked_until > utcnow()),
            last_login_at=user.last_login_at,
            created_at=user.created_at,
            department=DepartmentOut.model_validate(dept) if dept else None,
            designation=(sp.designation if sp else ep.designation if ep else None),
            shift=ep.shift if ep else None,
            assigned_area=ep.assigned_area if ep else None,
            employee_code=ep.employee_code if ep else None,
            supervisor_id=ep.supervisor_id if ep else None,
            access_level=ap.access_level if ap else None,
        )


class _ProfileFields(BaseModel):
    designation: ShortText | None = None
    shift: Shift | None = None
    assigned_area: ShortText | None = None
    employee_code: Annotated[str, Field(max_length=30)] | None = None


class SupervisorCreate(BaseModel):
    """Admin creates supervisors. Employees are created by supervisors (EmployeeCreate)."""

    email: NormalizedEmail
    full_name: Name
    phone: Phone | None = None
    password: Password
    department_id: int
    designation: ShortText | None = None


class SupervisorUpdate(BaseModel):
    email: NormalizedEmail | None = None
    full_name: Name | None = None
    phone: Phone | None = None
    department_id: int | None = None
    designation: ShortText | None = None
    password: Password | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> "SupervisorUpdate":
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update")
        return self


class EmployeeCreate(_ProfileFields):
    """Supervisor creates an employee in their own department."""

    email: NormalizedEmail
    full_name: Name
    phone: Phone | None = None
    password: Password


class EmployeeUpdate(_ProfileFields):
    email: NormalizedEmail | None = None
    full_name: Name | None = None
    phone: Phone | None = None
    status: Literal["active", "disabled"] | None = None
    password: Password | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> "EmployeeUpdate":
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update")
        return self
