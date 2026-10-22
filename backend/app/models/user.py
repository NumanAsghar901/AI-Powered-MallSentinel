import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.department import Department
from app.models.enums import AuthProvider, UserRole, UserStatus


def _pg_enum(enum_cls: type, name: str) -> Enum:
    return Enum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str] = mapped_column(String(150))
    phone: Mapped[str | None] = mapped_column(String(30))
    role: Mapped[UserRole] = mapped_column(_pg_enum(UserRole, "user_role"), index=True)
    status: Mapped[UserStatus] = mapped_column(
        _pg_enum(UserStatus, "user_status"), default=UserStatus.active, server_default="active", index=True
    )
    # Nullable so Google-only accounts can exist later.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    auth_provider: Mapped[AuthProvider] = mapped_column(
        _pg_enum(AuthProvider, "auth_provider"), default=AuthProvider.password, server_default="password"
    )
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)

    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    admin_profile: Mapped["AdminProfile | None"] = relationship(
        back_populates="user", uselist=False, lazy="selectin", cascade="all, delete-orphan"
    )
    supervisor_profile: Mapped["SupervisorProfile | None"] = relationship(
        back_populates="user", uselist=False, lazy="selectin", cascade="all, delete-orphan"
    )
    employee_profile: Mapped["EmployeeProfile | None"] = relationship(
        back_populates="user",
        uselist=False,
        lazy="selectin",
        cascade="all, delete-orphan",
        foreign_keys="EmployeeProfile.user_id",
    )

    @property
    def department(self) -> Department | None:
        if self.supervisor_profile:
            return self.supervisor_profile.department
        if self.employee_profile:
            return self.employee_profile.department
        return None


class AdminProfile(Base):
    __tablename__ = "admin_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    access_level: Mapped[str] = mapped_column(String(50), default="full", server_default="full")

    user: Mapped[User] = relationship(back_populates="admin_profile")


class SupervisorProfile(Base):
    __tablename__ = "supervisor_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), index=True)
    designation: Mapped[str | None] = mapped_column(String(100))

    user: Mapped[User] = relationship(back_populates="supervisor_profile")
    department: Mapped[Department] = relationship(lazy="selectin")


class EmployeeProfile(Base):
    __tablename__ = "employee_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), index=True)
    supervisor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    employee_code: Mapped[str | None] = mapped_column(String(30), unique=True)
    designation: Mapped[str | None] = mapped_column(String(100))
    shift: Mapped[str | None] = mapped_column(String(30))
    assigned_area: Mapped[str | None] = mapped_column(String(150))

    user: Mapped[User] = relationship(back_populates="employee_profile", foreign_keys=[user_id])
    department: Mapped[Department] = relationship(lazy="selectin")
