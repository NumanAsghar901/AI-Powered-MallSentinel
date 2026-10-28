import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

from app.models import Penalty
from app.models.enums import EmailStatus, PenaltyAction, PenaltySeverity
from app.schemas.user import DepartmentOut

# What a penalty can be about. Bakery and Meat Shop check PPE; Security checks uniform, weapon and duty zone.
# Free-form "other" is available everywhere. (Later phases will link penalties to detected violations and SOP clauses.)
PPE_REASONS = ("missing_hairnet", "missing_gloves", "missing_mask", "missing_apron")
SECURITY_REASONS = ("uniform_violation", "weapon_not_carried", "left_duty_zone")
REASONS_BY_DEPARTMENT: dict[str, tuple[str, ...]] = {
    "bakery": (*PPE_REASONS, "other"),
    "meat_shop": (*PPE_REASONS, "other"),
    "security": (*SECURITY_REASONS, "other"),
}
Reason = Literal[
    "missing_hairnet", "missing_gloves", "missing_mask", "missing_apron",
    "uniform_violation", "weapon_not_carried", "left_duty_zone", "other",
]

REASON_LABELS = {
    "missing_hairnet": "Hairnet not worn",
    "missing_gloves": "Gloves not worn",
    "missing_mask": "Mask not worn",
    "missing_apron": "Apron not worn",
    "uniform_violation": "Uniform violation",
    "weapon_not_carried": "Weapon not carried",
    "left_duty_zone": "Left assigned duty zone",
    "other": "Other",
}
ACTION_LABELS = {
    "verbal_warning": "Verbal warning",
    "written_warning": "Written warning",
    "fine": "Fine",
    "suspension": "Suspension",
    "other": "Other action",
}


def describe_action(action: PenaltyAction, amount_pkr: int | None, suspension_days: int | None) -> str:
    label = ACTION_LABELS[action.value]
    if action == PenaltyAction.fine and amount_pkr:
        return f"{label}: PKR {amount_pkr:,}"
    if action == PenaltyAction.suspension and suspension_days:
        return f"{label}: {suspension_days} day{'s' if suspension_days != 1 else ''}"
    return label


class PenaltyCreate(BaseModel):
    employee_id: uuid.UUID
    reason: Reason
    severity: PenaltySeverity
    action: PenaltyAction
    amount_pkr: Annotated[int, Field(gt=0, le=10_000_000)] | None = None
    suspension_days: Annotated[int, Field(gt=0, le=90)] | None = None
    notes: Annotated[str, Field(max_length=1000)] | None = None

    @model_validator(mode="after")
    def _action_details(self) -> "PenaltyCreate":
        if self.action == PenaltyAction.fine:
            if self.amount_pkr is None:
                raise ValueError("A fine needs an amount in PKR")
            if self.suspension_days is not None:
                raise ValueError("A fine cannot have suspension days")
        elif self.action == PenaltyAction.suspension:
            if self.suspension_days is None:
                raise ValueError("A suspension needs a number of days")
            if self.amount_pkr is not None:
                raise ValueError("A suspension cannot have an amount")
        elif self.amount_pkr is not None or self.suspension_days is not None:
            raise ValueError("Amount and suspension days only apply to fines and suspensions")
        return self


class PersonRef(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    employee_code: str | None = None


class PenaltyOut(BaseModel):
    id: uuid.UUID
    employee: PersonRef
    issued_by: PersonRef
    department: DepartmentOut
    reason: str
    reason_label: str
    severity: PenaltySeverity
    action: PenaltyAction
    action_label: str
    amount_pkr: int | None
    suspension_days: int | None
    notes: str | None
    email_status: EmailStatus
    email_sent_at: datetime | None
    created_at: datetime

    @classmethod
    def from_penalty(cls, p: Penalty) -> "PenaltyOut":
        ep = p.employee.employee_profile
        return cls(
            id=p.id,
            employee=PersonRef(
                id=p.employee.id, full_name=p.employee.full_name, email=p.employee.email,
                employee_code=ep.employee_code if ep else None,
            ),
            issued_by=PersonRef(id=p.issued_by.id, full_name=p.issued_by.full_name, email=p.issued_by.email),
            department=DepartmentOut.model_validate(p.department),
            reason=p.reason,
            reason_label=REASON_LABELS.get(p.reason, p.reason),
            severity=p.severity,
            action=p.action,
            action_label=describe_action(p.action, p.amount_pkr, p.suspension_days),
            amount_pkr=p.amount_pkr,
            suspension_days=p.suspension_days,
            notes=p.notes,
            email_status=p.email_status,
            email_sent_at=p.email_sent_at,
            created_at=p.created_at,
        )
