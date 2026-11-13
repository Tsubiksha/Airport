"""
date_validation.py - Strict date/time validation & airport timezone support for RidePort.

Enforces:
1. No past flight dates.
2. No past landing datetimes.
3. No past pickup datetimes.
4. Rule R2: Pickup must be at least 60 minutes after landing datetime (full datetime comparison across date boundaries).
5. Dynamic timezone-aware conversions based on arrival airport metadata.
"""

from datetime import datetime, date, time, timedelta
from zoneinfo import ZoneInfo
from typing import Tuple, Optional
from app import data_loader


def get_airport_timezone(airport_code: str) -> ZoneInfo:
    """Return the IANA ZoneInfo for the airport from airports.json catalog, or UTC fallback."""
    if not airport_code:
        return ZoneInfo("UTC")
    airports = data_loader.get_airports()
    airport = next((a for a in airports if a.get("code", "").upper() == airport_code.upper()), None)
    tz_str = airport.get("timezone") if airport else None
    if tz_str:
        try:
            return ZoneInfo(tz_str)
        except Exception:
            pass
    return ZoneInfo("UTC")


def get_current_time_at_airport(airport_code: str) -> datetime:
    """Get the live dynamic datetime in the airport's local timezone."""
    tz = get_airport_timezone(airport_code)
    return datetime.now(tz)


def ensure_timezone_aware(dt: datetime, tz: ZoneInfo) -> datetime:
    """Ensure datetime is timezone-aware in the given timezone."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=tz)
    return dt.astimezone(tz)


def validate_flight_and_pickup(
    airport_code: str,
    landing_dt: datetime,
    pickup_dt: Optional[datetime] = None,
    now: Optional[datetime] = None,
) -> Tuple[bool, str, datetime]:
    """
    Validate flight landing and pickup times.
    
    Returns:
        (is_valid: bool, error_message: str, resolved_pickup: datetime)
    """
    tz = get_airport_timezone(airport_code)
    now_tz = ensure_timezone_aware(now, tz) if now else datetime.now(tz)
    landing_tz = ensure_timezone_aware(landing_dt, tz)

    # 1. Past flight date check
    if landing_tz.date() < now_tz.date():
        return False, "Selected flight date is in the past. Please select a future flight date.", landing_tz

    # 2. Same day, past landing time check
    if landing_tz < now_tz:
        return False, "Flight landing time has already passed. Please select a future flight.", landing_tz

    # 3. Determine pickup time
    min_pickup_tz = landing_tz + timedelta(minutes=60)
    resolved_pickup_tz = ensure_timezone_aware(pickup_dt, tz) if pickup_dt else min_pickup_tz

    # 4. Past pickup time check
    if resolved_pickup_tz < now_tz:
        return False, "Pickup time cannot be in the past.", resolved_pickup_tz

    # 5. Rule R2: Pickup at least 60 minutes after landing
    if resolved_pickup_tz < min_pickup_tz:
        return False, "Pickup must be at least 60 minutes after flight landing", resolved_pickup_tz

    return True, "", resolved_pickup_tz
