import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
REQUEST_FILE = STORAGE_DIR / "requests.json"


def get_requests():
    STORAGE_DIR.mkdir(exist_ok=True)

    if not REQUEST_FILE.exists():
        REQUEST_FILE.write_text("[]", encoding="utf-8")

    with open(REQUEST_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


def save_request(new_request):
    requests = get_requests()

    requests.append(new_request)

    with open(REQUEST_FILE, "w", encoding="utf-8") as file:
        json.dump(requests, file, indent=4)