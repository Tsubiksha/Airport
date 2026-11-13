
import json
from pathlib import Path

# Find the backend directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Dataset directories
CATALOG_DIR = BASE_DIR / "data" / "catalog"
PROBLEM_DIR = BASE_DIR / "data" / "problem-2"


def load_json(file_path: Path):
    """Read a JSON file and return its contents."""

    if not file_path.exists():
        raise FileNotFoundError(
            f"Dataset file not found: {file_path}"
        )

    with open(file_path, "r", encoding="utf-8") as file:
        return json.load(file)


def load_list(file_path: Path):
    """Read a JSON file that should contain a list."""

    data = load_json(file_path)

    if not isinstance(data, list):
        raise ValueError(
            f"Expected a JSON list in {file_path.name}"
        )

    return data


def get_airports():
    return load_list(CATALOG_DIR / "airports.json")


def get_flights():
    return load_list(CATALOG_DIR / "flights.json")


def get_hotels():
    return load_list(CATALOG_DIR / "hotels.json")


def get_suppliers():
    return load_list(PROBLEM_DIR / "taxi_companies.json")


def get_routes():
    return load_list(PROBLEM_DIR / "routes.json")


def get_booked_rides():
    return load_list(PROBLEM_DIR / "booked_rides.json")


def get_open_requests():
    return load_list(PROBLEM_DIR / "open_requests.json")
