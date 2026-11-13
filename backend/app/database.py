"""
database.py - SQLAlchemy engine, ORM models, and session factory for RidePort.
Falls back gracefully if MySQL is unavailable (DB_AVAILABLE = False).
"""

import json
import logging
import os
from datetime import datetime

from dotenv import load_dotenv
from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    Numeric,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Load .env from the backend directory
# ---------------------------------------------------------------------------
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.dirname(_HERE)
load_dotenv(os.path.join(_BACKEND_DIR, ".env"))

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://root:123456@localhost:3306/rideport?charset=utf8mb4",
)

# ---------------------------------------------------------------------------
# ORM Base
# ---------------------------------------------------------------------------


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# ORM Models
# ---------------------------------------------------------------------------


class RideRequestDB(Base):
    __tablename__ = "ride_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    request_id = Column(String(50), unique=True, index=True, nullable=False)
    traveler_name = Column(String(255), nullable=False)
    flight_id = Column(String(50), nullable=False)
    hotel_id = Column(String(50), nullable=False)
    airport = Column(String(10), nullable=False)
    adults = Column(Integer, nullable=False)
    child_ages = Column(Text, nullable=True)        # stored as JSON string
    large_bags = Column(Integer, nullable=False, default=0)
    small_bags = Column(Integer, nullable=False, default=0)
    pickup = Column(String(50), nullable=False)     # ISO datetime string
    car_type = Column(String(50), nullable=True)
    price_inr = Column(Numeric(10, 2), nullable=False)
    status = Column(String(20), nullable=False, default="OPEN")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class OfferDB(Base):
    __tablename__ = "offers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    offer_id = Column(String(50), unique=True, index=True, nullable=False)
    request_id = Column(String(50), index=True, nullable=False)
    company_id = Column(String(50), nullable=False)
    vehicle_id = Column(String(50), nullable=False)
    price_inr = Column(Numeric(10, 2), nullable=False)
    status = Column(String(20), nullable=False, default="OFFERED")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class BookingDB(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    booking_id = Column(String(50), unique=True, index=True, nullable=False)
    booking_number = Column(String(10), unique=True, index=True, nullable=False)
    offer_id = Column(String(50), nullable=False)
    request_id = Column(String(50), index=True, nullable=False)
    traveler_name = Column(String(255), nullable=False)
    flight_id = Column(String(50), nullable=False)
    hotel_id = Column(String(50), nullable=False)
    pickup = Column(String(50), nullable=False)
    company_id = Column(String(50), nullable=False)
    vehicle_id = Column(String(50), nullable=False)
    price_inr = Column(Numeric(10, 2), nullable=False)
    drive_minutes = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="BOOKED")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class ChangeRequestDB(Base):
    __tablename__ = "change_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    change_id = Column(String(50), unique=True, index=True, nullable=False)
    booking_id = Column(String(50), index=True, nullable=False)
    booking_number = Column(String(20), nullable=False)
    company_id = Column(String(50), nullable=False)
    new_flight_id = Column(String(50), nullable=True)
    new_pickup = Column(String(50), nullable=True)
    status = Column(String(20), nullable=False, default="WAITING")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


# ---------------------------------------------------------------------------
# Engine & session factory (with graceful fallback)
# ---------------------------------------------------------------------------

DB_AVAILABLE: bool = False
engine = None
SessionLocal = None

try:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=3600,
        connect_args={"connect_timeout": 5},
    )
    # Test the connection immediately
    with engine.connect() as _conn:
        pass

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    DB_AVAILABLE = True
    logger.info("MySQL connection established. DB_AVAILABLE = True")
except Exception as _exc:
    logger.warning(
        "MySQL unavailable (%s). Falling back to file-based storage. "
        "DB_AVAILABLE = False",
        _exc,
    )
    DB_AVAILABLE = False
    engine = None
    SessionLocal = None


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------


def get_db():
    """Yield a SQLAlchemy session; close it when the request is done."""
    if not DB_AVAILABLE or SessionLocal is None:
        yield None
        return
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
