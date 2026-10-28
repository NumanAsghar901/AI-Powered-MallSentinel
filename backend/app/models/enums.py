import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    supervisor = "supervisor"
    employee = "employee"


class UserStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"
    removed = "removed"


class AuthProvider(str, enum.Enum):
    password = "password"
    google = "google"


class DepartmentCode(str, enum.Enum):
    bakery = "bakery"
    meat_shop = "meat_shop"
    security = "security"


class PenaltySeverity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class PenaltyAction(str, enum.Enum):
    verbal_warning = "verbal_warning"
    written_warning = "written_warning"
    fine = "fine"
    suspension = "suspension"
    other = "other"


class EmailStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"
    not_configured = "not_configured"
