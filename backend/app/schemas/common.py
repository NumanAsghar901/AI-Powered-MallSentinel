import re
from typing import Annotated, Generic, TypeVar

from pydantic import AfterValidator, BaseModel, EmailStr, Field

T = TypeVar("T")


def _check_password(value: str) -> str:
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("Password must contain at least one letter and one number")
    return value


Password = Annotated[str, Field(min_length=8, max_length=128), AfterValidator(_check_password)]
NormalizedEmail = Annotated[EmailStr, AfterValidator(lambda v: v.strip().lower())]
Name = Annotated[str, Field(min_length=2, max_length=150), AfterValidator(lambda v: v.strip())]
Phone = Annotated[str, Field(max_length=30, pattern=r"^[0-9+\-\s()]{7,30}$")]


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class Message(BaseModel):
    detail: str
