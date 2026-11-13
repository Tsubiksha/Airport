
from datetime import datetime, timedelta

from app import data_loader
from app import workflow_store


def get_busy_period(pickup, drive_minutes):
    start = datetime.fromisoformat(pickup)
    end = start + timedelta(minutes=2 * drive_minutes)
    return start, end


def is_vehicle_available(
    company_id,
    vehicle_id,
    pickup,
    drive_minutes,
    exclude_booking_id=None
):
    new_start, new_end = get_busy_period(pickup, drive_minutes)

    # 1. Check organizer's original booked rides
    for ride in data_loader.get_booked_rides():
        if (
            ride["company_id"] == company_id
            and ride["vehicle_id"] == vehicle_id
        ):
            old_start = datetime.fromisoformat(ride["start"])
            old_end = datetime.fromisoformat(ride["end"])

            if new_start < old_end and old_start < new_end:
                return False, f"Conflicts with existing ride {ride['ride_id']}"

    # 2. Check RidePort's own confirmed bookings
    for booking in workflow_store.get_bookings():
        if booking["status"] != "BOOKED":
            continue

        if booking["booking_id"] == exclude_booking_id:
            continue

        if (
            booking["company_id"] == company_id
            and booking["vehicle_id"] == vehicle_id
        ):
            old_start, old_end = get_busy_period(
                booking["pickup"],
                booking["drive_minutes"]
            )

            if new_start < old_end and old_start < new_end:
                return False, (
                    f"Conflicts with RidePort booking "
                    f"{booking['booking_number']}"
                )

    return True, "Vehicle is available"
