from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables (or backend/.env)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "MallSentinel API"
    APP_ENV: str = "development"
    API_PREFIX: str = "/api/v1"

    DATABASE_URL: str
    TEST_DATABASE_URL: str | None = None

    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    REFRESH_COOKIE_NAME: str = "ms_refresh"
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"

    # Comma-separated list of allowed frontend origins.
    CORS_ORIGINS: str = "http://localhost:5173"
    FRONTEND_URL: str = "http://localhost:5173"

    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    PASSWORD_RESET_EXPIRE_MINUTES: int = 30

    # Gmail SMTP. SMTP_PASSWORD must be a Google "App Password" (needs 2-step verification), not the account password.
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_STARTTLS: bool = True
    # Gmail always sends from the authenticated account; this only sets the display name part.
    SMTP_FROM: str | None = None

    SEED_ADMIN_EMAIL: str | None = None
    SEED_ADMIN_PASSWORD: str | None = None
    SEED_ADMIN_NAME: str = "System Administrator"
    SEED_DEMO_PASSWORD: str | None = None
    SEED_DEMO_EMAIL_DOMAIN: str = "demo.mallsentinel.pk"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def smtp_configured(self) -> bool:
        return bool(self.SMTP_USER and self.SMTP_PASSWORD)

    @property
    def mail_from(self) -> str:
        return self.SMTP_FROM or f"MallSentinel <{self.SMTP_USER}>"

    @property
    def refresh_cookie_path(self) -> str:
        return f"{self.API_PREFIX}/auth"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
