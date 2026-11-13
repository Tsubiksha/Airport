
from datetime import datetime, timedelta, time

from app import data_loader
from app import request_store


def get_all_requests():
    """
    Combine the organizer's initial open requests
    with requests created by travellers in our app.
    Prioritizes newly saved requests first.
    """
    initial_requests = data_loader.get_open_requests()
    saved_requests = request_store.get_requests()

    combined = {}
    # Put saved requests first so newest requests are prioritized at the top
    for request in saved_requests:
        combined[request["request_id"]] = request
    for request in initial_requests:
        if request["request_id"] not in combined:
            combined[request["request_id"]] = request

    return list(combined.values())


def find_by_id(items, key, value):
    """Find one item in a list using its ID."""
    return next(
        (item for item in items if item.get(key) == value),
        None
    )


def time_is_within_service_hours(pickup_time, service_from, service_until):
    """
    Check whether pickup time falls within supplier operating hours.
    Supports overnight hours, for example 05:00 to 01:00.
    Both endpoints are included.
    """
    pickup_clock = pickup_time.time()
    start = time.fromisoformat(service_from)
    end = time.fromisoformat(service_until)

    if start <= end:
        return start <= pickup_clock <= end

    # Overnight operating hours
    return pickup_clock >= start or pickup_clock <= end


def vehicle_fits_request(vehicle, request):
    """
    R5: Check seats and luggage separately.
    Children also need seats.
    """
    passengers = request["adults"] + len(request.get("child_ages", []))

    if vehicle["seats"] < passengers:
        return False, "Not enough seats"

    if vehicle["large_bags"] < request["large_bags"]:
        return False, "Not enough large-bag capacity"

    if vehicle["small_bags"] < request["small_bags"]:
        return False, "Not enough small-bag capacity"

    requested_type = request.get("car_type")

    if requested_type and vehicle["type"].upper() != requested_type.upper():
        return False, "Vehicle type does not match the requested car type"

    return True, "Vehicle fits the request"


def vehicle_is_free(
    company_id,
    vehicle_id,
    pickup_time,
    drive_minutes
):
    """
    Check the organizer's pre-booked rides.

    A car is busy from pickup until:
    pickup + (2 x drive time).

    Touching endpoints do not count as an overlap.
    """
    new_start = pickup_time
    new_end = pickup_time + timedelta(minutes=2 * drive_minutes)

    booked_rides = data_loader.get_booked_rides()

    for ride in booked_rides:
        if (
            ride["company_id"] == company_id
            and ride["vehicle_id"] == vehicle_id
        ):
            existing_start = datetime.fromisoformat(ride["start"])
            existing_end = datetime.fromisoformat(ride["end"])

            overlaps = (
                new_start < existing_end
                and existing_start < new_end
            )

            if overlaps:
                return False, f"Vehicle is busy due to ride {ride['ride_id']}"

    return True, "Vehicle is available"


def match_request(request):
    """
    Find suppliers and vehicles that can serve this request.

    Checks:
    - Supplier airport
    - Supplier destination city and area
    - Supplier operating hours
    - Vehicle passenger and luggage capacity
    - Existing booked-ride conflicts
    """
    flights = data_loader.get_flights()
    hotels = data_loader.get_hotels()
    suppliers = data_loader.get_suppliers()
    routes = data_loader.get_routes()

    flight = find_by_id(flights, "flight_id", request["flight_id"])
    if flight is None:
        return {
            "eligible_suppliers": [],
            "rejected_suppliers": [],
            "message": "Flight not found"
        }

    hotel = find_by_id(hotels, "hotel_id", request["hotel_id"])
    if hotel is None:
        return {
            "eligible_suppliers": [],
            "rejected_suppliers": [],
            "message": "Hotel not found"
        }

    airport = flight["to"]
    city = hotel["city"]
    area = hotel["area"]

    pickup_time = datetime.fromisoformat(request["pickup"])

    route = next(
        (
            item for item in routes
            if item["airport"].upper() == airport.upper()
            and item["city"].casefold() == city.casefold()
            and item["area"].casefold() == area.casefold()
        ),
        None
    )

    if route is None:
        return {
            "eligible_suppliers": [],
            "rejected_suppliers": [],
            "message": "No matching route found"
        }

    eligible_suppliers = []
    rejected_suppliers = []

    for supplier in suppliers:
        reasons = []

        # Check airport coverage
        if airport.upper() not in [
            code.upper() for code in supplier["airports"]
        ]:
            reasons.append("Supplier does not serve this airport")

        # Check destination city and area
        serves_area = any(
            item["city"].casefold() == city.casefold()
            and item["area"].casefold() == area.casefold()
            for item in supplier["areas"]
        )

        if not serves_area:
            reasons.append("Supplier does not serve this hotel area")

        # Check operating hours
        if not time_is_within_service_hours(
            pickup_time,
            supplier["service_from"],
            supplier["service_until"]
        ):
            reasons.append("Supplier is closed at the pickup time")

        # If supplier-level conditions fail, skip its vehicles
        if reasons:
            rejected_suppliers.append({
                "company_id": supplier["company_id"],
                "company_name": supplier["name"],
                "reasons": reasons
            })
            continue

        suitable_vehicles = []
        vehicle_rejections = []

        for vehicle in supplier["vehicles"]:
            fits, fit_reason = vehicle_fits_request(vehicle, request)

            if not fits:
                vehicle_rejections.append({
                    "vehicle_id": vehicle["vehicle_id"],
                    "reason": fit_reason
                })
                continue

            free, free_reason = vehicle_is_free(
                supplier["company_id"],
                vehicle["vehicle_id"],
                pickup_time,
                route["drive_minutes"]
            )

            if not free:
                vehicle_rejections.append({
                    "vehicle_id": vehicle["vehicle_id"],
                    "reason": free_reason
                })
                continue

            suitable_vehicles.append({
                "vehicle_id": vehicle["vehicle_id"],
                "type": vehicle["type"],
                "seats": vehicle["seats"],
                "large_bags": vehicle["large_bags"],
                "small_bags": vehicle["small_bags"]
            })

        if suitable_vehicles:
            eligible_suppliers.append({
                "company_id": supplier["company_id"],
                "company_name": supplier["name"],
                "rating": supplier["rating"],
                "airport": airport,
                "destination": {
                    "city": city,
                    "area": area
                },
                "vehicles": suitable_vehicles
            })
        else:
            rejected_suppliers.append({
                "company_id": supplier["company_id"],
                "company_name": supplier["name"],
                "reasons": [
                    "No vehicle satisfies the passenger, luggage, "
                    "car-type and availability checks"
                ],
                "vehicle_rejections": vehicle_rejections
            })

    return {
        "request_id": request["request_id"],
        "airport": airport,
        "destination": {
            "city": city,
            "area": area
        },
        "pickup": request["pickup"],
        "passengers": request["adults"] + len(
            request.get("child_ages", [])
        ),
        "eligible_suppliers": eligible_suppliers,
        "rejected_suppliers": rejected_suppliers,
        "message": (
            "Matching completed"
            if eligible_suppliers
            else "No supplier has a suitable available vehicle"
        )
    }
