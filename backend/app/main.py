from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.routers import auth, departments, employees, health, penalties, supervisors


def create_app() -> FastAPI:
    app = FastAPI(title=settings.APP_NAME, version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)
    for module in (health, auth, supervisors, employees, penalties, departments):
        app.include_router(module.router, prefix=settings.API_PREFIX)
    return app


app = create_app()
