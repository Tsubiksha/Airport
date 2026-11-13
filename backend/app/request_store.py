"""
request_store.py - Dual-write (file + MySQL) for ride requests.
Keeps the original get_requests / save_request signatures intact.
"""

import json
import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
REQUEST_FILE = STORAGE_DIR / "requests.json"


# ---------------------------------------------------------------------------
# File helpers (original behaviour, unchanged)
# ---------------------------------------------------------------------------

def _file_get_requests():
    STORAGE_DIR.mkdir(exist_ok=True)
    if not REQUEST_FILE.exists():
        REQUEST_FILE.write_text("[]", encoding="utf-8")
    with open(REQUEST_FILE, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _file_save_request(new_request):
    requests = _file_get_requests()
    requests.append(new_request)
    with open(REQUEST_FILE, "w", encoding="utf-8") as fh:
        json.dump(requests, fh, indent=4)


# ---------------------------------------------------------------------------
# MySQL helpers
# ---------------------------------------------------------------------------

def _db_upsert_request(req: dict):
    """Insert or ignore a request into MySQL."""
    try:
        from app.database import DB_AVAILABLE, SessionLocal
        from app.database import RideRequestDB
        if not DB_AVAILABLE or SessionLocal is None:
            return
        db = SessionLocal()
        try:
            exists = db.query(RideRequestDB).filter_by(
                request_id=req["request_id"]
            ).first()
            if exists:
                return
            row = RideRequestDB(
                request_id=req["request_id"],
                traveler_name=req.get("traveler_name", ""),
                flight_id=req.get("flight_id", ""),
                hotel_id=req.get("hotel_id", ""),
                airport=req.get("airport", ""),
                adults=req.get("adults", 0),
                child_ages=json.dumps(req.get("child_ages", [])),
                large_bags=req.get("large_bags", 0),
                small_bags=req.get("small_bags", 0),
                pickup=req.get("pickup", ""),
                car_type=req.get("car_type"),
                price_inr=req.get("price_inr", 0),
                status=req.get("status", "OPEN"),
            )
            db.add(row)
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.warning("MySQL upsert request failed: %s", exc)
        finally:
            db.close()
    except ImportError:
        pass


def _db_get_requests():
    """Fetch all requests from MySQL in descending ID order (newest first)."""
    try:
        from app.database import DB_AVAILABLE, SessionLocal
        from app.database import RideRequestDB
        if not DB_AVAILABLE or SessionLocal is None:
            return None
        db = SessionLocal()
        try:
            rows = db.query(RideRequestDB).order_by(RideRequestDB.id.desc()).all()
            result = []
            for r in rows:
                result.append({
                    "request_id": r.request_id,
                    "traveler_name": r.traveler_name,
                    "flight_id": r.flight_id,
                    "hotel_id": r.hotel_id,
                    "airport": r.airport,
                    "adults": r.adults,
                    "child_ages": json.loads(r.child_ages) if r.child_ages else [],
                    "large_bags": r.large_bags,
                    "small_bags": r.small_bags,
                    "pickup": r.pickup,
                    "car_type": r.car_type,
                    "price_inr": float(r.price_inr),
                    "status": r.status,
                })
            return result
        except Exception as exc:
            logger.warning("MySQL get_requests failed: %s", exc)
            return None
        finally:
            db.close()
    except ImportError:
        return None


# ---------------------------------------------------------------------------
# Public API (unchanged signatures)
# ---------------------------------------------------------------------------

def get_requests():
    """Return all saved ride requests (prefers MySQL, falls back to file)."""
    db_result = _db_get_requests()
    if db_result is not None:
        return db_result
    return _file_get_requests()


def save_request(new_request):
    """Save a new ride request to file first, then MySQL."""
    _file_save_request(new_request)
    _db_upsert_request(new_request)


def update_request(request_id, updates):
    """Update a request in both file and MySQL."""
    # 1. Update file
    file_requests = _file_get_requests()
    for req in file_requests:
        if req.get("request_id") == request_id:
            req.update(updates)
            STORAGE_DIR.mkdir(exist_ok=True)
            with open(REQUEST_FILE, "w", encoding="utf-8") as fh:
                json.dump(file_requests, fh, indent=4)
            break

    # 2. Update MySQL
    try:
        from app.database import DB_AVAILABLE, SessionLocal, RideRequestDB
        if DB_AVAILABLE and SessionLocal is not None:
            db = SessionLocal()
            try:
                row = db.query(RideRequestDB).filter_by(request_id=request_id).first()
                if row:
                    if "status" in updates:
                        row.status = updates["status"]
                    db.commit()
            except Exception as exc:
                db.rollback()
                logger.warning("MySQL update_request failed: %s", exc)
            finally:
                db.close()
    except Exception as exc:
        logger.warning("update_request error: %s", exc)


# ---------------------------------------------------------------------------
# Startup sync
# ---------------------------------------------------------------------------

def sync_file_to_db():
    """Import initial open_requests from organizer data and any storage/requests.json into MySQL."""
    try:
        from app.database import DB_AVAILABLE
        if not DB_AVAILABLE:
            return
        
        # 1. Sync organizer's initial open_requests (exactly once, idempotent)
        from app import data_loader
        flights = {f["flight_id"]: f["to"] for f in data_loader.get_flights()}
        for open_req in data_loader.get_open_requests():
            req_copy = dict(open_req)
            if not req_copy.get("airport"):
                req_copy["airport"] = flights.get(req_copy.get("flight_id"), "")
            req_copy.setdefault("status", "OPEN")
            _db_upsert_request(req_copy)

        # 2. Sync dynamically saved file requests
        file_requests = _file_get_requests()
        for req in file_requests:
            _db_upsert_request(req)
        logger.info("sync_file_to_db: successfully synced organizer and saved requests to MySQL")
    except Exception as exc:
        logger.warning("sync_file_to_db failed: %s", exc)
