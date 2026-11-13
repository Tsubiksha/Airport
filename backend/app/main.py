from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
from uuid import uuid4
from pydantic import BaseModel, Field

from app import data_loader
from app import request_store
from app.schemas import RideRequest
from app import matching_service
from app import workflow_store
from app import assignment_service
from app import booking_service
from app import change_service
from app.date_validation import (
    validate_flight_and_pickup,
    get_airport_timezone,
    get_current_time_at_airport,
)
from app.database import Base, engine, DB_AVAILABLE


app = FastAPI(
    title="RidePort API",
    description="Airport Taxi Ride Offers Platform",
    version="1.0.0"
)


@app.on_event("startup")
async def startup_event():
    if DB_AVAILABLE:
        try:
            Base.metadata.create_all(bind=engine)
            request_store.sync_file_to_db()
            workflow_store.sync_file_to_db()
            print("MySQL tables created and data synced")
        except Exception as e:
            print(f"Startup DB sync warning: {e}")

# Allow the Next.js frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "Welcome to RidePort API"
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "message": "RidePort backend is running"
    }


# -----------------------------
# AIRPORTS
# -----------------------------

@app.get("/api/catalog/airports")
def airports():
    return data_loader.get_airports()


# -----------------------------
# FLIGHTS
# -----------------------------

@app.get("/api/catalog/flights")
def flights():
    return data_loader.get_flights()


@app.get("/api/catalog/flights/{flight_id}")
def get_flight(flight_id: str):

    all_flights = data_loader.get_flights()

    for flight in all_flights:
        if flight["flight_id"] == flight_id:
            return flight

    raise HTTPException(
        status_code=404,
        detail="Flight not found"
    )


# -----------------------------
# HOTELS
# -----------------------------

@app.get("/api/catalog/hotels")
def hotels():
    return data_loader.get_hotels()


@app.get("/api/catalog/hotels/{hotel_id}")
def get_hotel(hotel_id: str):

    all_hotels = data_loader.get_hotels()

    for hotel in all_hotels:
        if hotel["hotel_id"] == hotel_id:
            return hotel

    raise HTTPException(
        status_code=404,
        detail="Hotel not found"
    )


# -----------------------------
# TAXI SUPPLIERS
# -----------------------------

@app.get("/api/suppliers")
def suppliers():
    return data_loader.get_suppliers()


# -----------------------------
# ROUTES
# -----------------------------

@app.get("/api/routes")
def routes(
    airport: str,
    city: str,
    area: str
):

    all_routes = data_loader.get_routes()

    for route in all_routes:
        if (
            route["airport"].upper() == airport.upper()
            and route["city"].casefold() == city.casefold()
            and route["area"].casefold() == area.casefold()
        ):
            return {
                **route,
                "min_price_inr": route["price_min_inr"],
                "max_price_inr": route["price_max_inr"]
            }

    raise HTTPException(
        status_code=404,
        detail="Route not found for this airport and destination"
    )


# -----------------------------
# EXISTING RIDES AND REQUESTS
# -----------------------------

@app.get("/api/booked-rides")
def booked_rides():
    return data_loader.get_booked_rides()


@app.get("/api/open-requests")
def open_requests():
    return data_loader.get_open_requests()


@app.get("/api/requests")
def get_all_requests():
    """Return all requests: open (from JSON catalog) + submitted (from store)."""
    open_reqs = data_loader.get_open_requests()
    saved_reqs = request_store.get_requests()
    # Merge, deduplicate by request_id
    seen = {r["request_id"] for r in open_reqs}
    merged = list(open_reqs)
    for r in saved_reqs:
        if r.get("request_id") not in seen:
            merged.append(r)
            seen.add(r["request_id"])
    return merged



@app.post("/api/requests")
def create_ride_request(request: RideRequest):

    # 1. Find the selected flight
    flights = data_loader.get_flights()

    flight = next(
        (f for f in flights if f["flight_id"] == request.flight_id),
        None
    )

    if flight is None:
        raise HTTPException(status_code=404, detail="Flight not found")

    # 2. Find the selected hotel
    hotels = data_loader.get_hotels()

    hotel = next(
        (h for h in hotels if h["hotel_id"] == request.hotel_id),
        None
    )

    if hotel is None:
        raise HTTPException(status_code=404, detail="Hotel not found")

    # 3. Validate child ages (0 to 17)
    for age in request.child_ages:
        if age < 0 or age > 17:
            raise HTTPException(
                status_code=400,
                detail="Child age must be between 0 and 17"
            )

    # 4. Get arrival airport from the selected flight
    arrival_airport = flight["to"]

    # 5. Find the matching route using airport, city and area
    routes = data_loader.get_routes()

    route = next(
        (
            r for r in routes
            if r["airport"].upper() == arrival_airport.upper()
            and r["city"].casefold() == hotel["city"].casefold()
            and r["area"].casefold() == hotel["area"].casefold()
        ),
        None
    )

    if route is None:
        raise HTTPException(
            status_code=400,
            detail="The arrival airport does not have a matching route to this hotel area"
        )

    # 6. Read flight landing time and apply date override if specified
    base_arrival = datetime.fromisoformat(flight["arrival_local"])
    if request.flight_date:
        try:
            custom_date = datetime.fromisoformat(request.flight_date).date()
            arrival_time = datetime.combine(custom_date, base_arrival.time())
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid flight date format")
    else:
        arrival_time = base_arrival

    # 7. Strict date, landing time, and pickup validation with airport timezone
    is_valid, err_msg, resolved_pickup = validate_flight_and_pickup(
        airport_code=arrival_airport,
        landing_dt=arrival_time,
        pickup_dt=request.pickup
    )
    if not is_valid:
        raise HTTPException(status_code=400, detail=err_msg)

    pickup_time = resolved_pickup.replace(tzinfo=None)

    # 8. Validate traveler price against route price range
    minimum_price = route["price_min_inr"]
    maximum_price = route["price_max_inr"]

    if not minimum_price <= request.price_inr <= maximum_price:
        raise HTTPException(
            status_code=400,
            detail=f"Price must be between INR {minimum_price} and INR {maximum_price}"
        )

    # 10. Create and save the request
    new_request = {
        "request_id": "REQ-" + uuid4().hex[:8].upper(),
        "traveler_name": request.traveler_name,
        "flight_id": request.flight_id,
        "hotel_id": request.hotel_id,
        "airport": arrival_airport,
        "adults": request.adults,
        "child_ages": request.child_ages,
        "large_bags": request.large_bags,
        "small_bags": request.small_bags,
        "pickup": pickup_time.isoformat(),
        "car_type": request.car_type,
        "price_inr": request.price_inr,
        "status": "OPEN"
    }

    request_store.save_request(new_request)

    return {
        "message": "Ride request created successfully",
        "request_id": new_request["request_id"],
        "request": new_request,
        "route_price_range": {
            "minimum": minimum_price,
            "maximum": maximum_price
        }
    }


@app.get("/api/requests/{request_id}")
def get_single_request(request_id: str):
    """Retrieve full request details by request_id."""
    all_requests = matching_service.get_all_requests()
    request = next(
        (r for r in all_requests if r["request_id"] == request_id),
        None
    )
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")
    return request




class ScheduleValidationInput(BaseModel):
    flight_id: str
    flight_date: str | None = None
    pickup: datetime | None = None


@app.post("/api/requests/validate-schedule")
def validate_schedule_endpoint(payload: ScheduleValidationInput):
    flights = data_loader.get_flights()
    flight = next((f for f in flights if f["flight_id"] == payload.flight_id), None)
    if flight is None:
        raise HTTPException(status_code=404, detail="Flight not found")

    arrival_airport = flight["to"]
    base_arrival = datetime.fromisoformat(flight["arrival_local"])
    if payload.flight_date:
        try:
            custom_date = datetime.fromisoformat(payload.flight_date).date()
            arrival_time = datetime.combine(custom_date, base_arrival.time())
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid flight date format")
    else:
        arrival_time = base_arrival

    is_valid, err_msg, resolved_pickup = validate_flight_and_pickup(
        airport_code=arrival_airport,
        landing_dt=arrival_time,
        pickup_dt=payload.pickup,
    )
    if not is_valid:
        raise HTTPException(status_code=400, detail=err_msg)

    tz = get_airport_timezone(arrival_airport)
    earliest_valid = arrival_time + timedelta(minutes=60)

    return {
        "valid": True,
        "airport": arrival_airport,
        "airport_timezone": str(tz),
        "landing_datetime": arrival_time.isoformat(),
        "earliest_pickup": earliest_valid.isoformat(),
        "resolved_pickup": resolved_pickup.replace(tzinfo=None).isoformat()
    }


# -----------------------------------------
# STAGE 3: SUPPLIER MATCHING AND DASHBOARD
# -----------------------------------------

@app.get("/api/requests/{request_id}/eligible-suppliers")
def get_eligible_suppliers(request_id: str):

    all_requests = matching_service.get_all_requests()

    request = next(
        (
            item for item in all_requests
            if item["request_id"] == request_id
        ),
        None
    )

    if request is None:
        raise HTTPException(
            status_code=404,
            detail="Ride request not found"
        )

    return matching_service.match_request(request)


@app.get("/api/suppliers/{company_id}/requests")
def get_supplier_requests(company_id: str):

    suppliers = data_loader.get_suppliers()

    supplier = next(
        (
            item for item in suppliers
            if item["company_id"] == company_id
        ),
        None
    )

    if supplier is None:
        raise HTTPException(
            status_code=404,
            detail="Supplier not found"
        )

    all_requests = matching_service.get_all_requests()
    all_offers = workflow_store.get_offers()
    matching_requests = []

    for request in all_requests:
        if request.get("status") == "BOOKED":
            continue
        result = matching_service.match_request(request)

        for eligible in result["eligible_suppliers"]:
            if eligible["company_id"] == company_id:
                # Find any existing offers by this company for this request
                company_offers = [
                    off for off in all_offers
                    if off.get("request_id") == request.get("request_id")
                    and off.get("company_id") == company_id
                ]
                matching_requests.append({
                    "request": request,
                    "available_vehicles": eligible["vehicles"],
                    "existing_offers": company_offers
                })

    return {
        "company_id": supplier["company_id"],
        "company_name": supplier["name"],
        "total_matching_requests": len(matching_requests),
        "requests": matching_requests
    }



from pydantic import BaseModel, Field


class AssignVehicleInput(BaseModel):
    vehicle_id: str
    price_inr: int = Field(gt=0)


@app.post("/api/requests/{request_id}/offers")
def create_offer(request_id: str, payload: AssignVehicleInput):

    all_requests = matching_service.get_all_requests()

    request = next(
        (r for r in all_requests if r["request_id"] == request_id),
        None
    )

    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")

    success, result = assignment_service.assign_vehicle(
        request=request,
        company_id="",  # Replace using the supplier endpoint below
        vehicle_id=payload.vehicle_id,
        supplier_price=payload.price_inr
    )

    return result


@app.post("/api/suppliers/{company_id}/requests/{request_id}/offers")
def create_supplier_offer(
    company_id: str,
    request_id: str,
    payload: AssignVehicleInput
):
    all_requests = matching_service.get_all_requests()

    request = next(
        (r for r in all_requests if r["request_id"] == request_id),
        None
    )

    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")

    success, result = assignment_service.assign_vehicle(
        request,
        company_id,
        payload.vehicle_id,
        payload.price_inr
    )

    if not success:
        raise HTTPException(status_code=400, detail=result)

    offer = {
        "offer_id": "OFF-" + uuid4().hex[:8].upper(),
        "request_id": request_id,
        "company_id": company_id,
        "company_name": result["supplier"]["name"],
        "vehicle_id": payload.vehicle_id,
        "vehicle_type": result["vehicle"]["type"],
        "seats": result["vehicle"]["seats"],
        "large_bags": result["vehicle"]["large_bags"],
        "small_bags": result["vehicle"]["small_bags"],
        "price_inr": payload.price_inr,
        "status": "OFFERED",
        "created_at": datetime.utcnow().isoformat()
    }

    workflow_store.add_offer(offer)

    return {
        "message": "Vehicle assigned successfully",
        "offer": offer
    }


@app.get("/api/requests/{request_id}/offers")
def get_request_offers(request_id: str):

    all_requests = matching_service.get_all_requests()

    request = next(
        (r for r in all_requests if r["request_id"] == request_id),
        None
    )

    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")

    raw_offers = [
        offer for offer in workflow_store.get_offers()
        if offer["request_id"] == request_id
        and offer["status"] in ["OFFERED", "BOOKED", "NOT_CHOSEN", "REJECTED"]
    ]

    # Enrich with supplier and vehicle specs if missing
    suppliers_map = {s["company_id"]: s for s in data_loader.get_suppliers()}
    enriched_offers = []
    for off in raw_offers:
        item = dict(off)
        s = suppliers_map.get(item.get("company_id"))
        if s:
            item.setdefault("company_name", s.get("name"))
            v = next((vh for vh in s.get("vehicles", []) if vh.get("vehicle_id") == item.get("vehicle_id")), None)
            if v:
                item.setdefault("vehicle_type", v.get("type"))
                item.setdefault("seats", v.get("seats"))
                item.setdefault("large_bags", v.get("large_bags"))
                item.setdefault("small_bags", v.get("small_bags"))
        enriched_offers.append(item)

    return {
        "request_id": request_id,
        "request": request,
        "offers": enriched_offers
    }


@app.post("/api/offers/{offer_id}/book")
def book_taxi_offer(offer_id: str):

    success, result = booking_service.book_offer(offer_id)

    if not success:
        raise HTTPException(status_code=400, detail=result)

    return {
        "message": "Taxi booked successfully",
        "booking": result
    }


@app.post("/api/offers/{offer_id}/reject")
def reject_taxi_offer(offer_id: str):

    offer = next(
        (
            o for o in workflow_store.get_offers()
            if o["offer_id"] == offer_id
        ),
        None
    )

    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found")

    if offer["status"] != "OFFERED":
        raise HTTPException(
            status_code=400,
            detail="Only an offered taxi can be rejected"
        )

    updated = workflow_store.update_offer(
        offer_id,
        {"status": "REJECTED"}
    )

    return {
        "message": "Taxi offer rejected",
        "offer": updated
    }


@app.get("/api/bookings/{booking_number}")
def get_booking(booking_number: str):

    if not booking_number.isdigit() or len(booking_number) != 10:
        raise HTTPException(
            status_code=400,
            detail="Booking number must contain exactly 10 digits"
        )

    summary = booking_service.get_booking_summary(booking_number)

    if summary is None:
        raise HTTPException(
            status_code=404,
            detail="Booking not found"
        )

    return summary


class ChangeRequestInput(BaseModel):
    new_flight_id: str | None = None
    new_pickup: datetime | None = None


class ChangeDecisionInput(BaseModel):
    decision: str


@app.post("/api/bookings/{booking_number}/change-requests")
def request_booking_change(
    booking_number: str,
    payload: ChangeRequestInput
):
    success, result = change_service.create_change(
        booking_number,
        payload.new_flight_id,
        payload.new_pickup.isoformat(timespec="minutes")
        if payload.new_pickup else None
    )

    if not success:
        raise HTTPException(status_code=400, detail=result)

    return {
        "message": "Change request submitted",
        "change_request": result
    }


@app.get("/api/suppliers/{company_id}/change-requests")
def supplier_change_requests(company_id: str):

    changes = [
        item for item in workflow_store.get_change_requests()
        if item["company_id"] == company_id
    ]

    return {
        "company_id": company_id,
        "change_requests": changes
    }


@app.post("/api/change-requests/{change_id}/decision")
def decide_booking_change(
    change_id: str,
    payload: ChangeDecisionInput
):
    decision = payload.decision.upper()
    if decision == "ACCEPT":
        decision = "ACCEPTED"
    elif decision == "REJECT":
        decision = "REJECTED"

    success, result = change_service.decide_change(
        change_id,
        decision
    )

    if not success:
        raise HTTPException(status_code=400, detail=result)

    return {
        "message": f"Change request {decision.lower()}",
        "change_request": result
    }


@app.get("/api/suppliers/{company_id}/offers")
def get_supplier_offers(company_id: str):
    """Return all offers submitted by a specific supplier."""
    suppliers = data_loader.get_suppliers()
    supplier = next(
        (s for s in suppliers if s["company_id"] == company_id),
        None
    )
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")

    offers = [
        o for o in workflow_store.get_offers()
        if o["company_id"] == company_id
    ]

    return {
        "company_id": company_id,
        "company_name": supplier["name"],
        "total_offers": len(offers),
        "offers": offers
    }
