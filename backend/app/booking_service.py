
from datetime import datetime, timezone
from uuid import uuid4
import secrets

from app import workflow_store
from app import availability_service
from app import data_loader


def get_route_for_request(request):
    flight = next(
        f for f in data_loader.get_flights()
        if f["flight_id"] == request["flight_id"]
    )

    hotel = next(
        h for h in data_loader.get_hotels()
        if h["hotel_id"] == request["hotel_id"]
    )

    route = next(
        r for r in data_loader.get_routes()
        if r["airport"].upper() == flight["to"].upper()
        and r["city"].casefold() == hotel["city"].casefold()
        and r["area"].casefold() == hotel["area"].casefold()
    )

    return flight, hotel, route


def book_offer(offer_id):
    offers = workflow_store.get_offers()

    offer = next(
        (o for o in offers if o["offer_id"] == offer_id),
        None
    )

    if offer is None:
        return False, "Offer not found"

    if offer["status"] != "OFFERED":
        return False, "This offer is no longer available for booking"

    # G4: Offer Expiry check
    if offer.get("expires_at"):
        try:
            expires_at_dt = datetime.fromisoformat(str(offer["expires_at"]).replace("Z", "+00:00"))
            now_dt = datetime.utcnow()
            if expires_at_dt.tzinfo is not None:
                from datetime import timezone
                now_dt = datetime.now(timezone.utc)
            if now_dt > expires_at_dt:
                offer["status"] = "EXPIRED"
                workflow_store.update_offer(offer["offer_id"], {"status": "EXPIRED"})
                return False, "This offer has expired"
        except Exception:
            pass

    all_requests = (
        __import__("app.matching_service", fromlist=["get_all_requests"])
        .get_all_requests()
    )

    request = next(
        (r for r in all_requests if r["request_id"] == offer["request_id"]),
        None
    )

    if request is None:
        return False, "Original ride request not found"

    _, hotel, route = get_route_for_request(request)

    # R8: recheck availability immediately before confirming
    available, reason = availability_service.is_vehicle_available(
        offer["company_id"],
        offer["vehicle_id"],
        request["pickup"],
        route["drive_minutes"]
    )

    if not available:
        return False, f"Booking rejected: {reason}"

    # Generate a unique 10-digit booking number
    existing_numbers = {
        b["booking_number"]
        for b in workflow_store.get_bookings()
    }

    booking_number = None

    for _ in range(100):
        candidate = str(secrets.randbelow(9000000000) + 1000000000)
        if candidate not in existing_numbers:
            booking_number = candidate
            break

    if booking_number is None:
        return False, "Could not generate a unique booking number"

    booking = {
        "booking_id": "BKG-" + uuid4().hex[:8].upper(),
        "booking_number": booking_number,
        "offer_id": offer_id,
        "request_id": request["request_id"],
        "traveler_name": request["traveler_name"],
        "flight_id": request["flight_id"],
        "hotel_id": request["hotel_id"],
        "pickup": request["pickup"],
        "company_id": offer["company_id"],
        "vehicle_id": offer["vehicle_id"],
        "price_inr": offer["price_inr"],
        "drive_minutes": route["drive_minutes"],
        "status": "BOOKED"
    }

    workflow_store.add_booking(booking)

    # Update request status to BOOKED
    from app import request_store
    request_store.update_request(request["request_id"], {"status": "BOOKED"})

    # Selected offer becomes BOOKED; other offers become NOT_CHOSEN
    for item in offers:
        if item["request_id"] == request["request_id"]:
            if item["offer_id"] == offer_id:
                workflow_store.update_offer(
                    item["offer_id"],
                    {"status": "BOOKED"}
                )
            elif item["status"] == "OFFERED":
                workflow_store.update_offer(
                    item["offer_id"],
                    {"status": "NOT_CHOSEN"}
                )

    return True, booking


def get_booking_summary(booking_number):
    bookings = workflow_store.get_bookings()

    booking = next(
        (
            b for b in bookings
            if b["booking_number"] == booking_number
            and b["status"] == "BOOKED"
        ),
        None
    )

    if booking is None:
        return None

    flight = next(
        (
            f for f in data_loader.get_flights()
            if f["flight_id"] == booking["flight_id"]
        ),
        None
    )

    hotel = next(
        (
            h for h in data_loader.get_hotels()
            if h["hotel_id"] == booking["hotel_id"]
        ),
        None
    )

    supplier = next(
        (
            s for s in data_loader.get_suppliers()
            if s["company_id"] == booking["company_id"]
        ),
        None
    )

    # Fetch change requests for this booking
    all_changes = workflow_store.get_change_requests()
    booking_changes = [
        c for c in all_changes
        if c.get("booking_number") == booking_number or c.get("booking_id") == booking.get("booking_id")
    ]
    booking_changes.sort(key=lambda x: x.get("change_id", ""), reverse=True)
    active_change = next((c for c in booking_changes if c.get("status") == "WAITING"), None)
    latest_change = booking_changes[0] if booking_changes else None

    return {
        "booking_id": booking["booking_id"],
        "booking_number": booking["booking_number"],
        "status": booking["status"],
        "traveler_name": booking["traveler_name"],
        "flight": flight,
        "flight_id": booking["flight_id"],
        "hotel": hotel,
        "hotel_id": booking["hotel_id"],
        "pickup": booking["pickup"],
        "company_id": booking["company_id"],
        "supplier": supplier["name"] if supplier else booking["company_id"],
        "vehicle_id": booking["vehicle_id"],
        "price_inr": booking["price_inr"],
        "drive_minutes": booking.get("drive_minutes"),
        "change_requests": booking_changes,
        "active_change": active_change,
        "latest_change": latest_change,
    }
