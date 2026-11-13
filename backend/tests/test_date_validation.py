"""
Tests for Strict Date/Time Validation, Airport Timezones, and Rule R2.
Covers Phase 9 Tests 1–15.
"""

from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
import pytest
from app.date_validation import (
    validate_flight_and_pickup,
    get_airport_timezone,
    ensure_timezone_aware,
)


# Reference test clock specified in Hackathon Prompt: November 13, 2026, 7:00 PM (19:00)
def make_ref_now(tz_name="Asia/Tokyo"):
    tz = ZoneInfo(tz_name)
    return datetime(2026, 11, 13, 19, 0, 0, tzinfo=tz)


def test_01_past_flight_date_previous_month():
    """TEST 1: Flight date in past month (Oct 10, 2026 vs Nov 13, 2026). Expected: INVALID."""
    tz = ZoneInfo("Asia/Tokyo")
    ref_now = make_ref_now("Asia/Tokyo")
    landing = datetime(2026, 10, 10, 10, 30, 0, tzinfo=tz)
    pickup = datetime(2026, 10, 10, 11, 30, 0, tzinfo=tz)

    valid, err, _ = validate_flight_and_pickup(
        airport_code="NRT",
        landing_dt=landing,
        pickup_dt=pickup,
        now=ref_now,
    )
    assert not valid
    assert "Selected flight date is in the past" in err


def test_02_past_flight_date_previous_day():
    """TEST 2: Flight date in previous day (Nov 12, 2026 vs Nov 13, 2026). Expected: INVALID."""
    tz = ZoneInfo("Asia/Tokyo")
    ref_now = make_ref_now("Asia/Tokyo")
    landing = datetime(2026, 11, 12, 10, 30, 0, tzinfo=tz)
    pickup = datetime(2026, 11, 12, 11, 30, 0, tzinfo=tz)

    valid, err, _ = validate_flight_and_pickup(
        airport_code="NRT",
        landing_dt=landing,
        pickup_dt=pickup,
        now=ref_now,
    )
    assert not valid
    assert "Selected flight date is in the past" in err


def test_03_same_day_past_landing_time():
    """TEST 3: Same day, past landing time (Nov 13, 2026 at 5:00 PM when clock is 7:00 PM). Expected: INVALID."""
    tz = ZoneInfo("Asia/Tokyo")
    ref_now = make_ref_now("Asia/Tokyo")
    landing = datetime(2026, 11, 13, 17, 0, 0, tzinfo=tz)  # 5:00 PM
    pickup = datetime(2026, 11, 13, 18, 30, 0, tzinfo=tz)

    valid, err, _ = validate_flight_and_pickup(
        airport_code="NRT",
        landing_dt=landing,
        pickup_dt=pickup,
        now=ref_now,
    )
    assert not valid
    assert "Flight landing time has already passed" in err


def test_04_same_day_future_landing_time():
    """TEST 4: Same day, future landing time (Nov 13, 2026 at 9:00 PM, pickup 10:00 PM when clock is 7:00 PM). Expected: VALID."""
    tz = ZoneInfo("Asia/Tokyo")
    ref_now = make_ref_now("Asia/Tokyo")
    landing = datetime(2026, 11, 13, 21, 0, 0, tzinfo=tz)  # 9:00 PM
    pickup = datetime(2026, 11, 13, 22, 0, 0, tzinfo=tz)   # 10:00 PM (exactly +60 min)

    valid, err, resolved_pickup = validate_flight_and_pickup(
        airport_code="NRT",
        landing_dt=landing,
        pickup_dt=pickup,
        now=ref_now,
    )
    assert valid
    assert err == ""
    assert resolved_pickup == pickup


def test_05_pickup_less_than_60_minutes():
    """TEST 5: Landing 10:30 AM, Pickup 11:00 AM (only 30 min). Expected: INVALID."""
    tz = ZoneInfo("Asia/Tokyo")
    # Date in future
    landing = datetime(2027, 4, 10, 10, 30, 0, tzinfo=tz)
    pickup = datetime(2027, 4, 10, 11, 0, 0, tzinfo=tz)

    valid, err, _ = validate_flight_and_pickup(
        airport_code="NRT",
        landing_dt=landing,
        pickup_dt=pickup,
    )
    assert not valid
    assert "Pickup must be at least 60 minutes after flight landing" in err


def test_06_pickup_59_minutes():
    """TEST 6: Landing 10:30 AM, Pickup 11:29 AM (59 min). Expected: INVALID."""
    tz = ZoneInfo("Asia/Tokyo")
    landing = datetime(2027, 4, 10, 10, 30, 0, tzinfo=tz)
    pickup = datetime(2027, 4, 10, 11, 29, 0, tzinfo=tz)

    valid, err, _ = validate_flight_and_pickup(
        airport_code="NRT",
        landing_dt=landing,
        pickup_dt=pickup,
    )
    assert not valid
    assert "Pickup must be at least 60 minutes after flight landing" in err


def test_07_pickup_exactly_60_minutes_future():
    """TEST 7: Landing 10:30 AM, Pickup 11:30 AM in future. Expected: VALID."""
    tz = ZoneInfo("Asia/Tokyo")
    landing = datetime(2027, 4, 10, 10, 30, 0, tzinfo=tz)
    pickup = datetime(2027, 4, 10, 11, 30, 0, tzinfo=tz)

    valid, err, resolved = validate_flight_and_pickup(
        airport_code="NRT",
        landing_dt=landing,
        pickup_dt=pickup,
    )
    assert valid
    assert err == ""
    assert resolved == pickup


def test_08_midnight_boundary_invalid():
    """TEST 8: Landing Nov 13, 11:30 PM, Pickup Nov 14, 12:00 AM (only 30 min across midnight). Expected: INVALID."""
    tz = ZoneInfo("Asia/Tokyo")
    ref_now = datetime(2026, 11, 13, 20, 0, 0, tzinfo=tz)
    landing = datetime(2026, 11, 13, 23, 30, 0, tzinfo=tz)
    pickup = datetime(2026, 11, 14, 0, 0, 0, tzinfo=tz)  # 30 min later

    valid, err, _ = validate_flight_and_pickup(
        airport_code="NRT",
        landing_dt=landing,
        pickup_dt=pickup,
        now=ref_now,
    )
    assert not valid
    assert "Pickup must be at least 60 minutes after flight landing" in err


def test_09_midnight_boundary_valid():
    """TEST 9: Landing Nov 13, 11:30 PM, Pickup Nov 14, 12:30 AM (exactly 60 min across midnight). Expected: VALID."""
    tz = ZoneInfo("Asia/Tokyo")
    ref_now = datetime(2026, 11, 13, 20, 0, 0, tzinfo=tz)
    landing = datetime(2026, 11, 13, 23, 30, 0, tzinfo=tz)
    pickup = datetime(2026, 11, 14, 0, 30, 0, tzinfo=tz)  # 60 min later

    valid, err, resolved = validate_flight_and_pickup(
        airport_code="NRT",
        landing_dt=landing,
        pickup_dt=pickup,
        now=ref_now,
    )
    assert valid
    assert err == ""
    assert resolved == pickup


def test_10_past_pickup_time():
    """TEST: Current time is 7:00 PM, pickup is 6:00 PM. Expected: INVALID with 'Pickup time cannot be in the past.'"""
    tz = ZoneInfo("Asia/Tokyo")
    ref_now = make_ref_now("Asia/Tokyo")
    landing = datetime(2026, 11, 13, 16, 0, 0, tzinfo=tz)
    pickup = datetime(2026, 11, 13, 18, 0, 0, tzinfo=tz)  # 6:00 PM (past relative to 7:00 PM)

    valid, err, _ = validate_flight_and_pickup(
        airport_code="NRT",
        landing_dt=landing,
        pickup_dt=pickup,
        now=ref_now,
    )
    assert not valid


def test_11_backend_direct_bypass_rejected(client):
    """TEST 14: Direct API bypass with past flight date returns 400."""
    payload = {
        "flight_id": "FL-401",
        "flight_date": "2026-10-10",
        "hotel_id": "HTL-TYO-004",
        "adults": 2,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": "2026-10-10T11:30:00",
        "traveler_name": "Bypass Attempter",
        "price_inr": 12000.0,
    }
    res = client.post("/api/requests", json=payload)
    assert res.status_code == 400
    assert "Selected flight date is in the past" in res.json()["detail"]


def test_12_backend_schedule_validation_endpoint(client):
    """TEST: Validate schedule endpoint verifies validity before booking."""
    # Valid schedule in 2027
    res_valid = client.post("/api/requests/validate-schedule", json={
        "flight_id": "FL-401",
        "flight_date": "2027-04-10",
        "pickup": "2027-04-10T11:30:00",
    })
    assert res_valid.status_code == 200
    assert res_valid.json()["valid"] is True
    assert res_valid.json()["airport"] == "NRT"

    # Invalid schedule (past date)
    res_invalid = client.post("/api/requests/validate-schedule", json={
        "flight_id": "FL-401",
        "flight_date": "2025-01-01",
    })
    assert res_invalid.status_code == 400
    assert "Selected flight date is in the past" in res_invalid.json()["detail"]
