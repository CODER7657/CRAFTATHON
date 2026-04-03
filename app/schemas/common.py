from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


T = TypeVar("T")


class SuccessResponse(APIModel, Generic[T]):
    success: bool = True
    data: T
