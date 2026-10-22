"""Consistent error responses: {"detail": "...", "code": "SOME_CODE"}."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

_STATUS_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    423: "ACCOUNT_LOCKED",
    429: "TOO_MANY_REQUESTS",
}


class AppError(Exception):
    def __init__(self, status_code: int, code: str, detail: str, headers: dict[str, str] | None = None):
        self.status_code = status_code
        self.code = code
        self.detail = detail
        self.headers = headers
        super().__init__(detail)


class NotFound(AppError):
    def __init__(self, detail: str = "Resource not found."):
        super().__init__(404, "NOT_FOUND", detail)


class Forbidden(AppError):
    def __init__(self, detail: str = "You do not have permission to perform this action."):
        super().__init__(403, "FORBIDDEN", detail)


class Conflict(AppError):
    def __init__(self, detail: str, code: str = "CONFLICT"):
        super().__init__(409, code, detail)


class BadRequest(AppError):
    def __init__(self, detail: str, code: str = "BAD_REQUEST"):
        super().__init__(400, code, detail)


def _field_errors(exc: RequestValidationError) -> list[dict[str, str]]:
    errors = []
    for err in exc.errors():
        loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path")]
        errors.append({"field": ".".join(loc), "message": str(err.get("msg", "Invalid value"))})
    return errors


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
            headers=exc.headers,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": str(exc.detail), "code": _STATUS_CODES.get(exc.status_code, "ERROR")},
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = _field_errors(exc)
        first = errors[0] if errors else None
        detail = f"{first['field']}: {first['message']}" if first and first["field"] else "Invalid request."
        return JSONResponse(
            status_code=422,
            content={"detail": detail, "code": "VALIDATION_ERROR", "errors": errors},
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Something went wrong. Please try again.", "code": "INTERNAL_ERROR"},
        )
