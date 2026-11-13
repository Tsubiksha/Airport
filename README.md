# RidePort — Airport Taxi Ride Offers Platform

[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0-red?logo=sqlalchemy&logoColor=white)](https://www.sqlalchemy.org)
[![Tests](https://img.shields.io/badge/Tests-45%2F45%20Passed-brightgreen)](tests/)

RidePort is an end-to-end, multi-sided marketplace connecting air travelers arriving at international airports with verified local taxi suppliers. It automates trip validation, dynamic price boundaries, vehicle capacity checks, fleet availability intervals, offer dispatching, instant 10-digit booking generation, and post-booking itinerary change negotiations.

---

## 1. Project Overview

Airport taxi coordination is notoriously fragmented: travelers face opaque pricing, language hurdles, and uncertainty regarding vehicle capacity for luggage and family members. On the supply side, fleet dispatchers juggle unpredictable flight arrivals, strict driver shifts, and overlapping ride schedules.

**RidePort** resolves these pain points through a structured two-sided web platform:
- **Travelers** submit validated ride requests specifying landing flights, destination hotels, exact passenger counts (adults and children with individual ages), and luggage (large and small bags). They propose their budget within official regulatory fare bands and choose among competitive bids from certified local suppliers.
- **Suppliers** operate a real-time dispatch dashboard displaying passenger requests strictly matched to their licensed airport coverage, municipal service areas, operating shifts, and vehicle specifications. Dispatchers bid using idle fleet inventory.
- **Platform** guarantees strict business rule enforcement (Rules R1–R9), guarantees zero double-bookings via automated round-trip buffer math, issues cryptographic 10-digit booking references, and provides automated change request arbitration.

---

## 2. Problem Statement and Objectives

The hackathon challenge mandates an integrated platform satisfying nine core operational invariants:
1. **Catalog Integrity (R1)**: Ride requests must reference verified flight and hotel catalog entities, confirming that the destination hotel's city is served by the flight's arrival airport.
2. **Buffer Time Invariant (R2)**: Scheduled pickup must be at least 60 minutes after local landing time.
3. **Regulatory Price Bounds (R3)**: Traveler and supplier prices must strictly adhere to the official route-specific minimum and maximum INR boundaries.
4. **Supplier Eligibility (R4)**: Suppliers are only eligible if their licensed airports, destination sectors, and daily operating hours encompass the trip.
5. **Physical Capacity (R5)**: Total passengers (adults + children) cannot exceed vehicle passenger seats; large and small luggage counts cannot exceed dedicated cargo capacities. Requested car types (e.g., SEDAN, SUV, HATCHBACK, BUS) must be strictly respected.
6. **Time-Space Fleet Availability (R6)**: Vehicles become unavailable during `[pickup, pickup + (2 × drive_minutes)]`. Overlapping intervals against both pre-existing organizer bookings and newly confirmed bookings are strictly prohibited.
7. **Fleet Ownership & Price Enforcement (R7)**: Suppliers can only assign their own registered vehicles and submit bids conforming to route pricing.
8. **Atomic Booking Selection (R8)**: Acceptance of one offer atomically confirms the trip, generates a unique 10-digit booking code, marks competing offers as `NOT_CHOSEN`, and commits the vehicle busy window.
9. **Negotiated Flight & Time Modifications (R9)**: Travelers can request new arrival flights or pickup times. Suppliers evaluate fleet feasibility; accepted changes update booking parameters while preserving change history, whereas rejected changes retain original reservations.

---

## 3. Features

### Traveler Features
- **Flight & Hotel Search**: Instant search over catalog flights with airport arrival times, airlines, and destinations.
- **Luggage & Child Age Configurator**: Dynamic inputs for luggage (large suitcases and small backpacks) and individual child ages (0–17).
- **Official Route Fare Indicator**: Real-time retrieval of official min and max INR rates based on airport and destination zones.
- **Multi-Supplier Bid Comparison**: View all offers with vehicle types, capacities, ratings, and prices. Sort by price and filter by vehicle class.
- **One-Click Confirmation & Rejection**: Accept preferred rides or dismiss unwanted quotes.
- **10-Digit Booking Lookup**: Instant itinerary status lookup using the 10-digit reference number.
- **Change Request Submission**: Propose new flights or pickup adjustments directly to the supplier.

### Supplier Features
- **Zero-Login Fleet Console**: Instant access to registered supplier dispatch sessions (e.g., Sakura Cabs, Tokyo Star Taxi, Falcon Transfers).
- **Smart Dispatch Matcher**: Shows only trips matching company airports, operating hours, and destination permits.
- **Vehicle Assignment Interface**: Select available vehicles meeting physical capacity requirements and input compliant prices.
- **Offer Lifecycle Tracker**: Monitor offers in `OFFERED`, `BOOKED`, `REJECTED`, and `NOT_CHOSEN` states.
- **Change Request Adjudication**: Review traveler change proposals with automated route recalculation and accept or reject with one click.

### Database & Persistence Features
- **MySQL 8.x + SQLAlchemy 2.x**: Relational persistence for ride requests, offers, bookings, and change requests.
- **Alembic Migrations**: Version-controlled database schema management.
- **Dual-Write Architecture with Graceful Fallback**: High-availability data store that writes to MySQL while maintaining local JSON storage fallback.
- **Idempotent Catalog Seeding**: Imports initial organizer data exactly once without duplicate insertions across restarts.

---

## 4. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend Framework** | Next.js 14 (App Router) | Server-rendered pages and interactive client components |
| **Frontend Language** | JavaScript (ES6+ / React 18) | Clean vanilla React implementation (no TypeScript) |
| **Frontend Styling** | Modern CSS & CSS Modules | Responsive, travel-booking design with navy/blue palette |
| **Backend Framework** | FastAPI (Python 3.11) | High-performance asynchronous REST API with OpenAPI Swagger |
| **Validation Layer** | Pydantic v2 | Strict request payload validation |
| **ORM & Database** | SQLAlchemy 2.x & MySQL 8.x | Relational mapping, constraints, transactions |
| **Database Driver** | PyMySQL | Pure-Python MySQL client driver with `utf8mb4` |
| **Database Migrations** | Alembic | Automatic schema tracking and migrations |
| **Test Suite** | Pytest 9 & HTTPX | Automated test runner verifying 45 judge edge cases |

---

## 5. System Architecture

```mermaid
flowchart TD
    subgraph Client["Frontend (Next.js 14 - Port 3000)"]
        UI_Home["Landing Page (/)"]
        UI_Traveler["Booking Wizard (/traveler)"]
        UI_Lookup["Booking Lookup (/lookup)"]
        UI_Change["Change Requests (/change)"]
        UI_Supplier["Supplier Dashboard (/supplier)"]
        API_Client["Centralized Fetch Client (lib/api.js)"]
    end

    subgraph Server["Backend (FastAPI - Port 8000)"]
        Router["REST Router (app/main.py)"]
        R1_R3["Request & Route Validation"]
        R4_R6["Matching & Availability Services"]
        R7_R9["Assignment, Booking & Change Services"]
    end

    subgraph DataLayer["Persistence Layer"]
        ORM["SQLAlchemy 2.x Models (app/database.py)"]
        Alembic["Alembic Migrations"]
        MySQL[("MySQL 8.x Database (rideport)")]
        FileStore["Dual-Write JSON Fallback (storage/)"]
        ReadOnlyJSON["Immutable Organizer Catalogs (data/)"]
    end

    UI_Home --> API_Client
    UI_Traveler --> API_Client
    UI_Lookup --> API_Client
    UI_Change --> API_Client
    UI_Supplier --> API_Client

    API_Client -->|HTTP / JSON| Router
    Router --> R1_R3
    Router --> R4_R6
    Router --> R7_R9

    R1_R3 --> ReadOnlyJSON
    R4_R6 --> ReadOnlyJSON
    R4_R6 --> ORM

    R7_R9 --> ORM
    ORM --> MySQL
    ORM -.-> FileStore
```

---

## 6. Application Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Traveler
    participant Frontend as Next.js Web App
    participant Backend as FastAPI Backend
    participant DB as MySQL (rideport)
    actor Supplier

    Traveler->>Frontend: Select Flight & Hotel, Enter Passengers & Budget
    Frontend->>Backend: POST /api/requests (Rule R1–R3 Validation)
    Backend->>DB: Store RideRequest (status: OPEN)
    Backend-->>Frontend: 200 OK (request_id)

    Supplier->>Frontend: Open Supplier Portal & Select Company
    Frontend->>Backend: GET /api/suppliers/{company_id}/requests
    Backend->>Backend: Filter Eligible Requests (Rule R4–R6)
    Backend-->>Frontend: Display Eligible Requests with Available Fleet

    Supplier->>Frontend: Assign Vehicle & Set Price
    Frontend->>Backend: POST /api/suppliers/{company_id}/requests/{request_id}/offers
    Backend->>DB: Save Offer (Rule R7, status: OFFERED)
    Backend-->>Frontend: 200 OK (offer_id)

    Traveler->>Frontend: View Supplier Offers
    Frontend->>Backend: GET /api/requests/{request_id}/offers
    Backend-->>Frontend: List of Active Quotes

    Traveler->>Frontend: Click "Book Taxi"
    Frontend->>Backend: POST /api/offers/{offer_id}/book
    Backend->>Backend: Recheck Vehicle Availability
    Backend->>DB: Generate 10-Digit Booking, Set other offers NOT_CHOSEN
    Backend-->>Frontend: 200 OK (10-Digit Booking Summary)

    Traveler->>Frontend: Submit Itinerary Change
    Frontend->>Backend: POST /api/bookings/{number}/change-requests
    Backend->>DB: Store ChangeRequest (status: WAITING)

    Supplier->>Frontend: View Change Requests & Click Accept/Reject
    Frontend->>Backend: POST /api/change-requests/{id}/decision
    Backend->>DB: Update Booking (if ACCEPTED) or Retain Original
    Backend-->>Frontend: 200 OK (Decision Applied)
```

---

## 7. Project Folder Structure

```
Airport/
├── backend/
│   ├── alembic/                      # Alembic database migration scripts
│   │   ├── versions/                 # Version migration files
│   │   │   └── 30c076f92e8d_initial_schema.py
│   │   ├── env.py                    # Alembic environment configuration
│   │   └── script.py.mako
│   ├── alembic.ini                   # Alembic configuration file
│   ├── app/
│   │   ├── __init__.py
│   │   ├── assignment_service.py     # R7: Vehicle assignment logic
│   │   ├── availability_service.py   # R6: Vehicle availability & interval math
│   │   ├── booking_service.py        # R8: Booking confirmation & 10-digit generation
│   │   ├── change_service.py         # R9: Change request validation & decision
│   │   ├── database.py               # SQLAlchemy models & MySQL session manager
│   │   ├── data_loader.py            # Read-only catalog loaders (data/)
│   │   ├── main.py                   # FastAPI REST API endpoints & CORS
│   │   ├── matching_service.py       # R4-R5: Supplier & capacity matching
│   │   ├── request_store.py          # Dual-write request storage (MySQL + file)
│   │   ├── schemas.py                # Pydantic validation schemas
│   │   └── workflow_store.py         # Dual-write workflow storage (MySQL + file)
│   ├── data/                         # Read-only organizer datasets
│   │   ├── catalog/
│   │   │   ├── airports.json
│   │   │   ├── flights.json
│   │   │   └── hotels.json
│   │   └── problem-2/
│   │       ├── booked_rides.json
│   │       ├── open_requests.json
│   │       ├── routes.json
│   │       └── taxi_companies.json
│   ├── storage/                      # File persistence fallback
│   │   ├── requests.json
│   │   └── workflow.json
│   ├── tests/                        # 45 Pytest edge-case tests
│   │   ├── __init__.py
│   │   ├── conftest.py               # Shared test client and fixtures
│   │   ├── test_changes.py           # Tests 35–40: Change requests (R9)
│   │   ├── test_offers_and_bookings.py# Tests 22–34: Assignment & Booking (R6-R8)
│   │   ├── test_persistence_advanced.py# Tests 41–45: MySQL & restart persistence
│   │   ├── test_requests.py          # Tests 1–14: Request validation (R1-R3)
│   │   └── test_suppliers.py         # Tests 15–21: Supplier matching (R4-R5)
│   ├── .env                          # Local database environment variables
│   ├── .env.example                  # Template for database configuration
│   └── requirements.txt              # Python package dependencies
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── change/
│   │   │   │   └── page.js           # Change request proposal UI
│   │   │   ├── lookup/
│   │   │   │   └── page.js           # 10-digit booking lookup UI
│   │   │   ├── supplier/
│   │   │   │   └── page.js           # Supplier dispatch operations portal
│   │   │   ├── traveler/
│   │   │   │   └── page.js           # 7-step traveler booking wizard
│   │   │   ├── globals.css           # Premium travel styling & design system
│   │   │   ├── layout.js             # Root layout with navbar & footer
│   │   │   └── page.js               # Landing page with hero & CTAs
│   │   └── lib/
│   │       └── api.js                # Centralized backend HTTP client
│   ├── .env.example                  # Frontend environment template
│   ├── .env.local                    # Frontend local environment config
│   ├── next.config.js                # Next.js configuration
│   └── package.json                  # Frontend dependencies and scripts
├── .gitignore                        # Git exclusion rules
└── README.md                         # Complete project documentation
```

---

## 8. Prerequisites

Ensure the following tools are installed on your machine:
- **Python**: Version 3.11 or higher
- **Node.js**: Version 18.x, 20.x, or 24.x
- **npm**: Version 9.x or higher
- **MySQL Server**: Version 8.0 or compatible
- **Git**: Version 2.x

---

## 9. Installation

### 1. Clone the repository
```bash
git clone <repository-url>
cd Airport
```

### 2. Backend Setup
```powershell
# Navigate to backend directory
cd backend

# Create Python virtual environment
python -m venv venv

# Activate virtual environment (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# Install backend dependencies
pip install -r requirements.txt
```

### 3. Frontend Setup
```powershell
# Navigate to frontend directory
cd ..\frontend

# Install frontend dependencies
npm install --no-audit --no-fund
```

---

## 10. MySQL Configuration

### 1. Ensure MySQL Server is Running
Open Windows Services (`services.msc`) and verify that `MySQL80` (or your local MySQL service) is **Running**.

### 2. Configure Database Credentials
Create `backend/.env` (already prepared for default local setups):
```ini
DATABASE_URL=mysql+pymysql://root:123456@localhost:3306/rideport?charset=utf8mb4
```

### 3. Verify Database Creation
In MySQL CLI or MySQL Workbench:
```sql
CREATE DATABASE IF NOT EXISTS rideport CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. Run Alembic Database Migrations
From the `backend` directory with the virtual environment activated:
```powershell
alembic upgrade head
```

---

## 11. Running the Application

### 1. Start the FastAPI Backend
Open a PowerShell terminal:
```powershell
cd c:\Users\Subiksha\OneDrive\Desktop\Airport\backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- **Backend API**: `http://localhost:8000`
- **Swagger Documentation**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/api/health`

### 2. Start the Next.js Frontend
Open a second PowerShell terminal:
```powershell
cd c:\Users\Subiksha\OneDrive\Desktop\Airport\frontend
npm run dev
```
- **Traveler & Supplier Web Portal**: `http://localhost:3000`

---

## 12. API Documentation

### Catalog Endpoints
- **`GET /api/catalog/airports`**: List supported airports.
- **`GET /api/catalog/flights`**: List all catalog flights.
- **`GET /api/catalog/flights/{flight_id}`**: Get specific flight details.
- **`GET /api/catalog/hotels`**: List all catalog hotels.
- **`GET /api/catalog/hotels/{hotel_id}`**: Get specific hotel details.
- **`GET /api/suppliers`**: List all registered taxi companies and fleets.
- **`GET /api/routes?airport={code}&city={city}&area={area}`**: Retrieve official distance, drive time, and INR price bounds.

### Request Endpoints
- **`GET /api/requests`**: Retrieve all submitted and open requests.
- **`POST /api/requests`**: Submit a new ride request (enforces R1–R3).
  - *Request Body*:
    ```json
    {
      "traveler_name": "Menon Family",
      "flight_id": "FL-401",
      "hotel_id": "HTL-TYO-004",
      "adults": 2,
      "child_ages": [6],
      "large_bags": 3,
      "small_bags": 2,
      "pickup": "2027-04-10T11:30:00",
      "car_type": null,
      "price_inr": 12000.0
    }
    ```
- **`GET /api/requests/{request_id}/eligible-suppliers`**: Evaluate eligible suppliers and suitable vehicles for a request (enforces R4–R6).
- **`GET /api/requests/{request_id}/offers`**: List all quotes submitted for a request.

### Supplier & Offer Endpoints
- **`GET /api/suppliers/{company_id}/requests`**: List requests matching supplier credentials with available vehicles.
- **`POST /api/suppliers/{company_id}/requests/{request_id}/offers`**: Assign a vehicle and submit a quote (enforces R7).
  - *Request Body*: `{"vehicle_id": "SC-3", "price_inr": 12500}`
- **`GET /api/suppliers/{company_id}/offers`**: View all quotes submitted by a specific supplier.
- **`POST /api/offers/{offer_id}/book`**: Atomically book an offer, generate 10-digit number, lock vehicle (enforces R8).
- **`POST /api/offers/{offer_id}/reject`**: Mark an offer as rejected.

### Booking & Change Request Endpoints
- **`GET /api/bookings/{booking_number}`**: Retrieve complete booking itinerary by 10-digit number.
- **`POST /api/bookings/{booking_number}/change-requests`**: Propose modified flight or pickup time (enforces R9).
  - *Request Body*: `{"new_pickup": "2027-04-10T14:30:00"}`
- **`GET /api/suppliers/{company_id}/change-requests`**: View change proposals for supplier's bookings.
- **`POST /api/change-requests/{change_id}/decision`**: Accept or reject a change request.
  - *Request Body*: `{"decision": "ACCEPTED"}`

---

## 13. Database Schema

```mermaid
erDiagram
    RIDE_REQUESTS ||--o{ OFFERS : receives
    OFFERS ||--o| BOOKINGS : confirmed_as
    BOOKINGS ||--o{ CHANGE_REQUESTS : modifies

    RIDE_REQUESTS {
        int id PK
        string request_id UK
        string traveler_name
        string flight_id
        string hotel_id
        string airport
        int adults
        text child_ages
        int large_bags
        int small_bags
        string pickup
        string car_type
        decimal price_inr
        string status
        datetime created_at
        datetime updated_at
    }

    OFFERS {
        int id PK
        string offer_id UK
        string request_id FK
        string company_id
        string vehicle_id
        decimal price_inr
        string status
        datetime created_at
        datetime updated_at
    }

    BOOKINGS {
        int id PK
        string booking_id UK
        string booking_number UK
        string offer_id FK
        string request_id FK
        string traveler_name
        string flight_id
        string hotel_id
        string pickup
        string company_id
        string vehicle_id
        decimal price_inr
        int drive_minutes
        string status
        datetime created_at
        datetime updated_at
    }

    CHANGE_REQUESTS {
        int id PK
        string change_id UK
        string booking_id FK
        string booking_number
        string company_id
        string new_flight_id
        string new_pickup
        string status
        datetime created_at
        datetime updated_at
    }
```

---

## 14. Business Rules Reference (R1–R9)

- **R1 (Request Validation)**: Flights and hotels must exist in the catalog. The flight's arrival airport must serve the hotel's city. Adults count must be $\ge 1$. Children ages must fall in range $0 \le \text{age} \le 17$.
- **R2 (Pickup Buffer Time)**: Pickup timestamp must be $\ge \text{Flight Landing Time} + 60\text{ minutes}$.
- **R3 (Price Bounds)**: Price must strictly satisfy $\text{Route Min INR} \le \text{Price} \le \text{Route Max INR}$.
- **R4 (Supplier Eligibility)**: Evaluates airport coverage, hotel district permissions, and 24h operational shift windows.
- **R5 (Vehicle Capacity)**: Validates physical seats against adults plus children, and luggage counts against vehicle cargo limits.
- **R6 (Fleet Availability)**: Vehicle busy interval is computed as $[\text{pickup}, \text{pickup} + 2 \times \text{drive\_minutes}]$. Overlaps with organizer rides or existing bookings are blocked. Touching endpoints are permitted.
- **R7 (Vehicle Assignment)**: Dispatchers can only assign vehicles from their own fleet.
- **R8 (Atomic Booking)**: Re-validates vehicle availability at confirmation time. Generates a unique 10-digit numeric booking reference. Transitions chosen offer to `BOOKED` and competing quotes to `NOT_CHOSEN`.
- **R9 (Change Requests)**: Validates new flight compatibility and pickup buffer time. Ensures fleet availability at the new window before applying changes. Preserves complete historical records.

---

## 15. Testing & Verification

The test suite covers all 45 specified edge cases using `pytest` and `httpx`.

### Running Tests
```powershell
cd backend
$env:PYTHONPATH="."
.\venv\Scripts\python.exe -m pytest tests -v --tb=short
```

### Test Results Summary: 45 / 45 Passed (100%)

| Test Case | Description | Rule | Status |
|---|---|---|---|
| `test_01` | Valid ride request submission | R1–R3 | **PASS** |
| `test_02` | Invalid flight ID returns 404 | R1 | **PASS** |
| `test_03` | Invalid hotel ID returns 404 | R1 | **PASS** |
| `test_04` | Incompatible airport and hotel city returns 400 | R1 | **PASS** |
| `test_05` | Zero adults returns 422 validation error | R1 | **PASS** |
| `test_06` | Negative child age returns 400 | R1 | **PASS** |
| `test_07` | Child age 17 accepted | R1 | **PASS** |
| `test_08` | Child age 18 rejected with 400 | R1 | **PASS** |
| `test_09` | Pickup exactly 60 minutes after landing accepted | R2 | **PASS** |
| `test_10` | Pickup 59 minutes after landing rejected with 400 | R2 | **PASS** |
| `test_11` | Price exactly at minimum accepted | R3 | **PASS** |
| `test_12` | Price exactly at maximum accepted | R3 | **PASS** |
| `test_13` | Price below minimum rejected with 400 | R3 | **PASS** |
| `test_14` | Price above maximum rejected with 400 | R3 | **PASS** |
| `test_15` | Supplier without airport coverage excluded | R4 | **PASS** |
| `test_16` | Supplier without destination area excluded | R4 | **PASS** |
| `test_17` | Supplier outside operating hours excluded | R4 | **PASS** |
| `test_18` | Vehicle with insufficient seats rejected | R5 | **PASS** |
| `test_19` | Vehicle with insufficient large bags rejected | R5 | **PASS** |
| `test_20` | Vehicle with insufficient small bags rejected | R5 | **PASS** |
| `test_21` | Vehicle not matching requested car type rejected | R5 | **PASS** |
| `test_22` | Car occupied by organizer booking blocked | R6 | **PASS** |
| `test_23` | Overlapping busy interval calculation verified | R6 | **PASS** |
| `test_24` | Non-overlapping intervals permitted | R6 | **PASS** |
| `test_25` | Assigning another supplier's vehicle rejected | R7 | **PASS** |
| `test_26` | Supplier price outside route range rejected | R7 | **PASS** |
| `test_27` | Valid assignment creates OFFERED quote | R7 | **PASS** |
| `test_28` | Booking valid offer creates 10-digit booking | R8 | **PASS** |
| `test_29` | Booking rejected offer rejected with 400 | R8 | **PASS** |
| `test_30` | Booking NOT_CHOSEN offer rejected with 400 | R8 | **PASS** |
| `test_31` | Booking already occupied vehicle prevented | R8 | **PASS** |
| `test_32` | 10-digit booking number uniqueness verified | R8 | **PASS** |
| `test_33` | Valid 10-digit booking lookup returns trip summary | R8 | **PASS** |
| `test_34` | Invalid booking lookup returns 404 / 400 | R8 | **PASS** |
| `test_35` | Valid change request created in WAITING state | R9 | **PASS** |
| `test_36` | Pickup change < 60 min after landing rejected | R9 | **PASS** |
| `test_37` | Vehicle unavailable at proposed time blocked | R9 | **PASS** |
| `test_38` | Supplier can reject change request | R9 | **PASS** |
| `test_39` | Rejected change preserves original booking | R9 | **PASS** |
| `test_40` | Accepted change updates booking time & duration | R9 | **PASS** |
| `test_41` | Booking survives server restart in MySQL | DB | **PASS** |
| `test_42` | Ride request persists in MySQL across sessions | DB | **PASS** |
| `test_43` | Initial open requests do not duplicate on restart | DB | **PASS** |
| `test_44` | Multiple suppliers can quote on one request | Flow | **PASS** |
| `test_45` | Supplier can quote multiple vehicles per request | Flow | **PASS** |

---

## 16. Hackathon Live Demo Script (Menon Family Scenario)

**Time allocation: 10–12 minutes**

### Part 1: Traveler Request (3 mins)
1. Open `http://localhost:3000` and click **"Book a Ride"**.
2. **Step 1 (Flight)**: Select Flight `FL-401` (AirVeda, BLR → NRT, Landing: 10:30 AM).
3. **Step 2 (Hotel)**: Select `HTL-TYO-004` (Ueno Garden Inn, Tokyo Ueno).
4. **Step 3 (Passengers)**:
   - Traveler Name: **Menon Family**
   - Adults: `2`, Children: `1` (Age: `6`)
   - Large Bags: `3`, Small Bags: `2`
   - Pickup Time: `2027-04-10T11:30:00` (exactly 60 mins after landing).
5. **Step 4 (Price)**: Notice official route range (`INR 10,200 – 16,800`). Enter budget: `INR 12,000`.
6. **Step 5 (Submit)**: Submit request and note generated `REQ-XXXXXXXX`.

### Part 2: Supplier Dispatch Operations (3 mins)
1. Open a new tab at `http://localhost:3000/supplier`.
2. Select **Sakura Cabs** (`TX-JP-01`).
3. Click on **"Eligible Requests"**. Notice Menon Family request appears.
4. Try assigning vehicle `SC-1` (Sedan, 2 large bags): backend rejects due to insufficient cargo space (Menon family has 3 large bags).
5. Try assigning vehicle `SC-2` (SUV, 4 large bags): backend rejects because `SC-2` is busy with `RIDE-0001` until 14:00.
6. Select vehicle `SC-3` (SUV, 6 seats, 4 large bags, available). Enter price `INR 12,500` and click **"Submit Offer"**.

### Part 3: Traveler Booking (2 mins)
1. Switch back to the Traveler tab and click **"View Taxi Offers"**.
2. Review the bid from Sakura Cabs with SUV vehicle `SC-3`.
3. Click **"Book Taxi"**.
4. Confirm instant booking generation with the prominent **10-digit booking reference** (e.g. `9252197126`). Click "Copy Booking Number".

### Part 4: Booking Lookup & Change Request (3 mins)
1. Navigate to `http://localhost:3000/lookup`.
2. Paste the 10-digit booking reference and click **"Track"**. View complete trip breakdown.
3. Click **"Request Flight/Pickup Change"**.
4. Propose a new pickup time `2027-04-10T14:30:00` and submit.
5. In the Supplier tab under **"Change Requests"**, view the pending proposal and click **"Accept Change"**.
6. Refresh the traveler tracking page to see the updated pickup time confirmed.

---

## 17. Environment Variables

### Backend Configuration (`backend/.env`)
| Variable | Description | Default / Example |
|---|---|---|
| `DATABASE_URL` | MySQL connection string via PyMySQL | `mysql+pymysql://root:123456@localhost:3306/rideport?charset=utf8mb4` |

### Frontend Configuration (`frontend/.env.local`)
| Variable | Description | Default / Example |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | URL of the running FastAPI backend | `http://localhost:8000` |

---

## 18. Security and Data Integrity
- **No Secrets in Source**: Passwords and connection strings are loaded exclusively via environment variables.
- **Strict Pydantic Boundaries**: All input fields undergo strong type checks and boundary validation.
- **Relational Integrity**: Foreign keys and unique constraints in MySQL prevent orphaned records and double allocation.
- **Zero Double-Bookings**: Rechecked immediately before booking commit to guarantee time-space mutual exclusivity.

---

## 19. Known Limitations
- The challenge specifications do not require user authentication (passwords/tokens); suppliers select companies via the dashboard and travelers access bookings via their 10-digit number.
- Payment gateway integration is mocked; monetary values represent confirmed fare commitments in INR.

---

## 20. Future Enhancements
- Integration with Razorpay / Stripe for live card payments.
- Real-time GPS driver tracking via WebSockets.
- SMS & WhatsApp itinerary notifications.

---

## 21. Contributors
- Full-Stack Engineering Team — RidePort Hackathon Project

---

## 22. License
MIT License
