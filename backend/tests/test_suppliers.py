"""
Tests 15–21: Supplier Eligibility & Vehicle Matching (Rules R4–R5)
"""
import pytest
from app import matching_service

def test_15_supplier_without_airport_coverage(client):
    """Test 15: UAE supplier (TX-AE-01) does not appear in eligible suppliers for NRT Tokyo request."""
    # REQ-E9B88BFA is NRT -> Tokyo Ueno
    res = client.get("/api/requests/REQ-E9B88BFA/eligible-suppliers")
    assert res.status_code == 200
    data = res.json()
    eligible_ids = [s["company_id"] for s in data["eligible_suppliers"]]
    assert "TX-AE-01" not in eligible_ids
    # Check rejected reasons
    rejected = next((s for s in data["rejected_suppliers"] if s["company_id"] == "TX-AE-01"), None)
    assert rejected is not None
    assert any("does not serve this airport" in r for r in rejected["reasons"])

def test_16_supplier_without_destination_coverage():
    """Test 16: Supplier without coverage for destination area is rejected."""
    # Create request to an unserved area
    fake_request = {
        "request_id": "REQ-TEST-AREA",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "pickup": "2027-04-10T12:00:00",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1
    }
    result = matching_service.match_request(fake_request)
    # Narita Star Taxi (TX-JP-02) only serves Ginza, Roppongi, Shinjuku, Shibuya - not Ueno!
    eligible_ids = [s["company_id"] for s in result["eligible_suppliers"]]
    assert "TX-JP-02" not in eligible_ids

def test_17_supplier_outside_operating_hours():
    """Test 17: Request at 05:00 AM rejects Fuji Express (TX-JP-03, hours 08:00-20:00)."""
    fake_request = {
        "request_id": "REQ-TEST-HOURS",
        "flight_id": "FL-401",
        "hotel_id": "HTL-TYO-004",
        "pickup": "2027-04-10T05:00:00",
        "adults": 1,
        "child_ages": [],
        "large_bags": 1,
        "small_bags": 1
    }
    result = matching_service.match_request(fake_request)
    rejected = next((s for s in result["rejected_suppliers"] if s["company_id"] == "TX-JP-03"), None)
    assert rejected is not None
    assert any("closed at the pickup time" in r for r in rejected["reasons"])

def test_18_vehicle_with_insufficient_seats():
    """Test 18: 5 passengers (4 adults + 1 child) cannot fit in a 4-seater car."""
    from app.matching_service import vehicle_fits_request
    vehicle = {"type": "SEDAN", "seats": 4, "large_bags": 2, "small_bags": 2}
    request = {"adults": 4, "child_ages": [10], "large_bags": 1, "small_bags": 1}
    fits, reason = vehicle_fits_request(vehicle, request)
    assert fits is False
    assert "seats" in reason.lower()

def test_19_vehicle_with_insufficient_large_bags():
    """Test 19: 3 large bags cannot fit in a vehicle with large_bags capacity 2."""
    from app.matching_service import vehicle_fits_request
    vehicle = {"type": "SEDAN", "seats": 4, "large_bags": 2, "small_bags": 2}
    request = {"adults": 2, "child_ages": [], "large_bags": 3, "small_bags": 1}
    fits, reason = vehicle_fits_request(vehicle, request)
    assert fits is False
    assert "large-bag" in reason.lower()

def test_20_vehicle_with_insufficient_small_bags():
    """Test 20: 4 small bags cannot fit in a vehicle with small_bags capacity 2."""
    from app.matching_service import vehicle_fits_request
    vehicle = {"type": "SEDAN", "seats": 4, "large_bags": 2, "small_bags": 2}
    request = {"adults": 2, "child_ages": [], "large_bags": 1, "small_bags": 4}
    fits, reason = vehicle_fits_request(vehicle, request)
    assert fits is False
    assert "small-bag" in reason.lower()

def test_21_wrong_vehicle_type():
    """Test 21: Request specifying SUV rejects SEDAN vehicles."""
    from app.matching_service import vehicle_fits_request
    vehicle = {"type": "SEDAN", "seats": 4, "large_bags": 2, "small_bags": 2}
    request = {"adults": 2, "child_ages": [], "large_bags": 1, "small_bags": 1, "car_type": "SUV"}
    fits, reason = vehicle_fits_request(vehicle, request)
    assert fits is False
    assert "car type" in reason.lower()
