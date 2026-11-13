
from datetime import datetime, timedelta
from uuid import uuid4

from app import data_loader
from app import workflow_store
from app import availability_service


def get_booking_by_number(booking_number):
    return next(
        (
            b for b in workflow_store.get_bookings()
            if b["booking_number"] == booking_number
            and b["status"] == "BOOKED"
        ),
        None
    )


def validate_new_booking_time(booking, new_flight_id, new_pickup):
    flights = data_loader.get_flights()
    hotels = data_loader.get_hotels()
    suppliers = data_loader.get_suppliers()
    routes = data_loader.get_routes()

    flight = next(
        (f for f in flights if f["flight_id"] == new_flight_id),
        None
    )

    if flight is None:
        return False, "New flight not found"

    hotel = next(
        (h for h in hotels if h["hotel_id"] == booking["hotel_id"]),
        None
    )

    if hotel is None:
        return False, "Booking hotel not found"

    airport = next(
        (a for a in data_loader.get_airports() if a["code"] == flight["to"]),
        None
    )

    if airport is None or hotel["city"] not in airport.get("serves_cities", []):
        return False, "New arrival airport does not serve the hotel city"

    arrival = datetime.fromisoformat(flight["arrival_local"])
    pickup = datetime.fromisoformat(new_pickup)

    if pickup < arrival + timedelta(minutes=60):
        return False, "Pickup must be at least 60 minutes after landing"

    route = next(
        (
            r for r in routes
            if r["airport"].upper() == flight["to"].upper()
            and r["city"].casefold() == hotel["city"].casefold()
            and r["area"].casefold() == hotel["area"].casefold()
        ),
        None
    )

    if route is None:
        return False, "No route found for the new flight and hotel"

    supplier = next(
        (
            s for s in suppliers
            if s["company_id"] == booking["company_id"]
        ),
        None
    )

    if supplier is None:
        return False, "Supplier not found"

    if flight["to"].upper() not in [
        code.upper() for code in supplier["airports"]
    ]:
        return False, "Supplier does not serve the new airport"

    serves_area = any(
        area["city"].casefold() == hotel["city"].casefold()
        and area["area"].casefold() == hotel["area"].casefold()
        for area in supplier["areas"]
    )

    if not serves_area:
        return False, "Supplier does not serve the hotel area"

    # Check supplier operating hours
    from app.matching_service import time_is_within_service_hours

    if not time_is_within_service_hours(
        pickup,
        supplier["service_from"],
        supplier["service_until"]
    ):
        return False, "Supplier is closed at the new pickup time"

    # Check that the same car still fits the original request
    vehicle = next(
        (
            v for v in supplier["vehicles"]
            if v["vehicle_id"] == booking["vehicle_id"]
        ),
        None
    )

    if vehicle is None:
        return False, "The assigned vehicle no longer exists"

    # Recheck availability at the new time.
    available, reason = availability_service.is_vehicle_available(
        booking["company_id"],
        booking["vehicle_id"],
        new_pickup,
        route["drive_minutes"],
        exclude_booking_id=booking["booking_id"]
    )

    if not available:
        return False, reason

    return True, {
        "flight": flight,
        "pickup": new_pickup,
        "route": route
    }


def create_change(booking_number, new_flight_id=None, new_pickup=None):
    booking = get_booking_by_number(booking_number)

    if booking is None:
        return False, "Booking not found"

    if not new_flight_id and not new_pickup:
        return False, "Provide a new flight or a new pickup time"

    selected_flight_id = new_flight_id or booking["flight_id"]

    if new_pickup:
        selected_pickup = new_pickup
    else:
        flight = next(
            f for f in data_loader.get_flights()
            if f["flight_id"] == selected_flight_id
        )
        selected_pickup = (
            datetime.fromisoformat(flight["arrival_local"])
            + timedelta(minutes=60)
        ).isoformat(timespec="minutes")

    change = {
        "change_id": "CHG-" + uuid4().hex[:8].upper(),
        "booking_id": booking["booking_id"],
        "booking_number": booking_number,
        "company_id": booking["company_id"],
        "new_flight_id": selected_flight_id,
        "new_pickup": selected_pickup,
        "status": "WAITING"
    }

    workflow_store.add_change_request(change)
    return True, change


def decide_change(change_id, decision):
    changes = workflow_store.get_change_requests()

    change = next(
        (c for c in changes if c["change_id"] == change_id),
        None
    )

    if change is None:
        return False, "Change request not found"

    if change["status"] != "WAITING":
        return False, "This change request has already been decided"

    if decision not in ["ACCEPTED", "REJECTED"]:
        return False, "Decision must be ACCEPTED or REJECTED"

    if decision == "REJECTED":
        updated = workflow_store.update_change_request(
            change_id,
            {"status": "REJECTED"}
        )
        return True, updated

    booking = next(
        (
            b for b in workflow_store.get_bookings()
            if b["booking_id"] == change["booking_id"]
        ),
        None
    )

    if booking is None:
        return False, "Booking not found"

    valid, result = validate_new_booking_time(
        booking,
        change["new_flight_id"],
        change["new_pickup"]
    )

    if not valid:
        return False, result

    # Apply the new flight, pickup and route duration
    workflow_store.update_booking(
        booking["booking_id"],
        {
            "flight_id": change["new_flight_id"],
            "pickup": change["new_pickup"],
            "drive_minutes": result["route"]["drive_minutes"]
        }
    )

    updated = workflow_store.update_change_request(
        change_id,
        {"status": "ACCEPTED"}
    )

    return True, updated
