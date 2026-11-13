"""
Tests 35–40: Change Requests & Decisions (Rule R9)
"""
import pytest

@pytest.fixture
def active_booking(client, make_unique_pickup):
    """Create a fresh booking with dynamic unique pickup for change tests."""
    pickup_time = make_unique_pickup()

    req = client.post("/api/requests", json={
        "traveler_name": "Change Flow Traveler",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1,
        "pickup": pickup_time,
        "price_inr": 12000.0
    }).json()["request"]["request_id"]

    off = client.post(f"/api/suppliers/TX-JP-01/requests/{req}/offers", json={
        "vehicle_id": "SC-1",
        "price_inr": 12000
    }).json()["offer"]["offer_id"]

    return client.post(f"/api/offers/{off}/book").json()["booking"]

def test_35_valid_change_request(client, active_booking, make_unique_pickup):
    """Test 35: Valid change request submitted with status WAITING."""
    bkg_num = active_booking["booking_number"]
    proposed_pickup = make_unique_pickup()
    res = client.post(f"/api/bookings/{bkg_num}/change-requests", json={
        "new_pickup": proposed_pickup
    })
    assert res.status_code == 200
    data = res.json()["change_request"]
    assert data["status"] == "WAITING"
    assert data["new_pickup"].startswith(proposed_pickup[:16])

def test_36_invalid_pickup_change(client, active_booking):
    """Test 36: Deciding on a pickup change less than 60 min after flight landing fails with 400."""
    bkg_num = active_booking["booking_number"]
    # FL-401 lands at 10:30 on 2027-04-10. Try pickup at 10:45 (only 15 min after landing)
    chg = client.post(f"/api/bookings/{bkg_num}/change-requests", json={
        "new_flight_id": "FL-401",
        "new_pickup": "2027-04-10T10:45:00"
    }).json()["change_request"]

    # When supplier tries to accept, R2 validation fails
    dec = client.post(f"/api/change-requests/{chg['change_id']}/decision", json={"decision": "ACCEPTED"})
    assert dec.status_code == 400
    assert "at least 60 minutes" in dec.json()["detail"]

def test_37_car_unavailable_at_proposed_new_time(client, active_booking):
    """Test 37: If proposed new pickup overlaps with an existing ride, accepting change fails."""
    bkg_num = active_booking["booking_number"]
    from app.change_service import validate_new_booking_time
    valid, reason = validate_new_booking_time(
        booking={
            "booking_id": active_booking["booking_id"],
            "company_id": "TX-JP-01",
            "vehicle_id": "SC-2",
            "hotel_id": "HTL-TYO-004"
        },
        new_flight_id="FL-401",
        new_pickup="2027-04-10T11:30:00"
    )
    assert valid is False
    assert "Conflicts" in reason

def test_38_supplier_rejects_change(client, active_booking, make_unique_pickup):
    """Test 38: Supplier can reject change request, status becomes REJECTED."""
    bkg_num = active_booking["booking_number"]
    chg = client.post(f"/api/bookings/{bkg_num}/change-requests", json={
        "new_pickup": make_unique_pickup()
    }).json()["change_request"]

    dec = client.post(f"/api/change-requests/{chg['change_id']}/decision", json={"decision": "REJECTED"})
    assert dec.status_code == 200
    assert dec.json()["change_request"]["status"] == "REJECTED"

def test_39_rejected_change_preserves_original_booking(client, active_booking, make_unique_pickup):
    """Test 39: Rejected change leaves original booking pickup time untouched."""
    bkg_num = active_booking["booking_number"]
    orig_pickup = active_booking["pickup"]

    chg = client.post(f"/api/bookings/{bkg_num}/change-requests", json={
        "new_pickup": make_unique_pickup()
    }).json()["change_request"]

    client.post(f"/api/change-requests/{chg['change_id']}/decision", json={"decision": "REJECTED"})

    # Check booking
    curr = client.get(f"/api/bookings/{bkg_num}").json()
    assert curr["pickup"] == orig_pickup

def test_40_supplier_accepts_change(client, active_booking, make_unique_pickup):
    """Test 40: Accepting change updates the booking pickup time and duration."""
    bkg_num = active_booking["booking_number"]
    new_time = make_unique_pickup()

    chg = client.post(f"/api/bookings/{bkg_num}/change-requests", json={
        "new_pickup": new_time
    }).json()["change_request"]

    dec = client.post(f"/api/change-requests/{chg['change_id']}/decision", json={"decision": "ACCEPTED"})
    assert dec.status_code == 200
    assert dec.json()["change_request"]["status"] == "ACCEPTED"

    # Verify updated booking
    curr = client.get(f"/api/bookings/{bkg_num}").json()
    assert curr["pickup"].startswith(new_time[:16])
