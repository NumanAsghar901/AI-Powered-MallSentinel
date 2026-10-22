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

    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 1025
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_STARTTLS: bool = False
    SMTP_FROM: str = "MallSentinel <no-reply@mallsentinel.pk>"

    SEED_ADMIN_EMAIL: str | None = None
    SEED_ADMIN_PASSWORD: str | None = None
    SEED_ADMIN_NAME: str = "System Administrator"
    SEED_DEMO_PASSWORD: str | None = None
    SEED_DEMO_EMAIL_DOMAIN: str = "demo.mallsentinel.pk"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def refresh_cookie_path(self) -> str:
        return f"{self.API_PREFIX}/auth"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
