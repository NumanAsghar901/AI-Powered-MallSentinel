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
