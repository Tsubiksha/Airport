"""
Tests 1–14: Ride Request Validation (Rules R1–R3)
"""
import copy
import pytest

def test_01_valid_ride_request(client, valid_request_payload):
    """Test 1: Valid ride request succeeds with 200."""
    res = client.post("/api/requests", json=valid_request_payload)
    assert res.status_code == 200
    data = res.json()
    assert "request" in data
    assert data["request"]["status"] == "OPEN"
    assert data["request"]["request_id"].startswith("REQ-")

def test_02_invalid_flight(client, valid_request_payload):
    """Test 2: Invalid flight returns 404."""
    payload = copy.deepcopy(valid_request_payload)
    payload["flight_id"] = "FL-NONEXISTENT-999"
    res = client.post("/api/requests", json=payload)
    assert res.status_code == 404
    assert "Flight not found" in res.json()["detail"]

def test_03_invalid_hotel(client, valid_request_payload):
    """Test 3: Invalid hotel returns 404."""
    payload = copy.deepcopy(valid_request_payload)
    payload["hotel_id"] = "HTL-NONEXISTENT-999"
    res = client.post("/api/requests", json=payload)
    assert res.status_code == 404
    assert "Hotel not found" in res.json()["detail"]

def test_04_incompatible_airport_and_hotel_city(client, valid_request_payload):
    """Test 4: Flight lands at NRT (Tokyo) but hotel is in Dubai (HTL-DXB-001). Returns 400."""
    payload = copy.deepcopy(valid_request_payload)
    payload["hotel_id"] = "HTL-DXB-001"  # Hotel in Dubai Deira
    res = client.post("/api/requests", json=payload)
    assert res.status_code == 400
    assert "does not have a matching route" in res.json()["detail"]

def test_05_zero_adults(client, valid_request_payload):
    """Test 5: Zero adults violates Pydantic schema (ge=1). Returns 422."""
    payload = copy.deepcopy(valid_request_payload)
    payload["adults"] = 0
    res = client.post("/api/requests", json=payload)
    assert res.status_code == 422

def test_06_negative_child_age(client, valid_request_payload):
    """Test 6: Child age < 0 returns 400."""
    payload = copy.deepcopy(valid_request_payload)
    payload["child_ages"] = [-1]
    res = client.post("/api/requests", json=payload)
    assert res.status_code == 400
    assert "Child age must be between 0 and 17" in res.json()["detail"]

def test_07_child_age_17(client, valid_request_payload):
    """Test 7: Child age 17 is valid and accepted."""
    payload = copy.deepcopy(valid_request_payload)
    payload["child_ages"] = [17]
    res = client.post("/api/requests", json=payload)
    assert res.status_code == 200
    assert res.json()["request"]["child_ages"] == [17]

def test_08_child_age_18(client, valid_request_payload):
    """Test 8: Child age 18 is rejected with 400."""
    payload = copy.deepcopy(valid_request_payload)
    payload["child_ages"] = [18]
    res = client.post("/api/requests", json=payload)
    assert res.status_code == 400
    assert "Child age must be between 0 and 17" in res.json()["detail"]

def test_09_pickup_exactly_60_minutes_after_landing(client, valid_request_payload):
    """Test 9: FL-401 lands at 10:30, pickup at 11:30 (exactly 60 min) is accepted."""
    payload = copy.deepcopy(valid_request_payload)
    payload["pickup"] = "2027-04-10T11:30:00"
    res = client.post("/api/requests", json=payload)
    assert res.status_code == 200

def test_10_pickup_59_minutes_after_landing(client, valid_request_payload):
    """Test 10: Pickup at 11:29 (59 min after landing) is rejected with 400."""
    payload = copy.deepcopy(valid_request_payload)
    payload["pickup"] = "2027-04-10T11:29:00"
    res = client.post("/api/requests", json=payload)
    assert res.status_code == 400
    assert "Pickup must be at least 60 minutes" in res.json()["detail"]

def test_11_price_exactly_at_minimum(client, valid_request_payload):
    """Test 11: Route NRT -> Tokyo Ueno min price is 10200. Exactly 10200 is accepted."""
    payload = copy.deepcopy(valid_request_payload)
    payload["price_inr"] = 10200.0
    res = client.post("/api/requests", json=payload)
    assert res.status_code == 200

def test_12_price_exactly_at_maximum(client, valid_request_payload):
    """Test 12: Route NRT -> Tokyo Ueno max price is 16800. Exactly 16800 is accepted."""
    payload = copy.deepcopy(valid_request_payload)
    payload["price_inr"] = 16800.0
    res = client.post("/api/requests", json=payload)
    assert res.status_code == 200

def test_13_price_below_minimum(client, valid_request_payload):
    """Test 13: Price 10199 (below minimum 10200) is rejected with 400."""
    payload = copy.deepcopy(valid_request_payload)
    payload["price_inr"] = 10199.0
    res = client.post("/api/requests", json=payload)
    assert res.status_code == 400
    assert "Price must be between" in res.json()["detail"]

def test_14_price_above_maximum(client, valid_request_payload):
    """Test 14: Price 16801 (above maximum 16800) is rejected with 400."""
    payload = copy.deepcopy(valid_request_payload)
    payload["price_inr"] = 16801.0
    res = client.post("/api/requests", json=payload)
    assert res.status_code == 400
    assert "Price must be between" in res.json()["detail"]
