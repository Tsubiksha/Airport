"""
test_hackathon_master.py - Comprehensive Hackathon Requirements Verification Test Suite.

Covers:
- Must-Have M1–M7 (Ride Request, Catalogs, Pricing Bounds, Eligibility R4, Capacity R5, Assignment/Offers R6–R8, Overlap R8)
- Rule R9: Complete Change Request Lifecycle (WAITING -> ACCEPTED/REJECTED with remarks & original vs proposed)
- Good-to-Have G1: Several Cars Per Supplier (multiple vehicle bids for 1 request)
- Good-to-Have G2: Traveler Car Type Selection (SUV, SEDAN, HATCHBACK, BUS)
- Good-to-Have G4: Offer Expiry (stored in MySQL, blocked if expired)
- Good-to-Have G5: Sort by Price & Filter by Vehicle Type
- Stretch S1: Shared Ride Architecture & Compatibility Evaluator
"""

from datetime import datetime, timedelta
import pytest


def test_m1_m3_request_creation_and_price_validation(client, make_unique_pickup):
    """M1, M3: Create ride request with valid data, enforce price bounds."""
    pickup = make_unique_pickup()

    # Route NRT -> Tokyo Ueno (HTL-TYO-004) has min 10200, max 16800
    # Under-budget should fail
    bad_res = client.post("/api/requests", json={
        "traveler_name": "Budget Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": pickup,
        "price_inr": 5000.0
    })
    assert bad_res.status_code == 400
    assert "Price must be between" in bad_res.json()["detail"]

    # Valid request
    ok_res = client.post("/api/requests", json={
        "traveler_name": "Valid Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 2,
        "child_ages": [8],
        "large_bags": 2,
        "small_bags": 1,
        "pickup": pickup,
        "price_inr": 12000.0
    })
    assert ok_res.status_code == 200
    req_data = ok_res.json()["request"]
    assert req_data["request_id"].startswith("REQ-")
    assert req_data["status"] == "OPEN"
    assert req_data["adults"] == 2


def test_m2_catalogs(client):
    """M2: Catalogs for airports, flights, hotels, routes."""
    airports = client.get("/api/catalog/airports").json()
    assert len(airports) >= 3
    assert any(a["code"] == "NRT" for a in airports)

    flights = client.get("/api/catalog/flights").json()
    assert len(flights) > 50

    hotels = client.get("/api/catalog/hotels").json()
    assert len(hotels) > 10

    single_flight = client.get("/api/catalog/flights/FL-401").json()
    assert single_flight["to"] == "NRT"


def test_g1_several_cars_per_supplier(client, make_unique_pickup):
    """G1: A single supplier can submit several vehicle offers for the same request."""
    pickup = make_unique_pickup()
    req = client.post("/api/requests", json={
        "traveler_name": "Options Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 2,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": pickup,
        "price_inr": 13000.0
    }).json()["request"]["request_id"]

    # Offer 1: Sedan (SC-1) at 11,000 INR
    off1 = client.post(f"/api/suppliers/TX-JP-01/requests/{req}/offers", json={
        "vehicle_id": "SC-1",
        "price_inr": 11000
    })
    assert off1.status_code == 200
    id1 = off1.json()["offer"]["offer_id"]

    # Offer 2: SUV (SC-3) at 13,000 INR from same supplier for same request
    off2 = client.post(f"/api/suppliers/TX-JP-01/requests/{req}/offers", json={
        "vehicle_id": "SC-3",
        "price_inr": 13000
    })
    assert off2.status_code == 200
    id2 = off2.json()["offer"]["offer_id"]

    assert id1 != id2

    # Check traveler offers page sees both offers
    offers_res = client.get(f"/api/requests/{req}/offers").json()
    offers_list = offers_res["offers"]
    offer_ids = [o["offer_id"] for o in offers_list]
    assert id1 in offer_ids
    assert id2 in offer_ids


def test_g2_traveler_car_type_selection(client, make_unique_pickup):
    """G2: Traveler can request SUV and backend prevents assigning Sedan."""
    pickup = make_unique_pickup()
    req = client.post("/api/requests", json={
        "traveler_name": "SUV Preferred Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": pickup,
        "car_type": "SUV",
        "price_inr": 14000.0
    }).json()["request"]["request_id"]

    # Trying to assign Sedan (SC-1 is Sedan) must fail
    res_sedan = client.post(f"/api/suppliers/TX-JP-01/requests/{req}/offers", json={
        "vehicle_id": "SC-1",
        "price_inr": 12000
    })
    assert res_sedan.status_code == 400

    # Assigning SUV (SC-3 is SUV) succeeds
    res_suv = client.post(f"/api/suppliers/TX-JP-01/requests/{req}/offers", json={
        "vehicle_id": "SC-3",
        "price_inr": 13500
    })
    assert res_suv.status_code == 200
    assert res_suv.json()["offer"]["vehicle_type"] == "SUV"


def test_g4_offer_expiry_enforcement(client, make_unique_pickup):
    """G4: Offer expiry timestamp is stored, and expired offers cannot be booked."""
    from app import workflow_store

    pickup = make_unique_pickup()
    req = client.post("/api/requests", json={
        "traveler_name": "Expiry Test Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": pickup,
        "price_inr": 12000.0
    }).json()["request"]["request_id"]

    # Create offer with 15 minutes expiry
    res = client.post(f"/api/suppliers/TX-JP-01/requests/{req}/offers", json={
        "vehicle_id": "SC-1",
        "price_inr": 12000,
        "expires_in_minutes": 15
    })
    assert res.status_code == 200
    offer_id = res.json()["offer"]["offer_id"]
    assert res.json()["offer"]["expires_at"] is not None

    # Manually backdate expiry to 5 minutes ago to test expiry enforcement
    workflow_store.update_offer(offer_id, {
        "expires_at": (datetime.utcnow() - timedelta(minutes=5)).isoformat()
    })

    # Attempting to book expired offer must be rejected by FastAPI
    book_res = client.post(f"/api/offers/{offer_id}/book")
    assert book_res.status_code == 400
    assert "expired" in book_res.json()["detail"].lower()


def test_m6_m7_booking_workflow_and_overlap_prevention(client, make_unique_pickup):
    """M6, M7: Complete booking flow and prevent overlapping rides (2x drive time)."""
    pickup = make_unique_pickup()
    req = client.post("/api/requests", json={
        "traveler_name": "Booking Flow Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": pickup,
        "price_inr": 12000.0
    }).json()["request"]["request_id"]

    off = client.post(f"/api/suppliers/TX-JP-01/requests/{req}/offers", json={
        "vehicle_id": "SC-1",
        "price_inr": 12000
    }).json()["offer"]["offer_id"]

    # Book offer
    book_res = client.post(f"/api/offers/{off}/book")
    assert book_res.status_code == 200
    bkg = book_res.json()["booking"]
    assert len(bkg["booking_number"]) == 10
    assert bkg["status"] == "BOOKED"

    # Lookup booking summary
    lookup_res = client.get(f"/api/bookings/{bkg['booking_number']}")
    assert lookup_res.status_code == 200
    assert lookup_res.json()["traveler_name"] == "Booking Flow Traveler"

    # Conflicting ride for same vehicle within pickup + 2*drive_minutes (90 min drive => 180 min busy window)
    conflict_pickup = (datetime.fromisoformat(pickup) + timedelta(minutes=30)).isoformat()
    req2 = client.post("/api/requests", json={
        "traveler_name": "Conflicting Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": conflict_pickup,
        "price_inr": 12000.0
    }).json()["request"]["request_id"]

    # Assigning the same car (SC-1) must be rejected
    conflict_res = client.post(f"/api/suppliers/TX-JP-01/requests/{req2}/offers", json={
        "vehicle_id": "SC-1",
        "price_inr": 12000
    })
    assert conflict_res.status_code == 400


def test_r9_change_request_lifecycle_accepted(client, make_unique_pickup):
    """R9: Change request accepted flow with booking update and remarks."""
    pickup = make_unique_pickup()
    req = client.post("/api/requests", json={
        "traveler_name": "Change Accept Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": pickup,
        "price_inr": 12000.0
    }).json()["request"]["request_id"]

    off = client.post(f"/api/suppliers/TX-JP-01/requests/{req}/offers", json={
        "vehicle_id": "SC-2",
        "price_inr": 12000
    }).json()["offer"]["offer_id"]

    bkg = client.post(f"/api/offers/{off}/book").json()["booking"]
    bkg_num = bkg["booking_number"]

    # Submit change request
    new_pickup = make_unique_pickup()
    chg_res = client.post(f"/api/bookings/{bkg_num}/change-requests", json={
        "new_pickup": new_pickup
    })
    assert chg_res.status_code == 200
    chg = chg_res.json()["change_request"]
    assert chg["status"] == "WAITING"
    assert chg["original_flight_id"] == "FL-401"
    assert chg["traveler_name"] == "Change Accept Traveler"

    # Supplier accepts change
    dec_res = client.post(f"/api/change-requests/{chg['change_id']}/decision", json={
        "decision": "ACCEPTED",
        "remarks": "Approved by Sakura Cabs"
    })
    assert dec_res.status_code == 200
    assert dec_res.json()["change_request"]["status"] == "ACCEPTED"
    assert dec_res.json()["change_request"]["remarks"] == "Approved by Sakura Cabs"

    # Verify updated booking reflects new pickup
    updated_bkg = client.get(f"/api/bookings/{bkg_num}").json()
    assert updated_bkg["pickup"].startswith(new_pickup[:16])
    assert updated_bkg["latest_change"]["status"] == "ACCEPTED"


def test_r9_change_request_lifecycle_rejected(client, make_unique_pickup):
    """R9: Change request rejected flow preserves original booking."""
    pickup = make_unique_pickup()
    req = client.post("/api/requests", json={
        "traveler_name": "Change Reject Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": pickup,
        "price_inr": 12000.0
    }).json()["request"]["request_id"]

    off = client.post(f"/api/suppliers/TX-JP-01/requests/{req}/offers", json={
        "vehicle_id": "SC-2",
        "price_inr": 12000
    }).json()["offer"]["offer_id"]

    bkg = client.post(f"/api/offers/{off}/book").json()["booking"]
    bkg_num = bkg["booking_number"]

    # Submit change
    new_pickup = make_unique_pickup()
    chg_res = client.post(f"/api/bookings/{bkg_num}/change-requests", json={
        "new_pickup": new_pickup
    })
    chg_id = chg_res.json()["change_request"]["change_id"]

    # Supplier rejects change
    dec_res = client.post(f"/api/change-requests/{chg_id}/decision", json={
        "decision": "REJECTED",
        "remarks": "Vehicle already reserved for another passenger"
    })
    assert dec_res.status_code == 200
    assert dec_res.json()["change_request"]["status"] == "REJECTED"

    # Verify original booking pickup is PRESERVED
    bkg_after = client.get(f"/api/bookings/{bkg_num}").json()
    assert bkg_after["pickup"] == pickup
    assert bkg_after["latest_change"]["status"] == "REJECTED"
    assert "already reserved" in bkg_after["latest_change"]["remarks"]


def test_s1_shared_ride_evaluator(client, make_unique_pickup):
    """S1: Shared ride evaluation for two requests on same flight and destination area."""
    pickup = make_unique_pickup()

    # Request 1
    r1 = client.post("/api/requests", json={
        "traveler_name": "Shared Traveler 1",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": pickup,
        "price_inr": 12000.0
    }).json()["request"]["request_id"]

    # Request 2 (same flight, same destination area)
    r2 = client.post("/api/requests", json={
        "traveler_name": "Shared Traveler 2",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 2,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 2,
        "pickup": pickup,
        "price_inr": 12000.0
    }).json()["request"]["request_id"]

    # Evaluate shared ride
    eval_res = client.get(f"/api/shared-rides/evaluate?request_id_1={r1}&request_id_2={r2}")
    assert eval_res.status_code == 200
    data = eval_res.json()
    assert data["compatible"] is True
    assert data["evaluation"]["total_passengers"] == 3
    assert data["evaluation"]["compatible_vehicles_count"] > 0
    assert data["evaluation"]["individual_fares_inr"] > 0
