import os
import sys
import itertools
from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app

@pytest.fixture(scope="session", autouse=True)
def clean_test_database():
    """Ensure clean test state before running tests so repeated pytest runs never collide."""
    from pathlib import Path
    import json
    from app.database import SessionLocal, BookingDB, OfferDB, ChangeRequestDB, RideRequestDB, DB_AVAILABLE

    # Reset workflow.json
    wf_path = Path(__file__).resolve().parent.parent / "storage" / "workflow.json"
    wf_path.parent.mkdir(exist_ok=True)
    wf_path.write_text(json.dumps({'offers': [], 'bookings': [], 'change_requests': []}, indent=4), encoding='utf-8')

    if DB_AVAILABLE:
        db = SessionLocal()
        try:
            db.query(ChangeRequestDB).delete()
            db.query(BookingDB).delete()
            db.query(OfferDB).delete()
            organizer_ids = {'REQ-E9B88BFA', 'REQ-0001', 'REQ-0002', 'REQ-0003'}
            for r in db.query(RideRequestDB).all():
                if r.request_id not in organizer_ids:
                    db.delete(r)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
    yield


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c

_pickup_counter = itertools.count(start=1)

@pytest.fixture
def make_unique_pickup():
    """Returns a unique ISO datetime in 2028 well spaced out to prevent interval overlaps."""
    def _gen():
        idx = next(_pickup_counter)
        dt = datetime(2028, 5, 1, 12, 0, 0) + timedelta(days=idx)
        return dt.isoformat()
    return _gen

@pytest.fixture
def valid_request_payload(make_unique_pickup):
    """
    Valid payload using real organizer data:
    Flight FL-401: arrives NRT at 2027-04-10T10:30:00
    Hotel HTL-TYO-004: Tokyo Ueno
    Route NRT -> Tokyo Ueno: min 10200, max 16800 INR
    Pickup is dynamically spaced in 2028 (> 60 min after landing).
    """
    return {
        "traveler_name": "Test Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 2,
        "child_ages": [6],
        "large_bags": 2,
        "small_bags": 1,
        "pickup": make_unique_pickup(),
        "car_type": None,
        "price_inr": 12000.0
    }
