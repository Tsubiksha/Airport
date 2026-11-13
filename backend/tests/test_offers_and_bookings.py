"""
Tests 22–34: Vehicle Assignment & Booking Lifecycle (Rules R6–R8)
"""
import pytest
from app import availability_service, assignment_service, workflow_store, booking_service

def test_22_car_already_occupied_by_organizer_booking():
    """Test 22: RIDE-0001 occupies vehicle SC-2 of TX-JP-01 from 11:00 to 14:00 on 2027-04-10."""
    available, reason = availability_service.is_vehicle_available(
        company_id="TX-JP-01",
        vehicle_id="SC-2",
        pickup="2027-04-10T12:00:00",
        drive_minutes=60
    )
    assert available is False
    assert "RIDE-0001" in reason

def test_23_overlapping_busy_intervals():
    """Test 23: Busy interval pickup + 2*drive_minutes overlaps with existing booking."""
    start, end = availability_service.get_busy_period("2027-04-10T10:00:00", 45)
    # 10:00 + 2*45 min = 11:30
    assert start.isoformat() == "2027-04-10T10:00:00"
    assert end.isoformat() == "2027-04-10T11:30:00"

def test_24_non_overlapping_intervals():
    """Test 24: Vehicle SC-2 at 2027-04-10T15:00:00 (after 14:00 end) is available."""
    available, reason = availability_service.is_vehicle_available(
        company_id="TX-JP-01",
        vehicle_id="SC-2",
        pickup="2027-04-10T15:00:00",
        drive_minutes=30
    )
    assert available is True
    assert "available" in reason.lower()

def test_25_assigning_another_suppliers_car(client):
    """Test 25: Trying to assign FT-1 (Falcon Transfers) under Sakura Cabs (TX-JP-01) fails with 400."""
    payload = {"vehicle_id": "FT-1", "price_inr": 12000}
    res = client.post("/api/suppliers/TX-JP-01/requests/REQ-E9B88BFA/offers", json=payload)
    assert res.status_code == 400
    assert "does not belong to this supplier" in res.json()["detail"] or "not eligible" in res.json()["detail"]

def test_26_invalid_supplier_price(client):
    """Test 26: Price outside route range (5000 INR for NRT-Ueno min 10200) is rejected."""
    payload = {"vehicle_id": "SC-3", "price_inr": 5000}
    res = client.post("/api/suppliers/TX-JP-01/requests/REQ-E9B88BFA/offers", json=payload)
    assert res.status_code == 400
    assert "must be between" in res.json()["detail"]

def test_27_valid_assignment(client):
    """Test 27: Valid assignment creates an offer with status OFFERED."""
    payload = {"vehicle_id": "SC-3", "price_inr": 12500}
    res = client.post("/api/suppliers/TX-JP-01/requests/REQ-E9B88BFA/offers", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "offer" in data
    assert data["offer"]["status"] == "OFFERED"
    assert data["offer"]["offer_id"].startswith("OFF-")

def test_28_booking_a_valid_offer(client, make_unique_pickup):
    """Test 28: Booking a valid offered taxi creates a booking with 10-digit number."""
    req_res = client.post("/api/requests", json={
        "traveler_name": "Booking Test Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": make_unique_pickup(),
        "price_inr": 13000.0
    })
    req_id = req_res.json()["request"]["request_id"]

    off_res = client.post(f"/api/suppliers/TX-JP-01/requests/{req_id}/offers", json={
        "vehicle_id": "SC-1",
        "price_inr": 13000
    })
    offer_id = off_res.json()["offer"]["offer_id"]

    book_res = client.post(f"/api/offers/{offer_id}/book")
    assert book_res.status_code == 200
    booking = book_res.json()["booking"]
    assert booking["status"] == "BOOKED"
    assert len(booking["booking_number"]) == 10
    assert booking["booking_number"].isdigit()

def test_29_booking_a_rejected_offer(client, make_unique_pickup):
    """Test 29: Booking an offer that has been rejected returns 400."""
    req_res = client.post("/api/requests", json={
        "traveler_name": "Reject Offer Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": make_unique_pickup(),
        "price_inr": 12000.0
    })
    req_id = req_res.json()["request"]["request_id"]

    off_res = client.post(f"/api/suppliers/TX-JP-01/requests/{req_id}/offers", json={
        "vehicle_id": "SC-4",
        "price_inr": 12000
    })
    offer_id = off_res.json()["offer"]["offer_id"]

    # Reject offer
    rej_res = client.post(f"/api/offers/{offer_id}/reject")
    assert rej_res.status_code == 200

    # Try booking rejected offer
    try_book = client.post(f"/api/offers/{offer_id}/book")
    assert try_book.status_code == 400
    assert "no longer available" in try_book.json()["detail"]

def test_30_booking_a_not_chosen_offer(client, make_unique_pickup):
    """Test 30: When one offer is booked, the other becomes NOT_CHOSEN and cannot be booked."""
    req_res = client.post("/api/requests", json={
        "traveler_name": "Multi Offer Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": make_unique_pickup(),
        "price_inr": 12000.0
    })
    req_id = req_res.json()["request"]["request_id"]

    off1 = client.post(f"/api/suppliers/TX-JP-01/requests/{req_id}/offers", json={
        "vehicle_id": "SC-1",
        "price_inr": 12000
    }).json()["offer"]["offer_id"]

    off2 = client.post(f"/api/suppliers/TX-JP-01/requests/{req_id}/offers", json={
        "vehicle_id": "SC-4",
        "price_inr": 12500
    }).json()["offer"]["offer_id"]

    # Book off1
    client.post(f"/api/offers/{off1}/book")

    # Try booking off2 which is now NOT_CHOSEN
    try_book2 = client.post(f"/api/offers/{off2}/book")
    assert try_book2.status_code == 400

def test_31_booking_an_already_occupied_vehicle(client, make_unique_pickup):
    """Test 31: Recheck before confirming prevents double booking same vehicle in overlapping interval."""
    shared_pickup = make_unique_pickup()

    req1 = client.post("/api/requests", json={
        "traveler_name": "Double Booking 1",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": shared_pickup,
        "price_inr": 12000.0
    }).json()["request"]["request_id"]

    req2 = client.post("/api/requests", json={
        "traveler_name": "Double Booking 2",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": shared_pickup,
        "price_inr": 12000.0
    }).json()["request"]["request_id"]

    off1 = client.post(f"/api/suppliers/TX-JP-01/requests/{req1}/offers", json={"vehicle_id": "SC-3", "price_inr": 12000}).json()["offer"]["offer_id"]
    off2 = client.post(f"/api/suppliers/TX-JP-01/requests/{req2}/offers", json={"vehicle_id": "SC-3", "price_inr": 12000}).json()["offer"]["offer_id"]

    # Confirm off1
    b1 = client.post(f"/api/offers/{off1}/book")
    assert b1.status_code == 200

    # Try confirming off2 on same SC-3
    b2 = client.post(f"/api/offers/{off2}/book")
    assert b2.status_code == 400
    assert "Conflicts with RidePort booking" in b2.json()["detail"]

def test_32_unique_10_digit_booking_number(client, make_unique_pickup):
    """Test 32: Booking number is strictly 10 numeric digits."""
    req = client.post("/api/requests", json={
        "traveler_name": "Digits Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": make_unique_pickup(),
        "price_inr": 12000.0
    }).json()["request"]["request_id"]
    off = client.post(f"/api/suppliers/TX-JP-01/requests/{req}/offers", json={"vehicle_id": "SC-1", "price_inr": 12000}).json()["offer"]["offer_id"]
    book = client.post(f"/api/offers/{off}/book").json()["booking"]
    assert len(book["booking_number"]) == 10
    assert book["booking_number"].isdigit()

def test_33_valid_booking_lookup(client, make_unique_pickup):
    """Test 33: Booking lookup returns full summary."""
    req = client.post("/api/requests", json={
        "traveler_name": "Lookup Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": make_unique_pickup(),
        "price_inr": 12000.0
    }).json()["request"]["request_id"]
    off = client.post(f"/api/suppliers/TX-JP-01/requests/{req}/offers", json={"vehicle_id": "SC-1", "price_inr": 12000}).json()["offer"]["offer_id"]
    booking_number = client.post(f"/api/offers/{off}/book").json()["booking"]["booking_number"]

    res = client.get(f"/api/bookings/{booking_number}")
    assert res.status_code == 200
    data = res.json()
    assert data["booking_number"] == booking_number
    assert data["traveler_name"] == "Lookup Traveler"
    assert data["flight"]["flight_id"] == "FL-401"
    assert data["hotel"]["hotel_id"] == "HTL-TYO-004"

def test_34_invalid_booking_lookup(client):
    """Test 34: Non-existent 10-digit number returns 404, non-10-digit returns 400."""
    res404 = client.get("/api/bookings/9999999999")
    assert res404.status_code == 404

    res400 = client.get("/api/bookings/123")
    assert res400.status_code == 400
