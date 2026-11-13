
from app import data_loader
from app import matching_service
from app import availability_service


def assign_vehicle(request, company_id, vehicle_id, supplier_price):
    suppliers = data_loader.get_suppliers()

    supplier = next(
        (s for s in suppliers if s["company_id"] == company_id),
        None
    )

    if supplier is None:
        return False, "Supplier not found"

    # Stage 3 matching: supplier must be eligible for this request
    result = matching_service.match_request(request)

    eligible = next(
        (
            item for item in result["eligible_suppliers"]
            if item["company_id"] == company_id
        ),
        None
    )

    if eligible is None:
        return False, "Supplier is not eligible for this request (R4/R5/R6)"

    vehicle = next(
        (
            v for v in supplier["vehicles"]
            if v["vehicle_id"] == vehicle_id
        ),
        None
    )

    if vehicle is None:
        return False, "This vehicle does not belong to this supplier"

    suitable_vehicle = next(
        (
            v for v in eligible["vehicles"]
            if v["vehicle_id"] == vehicle_id
        ),
        None
    )

    if suitable_vehicle is None:
        return False, "Vehicle does not fit or is not available (R5/R6)"

    # Find route for suggested price range and drive time
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

    if not (
        route["price_min_inr"]
        <= supplier_price
        <= route["price_max_inr"]
    ):
        return False, (
            f"Supplier price must be between INR "
            f"{route['price_min_inr']} and INR {route['price_max_inr']}"
        )

    # Recheck availability before saving the offer
    available, reason = availability_service.is_vehicle_available(
        company_id,
        vehicle_id,
        request["pickup"],
        route["drive_minutes"]
    )

    if not available:
        return False, reason

    return True, {
        "supplier": supplier,
        "vehicle": vehicle,
        "route": route
    }
