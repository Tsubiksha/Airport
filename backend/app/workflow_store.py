"""
workflow_store.py - Dual-write (file + MySQL) for offers, bookings, change requests.
All original function signatures are preserved exactly.
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
WORKFLOW_FILE = STORAGE_DIR / "workflow.json"


# ---------------------------------------------------------------------------
# File helpers (original _load / _save behaviour)
# ---------------------------------------------------------------------------

def _load():
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    if not WORKFLOW_FILE.exists():
        _save({"offers": [], "bookings": [], "change_requests": []})
    with open(WORKFLOW_FILE, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _save(data):
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with open(WORKFLOW_FILE, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=4)


# ---------------------------------------------------------------------------
# MySQL helpers
# ---------------------------------------------------------------------------

def _get_db_session():
    """Return a live SessionLocal or None."""
    try:
        from app.database import DB_AVAILABLE, SessionLocal
        if not DB_AVAILABLE or SessionLocal is None:
            return None
        return SessionLocal()
    except ImportError:
        return None


# ---- Offers ----------------------------------------------------------------

def _db_upsert_offer(offer: dict):
    db = _get_db_session()
    if db is None:
        return
    try:
        from app.database import OfferDB
        exists = db.query(OfferDB).filter_by(offer_id=offer["offer_id"]).first()
        if exists:
            exists.status = offer.get("status", exists.status)
            exists.price_inr = offer.get("price_inr", exists.price_inr)
        else:
            db.add(OfferDB(
                offer_id=offer["offer_id"],
                request_id=offer["request_id"],
                company_id=offer["company_id"],
                vehicle_id=offer["vehicle_id"],
                price_inr=offer["price_inr"],
                status=offer.get("status", "OFFERED"),
            ))
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("MySQL upsert offer failed: %s", exc)
    finally:
        db.close()


def _db_get_offers():
    db = _get_db_session()
    if db is None:
        return None
    try:
        from app.database import OfferDB
        rows = db.query(OfferDB).all()
        return [
            {
                "offer_id": r.offer_id,
                "request_id": r.request_id,
                "company_id": r.company_id,
                "vehicle_id": r.vehicle_id,
                "price_inr": float(r.price_inr),
                "status": r.status,
            }
            for r in rows
        ]
    except Exception as exc:
        logger.warning("MySQL get_offers failed: %s", exc)
        return None
    finally:
        db.close()


def _db_update_offer(offer_id: str, updates: dict):
    db = _get_db_session()
    if db is None:
        return None
    try:
        from app.database import OfferDB
        row = db.query(OfferDB).filter_by(offer_id=offer_id).first()
        if row:
            for k, v in updates.items():
                if hasattr(row, k):
                    setattr(row, k, v)
            db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("MySQL update_offer failed: %s", exc)
    finally:
        db.close()


# ---- Bookings --------------------------------------------------------------

def _db_upsert_booking(booking: dict):
    db = _get_db_session()
    if db is None:
        return
    try:
        from app.database import BookingDB
        exists = db.query(BookingDB).filter_by(
            booking_id=booking["booking_id"]
        ).first()
        if exists:
            exists.status = booking.get("status", exists.status)
        else:
            db.add(BookingDB(
                booking_id=booking["booking_id"],
                booking_number=booking["booking_number"],
                offer_id=booking["offer_id"],
                request_id=booking["request_id"],
                traveler_name=booking["traveler_name"],
                flight_id=booking["flight_id"],
                hotel_id=booking["hotel_id"],
                pickup=booking["pickup"],
                company_id=booking["company_id"],
                vehicle_id=booking["vehicle_id"],
                price_inr=booking["price_inr"],
                drive_minutes=booking["drive_minutes"],
                status=booking.get("status", "BOOKED"),
            ))
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("MySQL upsert booking failed: %s", exc)
    finally:
        db.close()


def _db_get_bookings():
    db = _get_db_session()
    if db is None:
        return None
    try:
        from app.database import BookingDB
        rows = db.query(BookingDB).all()
        return [
            {
                "booking_id": r.booking_id,
                "booking_number": r.booking_number,
                "offer_id": r.offer_id,
                "request_id": r.request_id,
                "traveler_name": r.traveler_name,
                "flight_id": r.flight_id,
                "hotel_id": r.hotel_id,
                "pickup": r.pickup,
                "company_id": r.company_id,
                "vehicle_id": r.vehicle_id,
                "price_inr": float(r.price_inr),
                "drive_minutes": r.drive_minutes,
                "status": r.status,
            }
            for r in rows
        ]
    except Exception as exc:
        logger.warning("MySQL get_bookings failed: %s", exc)
        return None
    finally:
        db.close()


def _db_update_booking(booking_id: str, updates: dict):
    db = _get_db_session()
    if db is None:
        return
    try:
        from app.database import BookingDB
        row = db.query(BookingDB).filter_by(booking_id=booking_id).first()
        if row:
            for k, v in updates.items():
                if hasattr(row, k):
                    setattr(row, k, v)
            db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("MySQL update_booking failed: %s", exc)
    finally:
        db.close()


# ---- Change Requests -------------------------------------------------------

def _db_upsert_change(change: dict):
    db = _get_db_session()
    if db is None:
        return
    try:
        from app.database import ChangeRequestDB
        exists = db.query(ChangeRequestDB).filter_by(
            change_id=change["change_id"]
        ).first()
        if exists:
            exists.status = change.get("status", exists.status)
        else:
            db.add(ChangeRequestDB(
                change_id=change["change_id"],
                booking_id=change["booking_id"],
                booking_number=change["booking_number"],
                company_id=change["company_id"],
                new_flight_id=change.get("new_flight_id"),
                new_pickup=change.get("new_pickup"),
                status=change.get("status", "WAITING"),
            ))
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("MySQL upsert change_request failed: %s", exc)
    finally:
        db.close()


def _db_get_change_requests():
    db = _get_db_session()
    if db is None:
        return None
    try:
        from app.database import ChangeRequestDB
        rows = db.query(ChangeRequestDB).all()
        return [
            {
                "change_id": r.change_id,
                "booking_id": r.booking_id,
                "booking_number": r.booking_number,
                "company_id": r.company_id,
                "new_flight_id": r.new_flight_id,
                "new_pickup": r.new_pickup,
                "status": r.status,
            }
            for r in rows
        ]
    except Exception as exc:
        logger.warning("MySQL get_change_requests failed: %s", exc)
        return None
    finally:
        db.close()


def _db_update_change(change_id: str, updates: dict):
    db = _get_db_session()
    if db is None:
        return
    try:
        from app.database import ChangeRequestDB
        row = db.query(ChangeRequestDB).filter_by(change_id=change_id).first()
        if row:
            for k, v in updates.items():
                if hasattr(row, k):
                    setattr(row, k, v)
            db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("MySQL update_change_request failed: %s", exc)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Public API — ORIGINAL SIGNATURES PRESERVED
# ---------------------------------------------------------------------------

def get_all():
    return _load()


def get_offers():
    result = _db_get_offers()
    if result is not None:
        return result
    return _load()["offers"]


def get_bookings():
    result = _db_get_bookings()
    if result is not None:
        return result
    return _load()["bookings"]


def get_change_requests():
    result = _db_get_change_requests()
    if result is not None:
        return result
    return _load()["change_requests"]


def add_offer(offer):
    data = _load()
    data["offers"].append(offer)
    _save(data)
    _db_upsert_offer(offer)
    return offer


def update_offer(offer_id, updates):
    data = _load()
    updated = None
    for offer in data["offers"]:
        if offer["offer_id"] == offer_id:
            offer.update(updates)
            updated = offer
            break
    if updated:
        _save(data)
        _db_update_offer(offer_id, updates)
    return updated


def add_booking(booking):
    data = _load()
    data["bookings"].append(booking)
    _save(data)
    _db_upsert_booking(booking)
    return booking


def update_booking(booking_id, updates):
    data = _load()
    updated = None
    for booking in data["bookings"]:
        if booking["booking_id"] == booking_id:
            booking.update(updates)
            updated = booking
            break
    if updated:
        _save(data)
        _db_update_booking(booking_id, updates)
    return updated


def add_change_request(change_request):
    data = _load()
    data["change_requests"].append(change_request)
    _save(data)
    _db_upsert_change(change_request)
    return change_request


def update_change_request(change_id, updates):
    data = _load()
    updated = None
    for change in data["change_requests"]:
        if change["change_id"] == change_id:
            change.update(updates)
            updated = change
            break
    if updated:
        _save(data)
        _db_update_change(change_id, updates)
    return updated


# ---------------------------------------------------------------------------
# Startup sync
# ---------------------------------------------------------------------------

def sync_file_to_db():
    """Import file-based workflow data into MySQL (called on startup)."""
    try:
        from app.database import DB_AVAILABLE
        if not DB_AVAILABLE:
            return
        data = _load()
        for offer in data.get("offers", []):
            _db_upsert_offer(offer)
        for booking in data.get("bookings", []):
            _db_upsert_booking(booking)
        for change in data.get("change_requests", []):
            _db_upsert_change(change)
        logger.info(
            "sync_file_to_db: synced %d offers, %d bookings, %d changes",
            len(data.get("offers", [])),
            len(data.get("bookings", [])),
            len(data.get("change_requests", [])),
        )
    except Exception as exc:
        logger.warning("workflow sync_file_to_db failed: %s", exc)
