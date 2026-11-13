from pydantic import BaseModel, Field
from datetime import datetime


class RideRequest(BaseModel):
    traveler_name: str = Field(min_length=2)

    flight_id: str
    hotel_id: str

    adults: int = Field(ge=1)
    child_ages: list[int] = []

    large_bags: int = Field(ge=0)
    small_bags: int = Field(ge=0)

    # If omitted, backend will use landing time + 60 minutes
    pickup: datetime | None = None

    # Optional car type
    car_type: str | None = None

    price_inr: float = Field(gt=0)