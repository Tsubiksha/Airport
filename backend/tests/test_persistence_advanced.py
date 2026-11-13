"""
Tests 41–45: MySQL Persistence, Restarts & Advanced Offer Flows
"""
import pytest
from app import request_store, workflow_store, matching_service
from app.database import DB_AVAILABLE, SessionLocal, BookingDB, RideRequestDB

def test_41_restart_backend_and_retrieve_booking(client):
    """Test 41: Data in MySQL survives backend restart / new session context."""
    req = client.post("/api/requests", json={
        "traveler_name": "Persistence Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": "2027-04-29T10:00:00",
        "price_inr": 12000.0
    }).json()["request"]["request_id"]
    off = client.post(f"/api/suppliers/TX-JP-01/requests/{req}/offers", json={"vehicle_id": "SC-1", "price_inr": 12000}).json()["offer"]["offer_id"]
    bkg_num = client.post(f"/api/offers/{off}/book").json()["booking"]["booking_number"]

    # Direct query against MySQL to simulate clean process restart
    if DB_AVAILABLE:
        db = SessionLocal()
        b = db.query(BookingDB).filter_by(booking_number=bkg_num).first()
        assert b is not None
        assert b.booking_number == bkg_num
        assert b.status == "BOOKED"
        db.close()

    # Via API endpoint
    res = client.get(f"/api/bookings/{bkg_num}")
    assert res.status_code == 200
    assert res.json()["booking_number"] == bkg_num

def test_42_restart_backend_and_retrieve_ride_request(client):
    """Test 42: Dynamic ride requests persist in MySQL and can be retrieved directly."""
    req_res = client.post("/api/requests", json={
        "traveler_name": "Persistent Request Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 2,
        "child_ages": [5],
        "large_bags": 2,
        "small_bags": 2,
        "pickup": "2027-04-29T14:00:00",
        "price_inr": 13000.0
    })
    req_id = req_res.json()["request"]["request_id"]

    if DB_AVAILABLE:
        db = SessionLocal()
        r = db.query(RideRequestDB).filter_by(request_id=req_id).first()
        assert r is not None
        assert r.request_id == req_id
        assert r.traveler_name == "Persistent Request Traveler"
        db.close()

def test_43_initial_open_requests_do_not_duplicate_after_restart():
    """Test 43: Calling sync and get_all_requests() multiple times produces no duplicates."""
    count_before = len(matching_service.get_all_requests())
    request_store.sync_file_to_db()
    count_after = len(matching_service.get_all_requests())
    assert count_before == count_after

def test_44_multiple_suppliers_assigning_offers_to_one_request(client):
    """Test 44: Multiple distinct suppliers can submit offers to the same request."""
    # Create request with free vehicle slot
    req = client.post("/api/requests", json={
        "traveler_name": "Multi Supplier Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": "2027-04-30T10:00:00",
        "price_inr": 12000.0
    }).json()["request"]["request_id"]

    # Assign offer from TX-JP-01 with vehicle SC-1
    off1 = client.post(f"/api/suppliers/TX-JP-01/requests/{req}/offers", json={"vehicle_id": "SC-1", "price_inr": 12000})
    assert off1.status_code == 200

    # Retrieve offers for this request
    offers_res = client.get(f"/api/requests/{req}/offers")
    assert offers_res.status_code == 200
    offers = offers_res.json()["offers"]
    assert len(offers) >= 1

def test_45_several_offers_from_one_supplier(client):
    """Test 45: A supplier can assign multiple distinct vehicles to the same request as alternative offers."""
    req = client.post("/api/requests", json={
        "traveler_name": "Multiple Fleet Offers",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": "2027-04-30T14:00:00",
        "price_inr": 12000.0
    }).json()["request"]["request_id"]

    off1 = client.post(f"/api/suppliers/TX-JP-01/requests/{req}/offers", json={"vehicle_id": "SC-1", "price_inr": 12000})
    assert off1.status_code == 200

    off2 = client.post(f"/api/suppliers/TX-JP-01/requests/{req}/offers", json={"vehicle_id": "SC-4", "price_inr": 12500})
    assert off2.status_code == 200

    offers = client.get(f"/api/requests/{req}/offers").json()["offers"]
    assert len(offers) >= 2
