"""
shared_ride_service.py - Stretch S1: Shared Ride Architecture and Compatibility Evaluation.

Evaluates whether two distinct ride requests can share a single vehicle:
1. Same flight ID (and thus same landing time and airport).
2. Same destination city and area (hotel area matching).
3. Combined passenger count (adults + child_ages) fits within vehicle seats.
4. Combined luggage count (large_bags and small_bags) fits within vehicle luggage capacity.
5. Operating hours and supplier coverage are respected.
6. Calculates suggested combined & split fare.
"""

from datetime import datetime, timedelta
from app import data_loader
from app import matching_service
from app import availability_service


def evaluate_shared_ride_compatibility(request_1: dict, request_2: dict):
    """
    Evaluate if request_1 and request_2 are eligible to share a ride.
    Returns:
        (is_compatible: bool, reason: str, details: dict | None)
    """
    if request_1.get("request_id") == request_2.get("request_id"):
        return False, "Cannot share ride with the same request", None

    # 1. Flight check: must be on the exact same flight
    if request_1.get("flight_id") != request_2.get("flight_id"):
        return False, f"Flights differ ({request_1.get('flight_id')} vs {request_2.get('flight_id')}). Shared rides require the same flight.", None

    # Load flights, hotels, routes
    flights = data_loader.get_flights()
    hotels = data_loader.get_hotels()
    routes = data_loader.get_routes()
    suppliers = data_loader.get_suppliers()

    flight = next((f for f in flights if f["flight_id"] == request_1["flight_id"]), None)
    if not flight:
        return False, "Flight not found in catalog", None

    hotel_1 = next((h for h in hotels if h["hotel_id"] == request_1["hotel_id"]), None)
    hotel_2 = next((h for h in hotels if h["hotel_id"] == request_2["hotel_id"]), None)

    if not hotel_1 or not hotel_2:
        return False, "One or both destination hotels not found", None

    # 2. Destination Area check: must be in the same city and area
    if hotel_1.get("city", "").casefold() != hotel_2.get("city", "").casefold():
        return False, f"Cities differ ({hotel_1.get('city')} vs {hotel_2.get('city')})", None

    if hotel_1.get("area", "").casefold() != hotel_2.get("area", "").casefold():
        return False, f"Areas differ ({hotel_1.get('area')} vs {hotel_2.get('area')}). Shared rides require the same destination area.", None

    # 3. Aggregate passenger and luggage requirements
    p1 = request_1["adults"] + len(request_1.get("child_ages", []))
    p2 = request_2["adults"] + len(request_2.get("child_ages", []))
    total_passengers = p1 + p2

    total_large_bags = request_1["large_bags"] + request_2["large_bags"]
    total_small_bags = request_1["small_bags"] + request_2["small_bags"]

    # 4. Route lookup
    route = next(
        (
            r for r in routes
            if r["airport"].upper() == flight["to"].upper()
            and r["city"].casefold() == hotel_1["city"].casefold()
            and r["area"].casefold() == hotel_1["area"].casefold()
        ),
        None
    )

    if not route:
        return False, "No route found from arrival airport to destination area", None

    # 5. Pickup time compatibility: within 30 minutes of each other
    t1 = datetime.fromisoformat(request_1["pickup"])
    t2 = datetime.fromisoformat(request_2["pickup"])
    if abs((t1 - t2).total_seconds()) > 30 * 60:
        return False, "Pickup times differ by more than 30 minutes", None

    common_pickup = max(t1, t2)

    # 6. Find vehicles across eligible suppliers that can accommodate the combined group
    compatible_vehicles = []
    for supplier in suppliers:
        # Check airport coverage
        if flight["to"].upper() not in [code.upper() for code in supplier.get("airports", [])]:
            continue

        # Check area coverage
        serves_area = any(
            a["city"].casefold() == hotel_1["city"].casefold()
            and a["area"].casefold() == hotel_1["area"].casefold()
            for a in supplier.get("areas", [])
        )
        if not serves_area:
            continue

        # Check operating hours
        if not matching_service.time_is_within_service_hours(
            common_pickup,
            supplier["service_from"],
            supplier["service_until"]
        ):
            continue

        # Check vehicles capacity
        for v in supplier.get("vehicles", []):
            if v["seats"] >= total_passengers and v["large_bags"] >= total_large_bags and v["small_bags"] >= total_small_bags:
                # Check availability
                avail, _ = availability_service.is_vehicle_available(
                    supplier["company_id"],
                    v["vehicle_id"],
                    common_pickup.isoformat(),
                    route["drive_minutes"]
                )
                if avail:
                    compatible_vehicles.append({
                        "company_id": supplier["company_id"],
                        "company_name": supplier["name"],
                        "vehicle_id": v["vehicle_id"],
                        "vehicle_type": v["type"],
                        "seats": v["seats"],
                        "large_bags": v["large_bags"],
                        "small_bags": v["small_bags"],
                    })

    if not compatible_vehicles:
        return False, f"No vehicle has capacity for combined group ({total_passengers} passengers, {total_large_bags}L/{total_small_bags}S bags)", None

    # Calculate shared discount: e.g. 70% of standard route price each (totaling 140% for the supplier, saving 30% per traveler)
    base_price = (route["price_min_inr"] + route["price_max_inr"]) / 2
    per_traveler_fare = round(base_price * 0.70)
    total_supplier_earnings = per_traveler_fare * 2

    return True, "Shared ride compatible", {
        "flight_id": flight["flight_id"],
        "airport": flight["to"],
        "city": hotel_1["city"],
        "area": hotel_1["area"],
        "total_passengers": total_passengers,
        "total_large_bags": total_large_bags,
        "total_small_bags": total_small_bags,
        "recommended_pickup": common_pickup.isoformat(),
        "drive_minutes": route["drive_minutes"],
        "individual_fares_inr": per_traveler_fare,
        "total_fare_inr": total_supplier_earnings,
        "savings_percentage": "30%",
        "compatible_vehicles_count": len(compatible_vehicles),
        "compatible_vehicles": compatible_vehicles[:5]
    }
