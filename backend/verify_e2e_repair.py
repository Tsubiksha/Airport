import sys
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db, RideRequestDB, OfferDB, BookingDB, ChangeRequestDB

client = TestClient(app)

# Use unique date so consecutive runs never collide on same vehicle schedule
import time
offset_day = int(time.time()) % 20 + 10
pickup_str = f"2027-05-{offset_day:02d}T11:30:00"
new_pickup_str = f"2027-05-{offset_day:02d}T12:00:00"

print(f"=== 1. TRAVELER SUBMITS REQUEST (Date: 2027-05-{offset_day:02d}) ===")
payload = {
    "flight_id": "FL-401",
    "hotel_id": "HTL-TYO-004",
    "adults": 2,
    "child_ages": [6],
    "large_bags": 3,
    "small_bags": 2,
    "pickup": pickup_str,
    "traveler_name": "Menon Family",
    "price_inr": 12000.0
}
res = client.post("/api/requests", json=payload)
print("Response Status:", res.status_code)
req_data = res.json()
req_id = req_data.get("request_id")
print("Assigned Request ID:", req_id)
assert req_id is not None

print("\n=== 2. SUPPLIER DASHBOARD (SAKURA CABS TX-JP-01) SEES IT ===")
sup_res = client.get("/api/suppliers/TX-JP-01/requests")
matching = sup_res.json().get("requests", [])
print(f"Total matching requests: {len(matching)}")
top_req = matching[0]["request"]
print(f"Top request ID in supplier dashboard: {top_req['request_id']} ({top_req['traveler_name']})")
assert top_req["request_id"] == req_id

print("\n=== 3. SUPPLIER ASSIGNS SC-3 WITH PRICE 11,500 ===")
offer_res = client.post(f"/api/suppliers/TX-JP-01/requests/{req_id}/offers", json={
    "vehicle_id": "SC-3",
    "price_inr": 11500.0
})
print("Assign Status:", offer_res.status_code)
offer_data = offer_res.json()
assert offer_res.status_code == 200, f"Failed: {offer_data}"
offer_id = offer_data["offer"]["offer_id"]
print(f"Created Offer ID: {offer_id} for Request ID: {offer_data['offer']['request_id']}")
assert offer_data["offer"]["request_id"] == req_id

print("\n=== 4. TRAVELER RETRIEVES OFFERS ===")
trv_res = client.get(f"/api/requests/{req_id}/offers")
print("Offers count for traveler:", len(trv_res.json().get("offers", [])))
top_offer = trv_res.json()["offers"][0]
print(f"Traveler sees: {top_offer['offer_id']} | {top_offer['company_name']} | {top_offer['vehicle_type']} | INR {top_offer['price_inr']} | Status: {top_offer['status']}")
assert top_offer["offer_id"] == offer_id

print("\n=== 5. MYSQL DATABASE VERIFICATION ===")
db = next(get_db())
r_db = db.query(RideRequestDB).filter_by(request_id=req_id).first()
o_db = db.query(OfferDB).filter_by(offer_id=offer_id).first()
print(f"MySQL Request: ID={r_db.id}, request_id={r_db.request_id}, traveler={r_db.traveler_name}, status={r_db.status}")
print(f"MySQL Offer: ID={o_db.id}, offer_id={o_db.offer_id}, request_ref={o_db.request_id}, price={o_db.price_inr}, status={o_db.status}")

print("\n=== 6. TRAVELER BOOKS OFFER ===")
book_res = client.post(f"/api/offers/{offer_id}/book")
print("Booking Status:", book_res.status_code)
booking = book_res.json().get("booking")
b_num = booking.get("booking_number")
print(f"Booking confirmed! 10-digit number: {b_num}, Status: {booking.get('status')}")
assert len(b_num) == 10 and b_num.isdigit()

print("\n=== 7. BOOKING TRACKER LOOKUP ===")
look_res = client.get(f"/api/bookings/{b_num}")
print("Lookup status:", look_res.status_code)
print(f"Lookup confirmed: Booking #{look_res.json().get('booking_number')} for {look_res.json().get('traveler_name')}")

print("\n=== 8. CHANGE REQUEST WORKFLOW ===")
chg_res = client.post(f"/api/bookings/{b_num}/change-requests", json={
    "new_flight_id": "FL-401",
    "new_pickup": new_pickup_str
})
print("Change request status:", chg_res.status_code)
chg_data = chg_res.json().get("change_request", {})
chg_id = chg_data.get("change_id")
print(f"Created Change Request ID: {chg_id}, Status: {chg_data.get('status')}")

# Supplier reviews and accepts change
dec_res = client.post(f"/api/change-requests/{chg_id}/decision", json={"decision": "ACCEPT"})
print("Decision response:", dec_res.status_code, dec_res.json().get("message"))
assert dec_res.status_code == 200

# Verify booking is updated
updated_booking = client.get(f"/api/bookings/{b_num}").json()
print(f"Updated Booking Pickup: {updated_booking.get('pickup')}")
assert updated_booking.get("pickup").startswith(f"2027-05-{offset_day:02d}T12:00")

print("\nALL WORKFLOW REPAIRS VERIFIED 100% PASS!")
