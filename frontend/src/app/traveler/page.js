'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
import {
  getAirportTimezone,
  getAirportNowComponents,
  resolveLandingDatetime,
  validateFlightSchedule,
  validatePickupSchedule,
  calculateSuggestedPickup,
  formatLocalDatetime,
} from '../../lib/dateValidation';

const STEPS = [
  'Flight', 'Hotel', 'Passengers', 'Pickup', 'Fare & Confirm', 'Submitted', 'Offers', 'Confirmed',
];

const STORAGE_KEY = 'rideport_traveler_booking_draft';

function loadDraftFromStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveDraftToStorage(draft) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch (e) {}
}

function clearDraftStorage() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
}

function StepsBar({ current }) {
  return (
    <div className="steps-bar">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className={`step-item${done ? ' completed' : ''}${active ? ' active' : ''}`}>
            <div className="step-circle">{done ? '✓' : i + 1}</div>
            <div className="step-label">{label}</div>
          </div>
        );
      })}
    </div>
  );
}

function Badge({ status }) {
  const cls = {
    OFFERED: 'badge-offered',
    BOOKED: 'badge-booked',
    REJECTED: 'badge-rejected',
    NOT_CHOSEN: 'badge-not-chosen',
    WAITING: 'badge-waiting',
    OPEN: 'badge-open',
    EXPIRED: 'badge-rejected',
  }[status] || 'badge-waiting';
  return <span className={`badge ${cls}`}>{status}</span>;
}

// ── Step 1: Flight & Flight Travel Date Selection ─────────────────────────────
function FlightStep({ selectedFlight, selectedDate, onSelect, onDateChange, onNext }) {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [dateValidation, setDateValidation] = useState({ valid: true, error: '' });

  useEffect(() => {
    apiFetch('/api/catalog/flights')
      .then(setFlights)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Validate date whenever flight or date changes
  useEffect(() => {
    if (selectedFlight) {
      const res = validateFlightSchedule(selectedFlight, selectedDate);
      setDateValidation(res);
    } else {
      setDateValidation({ valid: true, error: '' });
    }
  }, [selectedFlight, selectedDate]);

  const filtered = flights.filter(f =>
    !q || f.flight_id?.toLowerCase().includes(q.toLowerCase()) || f.airline?.toLowerCase().includes(q.toLowerCase())
  );

  const handleFlightCardClick = (f) => {
    // If selecting a new flight, use its scheduled date if no custom date entered
    const defaultDate = f.arrival_local?.split('T')[0] || '';
    const dateToUse = selectedDate || defaultDate;
    onSelect(f, dateToUse);
  };

  const handleDateInput = (e) => {
    const newDate = e.target.value;
    onDateChange(newDate);
  };

  const canContinue = selectedFlight && dateValidation.valid;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>Select Flight &amp; Travel Date</h2>
          <p className="text-muted text-sm">Choose an airline service and your travel date.</p>
        </div>
      </div>

      {error && <div className="alert-error">⚠️ {error}</div>}

      {/* Selected Flight & Date Bar if already chosen */}
      {selectedFlight && (
        <div className="card" style={{ marginBottom: '1.5rem', background: '#f8fafc', border: '2px solid #2563eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="badge badge-booked">Selected Flight</span>
                <strong style={{ fontSize: '1.15rem' }}>{selectedFlight.flight_id} ({selectedFlight.airline})</strong>
              </div>
              <div className="text-sm text-muted mt-1">
                Route: <strong>{selectedFlight.from} → {selectedFlight.to}</strong> · Scheduled Arrival: <strong>{selectedFlight.arrival_local?.split('T')[1]?.substring(0, 5) || '10:30'}</strong> (Airport: {selectedFlight.to})
              </div>
            </div>

            <div style={{ minWidth: '220px' }}>
              <label className="label" style={{ fontSize: '0.85rem' }}>Travel Date (YYYY-MM-DD) *</label>
              <input
                type="date"
                className="input"
                value={selectedDate || selectedFlight.arrival_local?.split('T')[0] || ''}
                onChange={handleDateInput}
                style={{ fontWeight: 700 }}
              />
            </div>
          </div>

          {!dateValidation.valid && (
            <div className="alert-error" style={{ marginTop: '1rem', marginBottom: 0 }}>
              ⚠️ {dateValidation.error}
            </div>
          )}

          {dateValidation.valid && (
            <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
              <button className="btn-primary" onClick={onNext}>
                Continue to Destination Hotel →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Flight Catalog Search */}
      <div className="search-wrapper">
        <span className="search-icon">🔍</span>
        <input className="search-bar" placeholder="Search by flight ID, airline, or route (e.g. FL-401, Tokyo, AirVeda)…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="loading-container"><div className="loading-spinner" /><span>Loading flights catalog…</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">✈️</div><p>No flights found matching your search</p></div>
      ) : (
        <div className="grid-2">
          {filtered.map(f => {
            const isSelected = selectedFlight?.flight_id === f.flight_id;
            return (
              <div
                key={f.flight_id}
                className="card card-clickable"
                onClick={() => handleFlightCardClick(f)}
                style={{
                  border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                  background: isSelected ? '#eff6ff' : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-title" style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>{f.flight_id}</div>
                    <div className="info-row">
                      <span>✈️ <strong>{f.from}</strong> → <strong>{f.to}</strong></span>
                    </div>
                    {f.airline && <div className="text-sm font-semibold mt-1" style={{ color: '#475569' }}>{f.airline} ({f.flight_number})</div>}
                    {f.arrival_local && (
                      <div className="text-sm text-muted mt-1">
                        🕐 Scheduled Arrival: <strong>{f.arrival_local}</strong>
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '1.5rem', color: isSelected ? '#16a34a' : '#2563eb' }}>
                    {isSelected ? '✓' : '→'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Step 2: Destination Hotel Selection ───────────────────────────────────────
function HotelStep({ flight, selectedHotel, onSelect, onBack }) {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    apiFetch('/api/catalog/hotels')
      .then(setHotels)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = hotels.filter(h =>
    !q || h.name?.toLowerCase().includes(q.toLowerCase()) || h.city?.toLowerCase().includes(q.toLowerCase()) || h.area?.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Select Destination Hotel</h2>
          <p className="text-muted text-sm">Where should our partner taxi fleet drop you off?</p>
        </div>
        <button className="btn-secondary btn-sm" onClick={onBack}>← Back to Flight</button>
      </div>

      <div className="card" style={{ marginBottom: '1rem', background: '#f0f9ff', border: '1px solid #bae6fd' }}>
        <div className="text-sm text-muted">
          Arrival Airport: <strong>{flight.to}</strong> (Flight: <strong>{flight.flight_id}</strong>) · Please select a hotel served by this airport.
        </div>
      </div>

      {error && <div className="alert-error">⚠️ {error}</div>}

      <div className="search-wrapper">
        <span className="search-icon">🔍</span>
        <input className="search-bar" placeholder="Search by hotel name, city, or area (e.g. Grand Hyatt, Tokyo, Ueno)…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="loading-container"><div className="loading-spinner" /><span>Loading hotels…</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">🏨</div><p>No hotels found matching search</p></div>
      ) : (
        <div className="grid-2">
          {filtered.map(h => {
            const isSelected = selectedHotel?.hotel_id === h.hotel_id;
            return (
              <div
                key={h.hotel_id || h.name}
                className="card card-clickable"
                onClick={() => onSelect(h)}
                style={{
                  border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                  background: isSelected ? '#eff6ff' : '#ffffff',
                }}
              >
                <div className="card-title" style={{ fontSize: '1.15rem' }}>{h.name}</div>
                <div className="info-row">
                  <span>🏙️ <strong>{h.city}</strong></span>
                  {h.area && <span>📍 Area: <strong>{h.area}</strong></span>}
                </div>
                <div className="text-sm text-muted mt-1">Hotel ID: <code>{h.hotel_id}</code></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Step 3: Passenger & Luggage Details ───────────────────────────────────────
function PassengerStep({ draft, onChange, onNext, onBack }) {
  const [adults, setAdults] = useState(draft.adults || 1);
  const [numChildren, setNumChildren] = useState(draft.numChildren || (draft.childAges?.length || 0));
  const [childAges, setChildAges] = useState(draft.childAges || []);
  const [largeBags, setLargeBags] = useState(draft.largeBags || 0);
  const [smallBags, setSmallBags] = useState(draft.smallBags || 0);
  const [carType, setCarType] = useState(draft.carType || '');
  const [travelerName, setTravelerName] = useState(draft.travelerName || '');
  const [error, setError] = useState('');

  const handleNumChildrenChange = (e) => {
    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
    setNumChildren(val);
    const newAges = [...childAges];
    while (newAges.length < val) newAges.push(5);
    while (newAges.length > val) newAges.pop();
    setChildAges(newAges);
  };

  const handleChildAgeChange = (index, value) => {
    const updated = [...childAges];
    updated[index] = Math.max(0, Math.min(17, parseInt(value, 10) || 0));
    setChildAges(updated);
  };

  const handleNext = () => {
    if (!travelerName.trim() || travelerName.trim().length < 2) {
      setError('Please enter a valid traveler or family name');
      return;
    }
    if (adults < 1) {
      setError('At least 1 adult is required (Rule R2)');
      return;
    }
    for (const age of childAges) {
      if (age < 0 || age > 17) {
        setError('Child age must be between 0 and 17 (Rule R1)');
        return;
      }
    }
    setError('');
    const update = {
      travelerName: travelerName.trim(),
      adults,
      numChildren,
      childAges,
      largeBags,
      smallBags,
      carType: carType || null,
    };
    onChange(update);
    onNext(update);
  };

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Passenger &amp; Luggage Details</h2>
          <p className="text-muted text-sm">Tell our fleet suppliers who is traveling and baggage requirements.</p>
        </div>
        <button className="btn-secondary btn-sm" onClick={onBack}>← Back to Hotel</button>
      </div>

      {error && <div className="alert-error">⚠️ {error}</div>}

      <div className="card" style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div className="form-group">
          <label>Lead Traveler / Family Name *</label>
          <input
            className="input"
            value={travelerName}
            onChange={e => setTravelerName(e.target.value)}
            placeholder="e.g. Menon Family or Rahul Sharma"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label>Adults (18+) *</label>
            <input
              className="input"
              type="number"
              min="1"
              max="20"
              value={adults}
              onChange={e => setAdults(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </div>
          <div className="form-group">
            <label>Children (Ages 0–17)</label>
            <input
              className="input"
              type="number"
              min="0"
              max="10"
              value={numChildren}
              onChange={handleNumChildrenChange}
            />
          </div>
        </div>

        {childAges.length > 0 && (
          <div className="form-group" style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
            <label style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 600 }}>
              Children's Ages (Rule R1: 0 to 17 years)
            </label>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {childAges.map((age, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="text-sm text-muted">Child {i + 1}:</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="17"
                    value={age}
                    onChange={e => handleChildAgeChange(i, e.target.value)}
                    style={{ width: '65px', textAlign: 'center' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label>🧳 Large Bags</label>
            <input
              className="input"
              type="number"
              min="0"
              value={largeBags}
              onChange={e => setLargeBags(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </div>
          <div className="form-group">
            <label>🎒 Small Bags</label>
            <input
              className="input"
              type="number"
              min="0"
              value={smallBags}
              onChange={e => setSmallBags(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Preferred Vehicle Type (Optional)</label>
          <select className="input" value={carType} onChange={e => setCarType(e.target.value)}>
            <option value="">Any Vehicle Class (Recommended for more quotes)</option>
            <option value="SEDAN">SEDAN</option>
            <option value="SUV">SUV</option>
            <option value="HATCHBACK">HATCHBACK</option>
            <option value="BUS">BUS</option>
          </select>
        </div>

        <button className="btn-primary" onClick={handleNext} style={{ width: '100%', marginTop: '1rem' }}>
          Continue to Pickup Time →
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Pickup Date & Time Selection ──────────────────────────────────────
function PickupStep({ flight, flightDate, draftPickup, onNext, onBack }) {
  const airport = flight?.to;
  const landingIso = resolveLandingDatetime(flight, flightDate);

  // Suggested pickup calculation: earliest valid = landing + 60 mins if future
  const suggestedPickup = calculateSuggestedPickup(airport, landingIso);

  // Initialize with draft value, or suggested pickup, never 0000 or invalid
  const [pickup, setPickup] = useState(draftPickup || suggestedPickup || '');
  const [validation, setValidation] = useState({ valid: true, error: '' });

  // Revalidate on pickup change
  useEffect(() => {
    if (!pickup) {
      setValidation({ valid: false, error: 'Please enter a pickup date and time' });
      return;
    }
    const res = validatePickupSchedule(airport, landingIso, pickup);
    setValidation(res);
  }, [airport, landingIso, pickup]);

  const handleNext = () => {
    const res = validatePickupSchedule(airport, landingIso, pickup);
    if (!res.valid) {
      setValidation(res);
      return;
    }
    onNext(pickup);
  };

  const airportTz = getAirportTimezone(airport);
  const airportNow = getAirportNowComponents(airport);

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Schedule Pickup Time</h2>
          <p className="text-muted text-sm">Specify when your driver should meet you at the arrival terminal.</p>
        </div>
        <button className="btn-secondary btn-sm" onClick={onBack}>← Back to Passengers</button>
      </div>

      <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
        {/* Flight Landing Schedule Banner */}
        <div style={{ background: '#f8fafc', padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
          <div className="info-row" style={{ margin: 0, paddingBottom: '0.4rem', borderBottom: '1px solid #e2e8f0' }}>
            <span className="text-muted text-sm">Flight Arrival:</span>
            <strong>{landingIso ? landingIso.replace('T', ' ') : 'N/A'} ({airport})</strong>
          </div>
          <div className="info-row" style={{ margin: 0, paddingTop: '0.4rem' }}>
            <span className="text-muted text-sm">Airport Timezone:</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2563eb' }}>{airportTz} (Live Time: {airportNow.timeStr})</span>
          </div>
        </div>

        {/* Pickup Time Input */}
        <div className="form-group">
          <label style={{ fontWeight: 700, fontSize: '0.95rem' }}>Pickup Date &amp; Time (Local Airport Time) *</label>
          <input
            className="input"
            type="datetime-local"
            value={pickup}
            onChange={e => setPickup(e.target.value)}
            style={{ fontSize: '1.15rem', fontWeight: 700 }}
          />
          <div className="text-sm text-muted mt-2" style={{ lineHeight: 1.5 }}>
            🛡️ <strong>Rule R2:</strong> Pickup must be at least 60 minutes after flight landing ({landingIso ? landingIso.replace('T', ' ') : ''}) to allow for disembarkation and baggage collection.
          </div>
        </div>

        {/* Suggestion pill */}
        {suggestedPickup && (
          <div style={{ marginBottom: '1.25rem' }}>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setPickup(suggestedPickup)}
              style={{ fontSize: '0.8rem' }}
            >
              ⚡ Use Earliest Recommended Time ({suggestedPickup.replace('T', ' ')})
            </button>
          </div>
        )}

        {/* Validation Error Banner */}
        {!validation.valid && (
          <div className="alert-error" style={{ marginBottom: '1.25rem' }}>
            ⚠️ {validation.error}
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleNext}
          disabled={!validation.valid || !pickup}
          style={{ width: '100%', padding: '0.85rem' }}
        >
          Continue to Fare &amp; Review →
        </button>
      </div>
    </div>
  );
}

// ── Step 5: Official Fare Calculation & Confirmation ──────────────────────────
function PriceStep({ flight, flightDate, hotel, passengers, draftPrice, onSubmit, onBack }) {
  const [route, setRoute] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(true);
  const [routeError, setRouteError] = useState('');
  const [priceInr, setPriceInr] = useState(draftPrice ? String(draftPrice) : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const airport = flight?.to;
  const landingIso = resolveLandingDatetime(flight, flightDate);

  // STRICT VALIDATION: Verify date and pickup validity BEFORE fetching price
  const flightValidation = validateFlightSchedule(flight, flightDate);
  const pickupValidation = validatePickupSchedule(airport, landingIso, passengers.pickup);
  const isScheduleValid = flightValidation.valid && pickupValidation.valid;

  useEffect(() => {
    if (!isScheduleValid) {
      setLoadingRoute(false);
      setRoute(null);
      setRouteError(flightValidation.error || pickupValidation.error);
      return;
    }

    const params = new URLSearchParams({
      airport: flight.to,
      city: hotel.city,
      area: hotel.area || '',
    });

    apiFetch(`/api/routes?${params}`)
      .then(data => {
        setRoute(data);
        const minP = data.price_min_inr || data.min_price_inr;
        // Only set default if traveler hasn't already entered a price
        if (!priceInr && minP) {
          setPriceInr(String(minP));
        }
      })
      .catch(e => setRouteError(e.message))
      .finally(() => setLoadingRoute(false));
  }, [flight, flightDate, hotel, isScheduleValid]);

  const handleSubmit = async () => {
    if (!isScheduleValid) {
      setError(flightValidation.error || pickupValidation.error);
      return;
    }

    const price = parseFloat(priceInr);
    if (isNaN(price)) {
      setError('Please enter a valid price in INR');
      return;
    }

    const minPrice = route?.price_min_inr || route?.min_price_inr;
    const maxPrice = route?.price_max_inr || route?.max_price_inr;

    if (minPrice && price < minPrice) {
      setError(`Price must be at least INR ${minPrice.toLocaleString()} (Rule R3)`);
      return;
    }
    if (maxPrice && price > maxPrice) {
      setError(`Price must be at most INR ${maxPrice.toLocaleString()} (Rule R3)`);
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const payload = {
        flight_id: flight.flight_id,
        flight_date: flightDate || undefined,
        hotel_id: hotel.hotel_id || hotel.name,
        adults: passengers.adults,
        child_ages: passengers.childAges.map(a => parseInt(a, 10) || 0),
        large_bags: passengers.largeBags,
        small_bags: passengers.smallBags,
        car_type: passengers.carType || null,
        traveler_name: passengers.travelerName,
        price_inr: price,
        pickup: passengers.pickup,
      };

      const result = await apiFetch('/api/requests', { method: 'POST', body: JSON.stringify(payload) });
      const reqId = result.request_id || result.request?.request_id;
      if (!reqId) {
        throw new Error('Server did not return a valid Request ID');
      }

      onSubmit(result, reqId);
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  const minPrice = route?.price_min_inr || route?.min_price_inr;
  const maxPrice = route?.price_max_inr || route?.max_price_inr;

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Set Your Budget &amp; Confirm</h2>
          <p className="text-muted text-sm">Review itinerary details and propose your ride budget within official bounds.</p>
        </div>
        <button className="btn-secondary btn-sm" onClick={onBack}>← Back to Pickup</button>
      </div>

      {error && <div className="alert-error">⚠️ {error}</div>}

      <div className="card" style={{ maxWidth: '620px', margin: '0 auto' }}>
        {/* Booking Summary Card */}
        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
          <div className="card-title" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>📋 Itinerary Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', fontSize: '0.9rem' }}>
            <div><span className="text-muted">Traveler:</span> <strong>{passengers.travelerName}</strong></div>
            <div><span className="text-muted">Flight:</span> <strong>{flight.flight_id} ({flight.to})</strong></div>
            <div><span className="text-muted">Hotel:</span> <strong>{hotel.name}</strong></div>
            <div><span className="text-muted">Pickup:</span> <strong>{passengers.pickup?.replace('T', ' ')}</strong></div>
            <div><span className="text-muted">Passengers:</span> <strong>{passengers.adults} Adults{passengers.childAges?.length > 0 ? `, ${passengers.childAges.length} Children` : ''}</strong></div>
            <div><span className="text-muted">Luggage:</span> <strong>{passengers.largeBags}L / {passengers.smallBags}S</strong></div>
          </div>
        </div>

        {/* Phase 4: DO NOT DISPLAY PRICE FOR INVALID BOOKINGS */}
        {!isScheduleValid ? (
          <div className="alert-error" style={{ marginBottom: '1.5rem' }}>
            ⛔ <strong>Date Validation Error:</strong> {flightValidation.error || pickupValidation.error}
            <div className="mt-2 text-sm">
              Please click Back to select a valid future flight date and pickup time before fare calculation.
            </div>
          </div>
        ) : loadingRoute ? (
          <div className="loading-container"><div className="loading-spinner" /><span>Calculating official route fare bounds…</span></div>
        ) : routeError ? (
          <div className="alert-error">⚠️ {routeError}</div>
        ) : route ? (
          <div style={{ marginBottom: '1.5rem' }}>
            <div className="price-range" style={{ padding: '1.25rem', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
              <div style={{ fontSize: '0.85rem', color: '#047857', fontWeight: 700, letterSpacing: '0.05em' }}>
                OFFICIAL ROUTE FARE BOUNDS (RULE R3)
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#065f46', marginTop: '0.35rem' }}>
                INR {minPrice?.toLocaleString()} – {maxPrice?.toLocaleString()}
              </div>
              {route.drive_minutes && (
                <div className="text-sm mt-1" style={{ color: '#047857' }}>
                  🕐 Estimated drive time: <strong>{route.drive_minutes} minutes</strong> ({route.distance_km} km)
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label style={{ fontWeight: 700 }}>Your Proposed Price (INR) *</label>
              <input
                className="input"
                type="number"
                min={minPrice || 0}
                max={maxPrice}
                value={priceInr}
                onChange={e => setPriceInr(e.target.value)}
                placeholder="Enter price in INR within route bounds"
                style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1e293b' }}
              />
            </div>

            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={submitting || !priceInr}
              style={{ width: '100%', padding: '0.9rem', fontSize: '1.05rem' }}
            >
              {submitting ? (
                <><span className="loading-spinner" style={{ width: '1rem', height: '1rem' }} /> Submitting Request…</>
              ) : (
                '🚕 Submit Ride Request to Suppliers'
              )}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Step 6: Request Submitted Step ───────────────────────────────────────────
function SubmittedStep({ requestId, onViewOffers }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(requestId || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <div className="card" style={{ maxWidth: '520px', margin: '2rem auto', textAlign: 'center' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem' }}>🎉</div>
        <h2 className="section-title" style={{ marginBottom: '0.5rem', color: '#16a34a' }}>Request Submitted!</h2>
        <p className="text-muted text-sm mb-4">Your ride request has been broadcast to all eligible fleet suppliers.</p>

        <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
          <div className="text-sm text-muted">YOUR OFFICIAL REQUEST ID</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'monospace', color: '#1e293b', letterSpacing: '0.05em', margin: '0.4rem 0' }}>
            {requestId}
          </div>
          <button className="btn-secondary btn-sm" onClick={copy}>
            {copied ? '✅ Copied!' : '📋 Copy Request ID'}
          </button>
        </div>

        <p className="text-sm text-muted" style={{ marginBottom: '1.5rem' }}>
          Suppliers are reviewing your details now. Click below to view quotes as they arrive in real-time.
        </p>

        <button className="btn-primary" onClick={onViewOffers} style={{ width: '100%', padding: '0.85rem' }}>
          View Live Taxi Offers →
        </button>
      </div>
    </div>
  );
}

// ── Step 7: Live Offers Step ──────────────────────────────────────────────────
export function OffersStep({ requestId, onBooked }) {
  const [offers, setOffers] = useState([]);
  const [requestDetails, setRequestDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const fetchOffers = useCallback(async () => {
    if (!requestId) return;

    try {
      const data = await apiFetch(`/api/requests/${requestId}/offers`);
      const list = Array.isArray(data) ? data : (data.offers || []);
      setOffers(list);
      if (data.request) {
        setRequestDetails(data.request);
      }
      setError('');
      setLastSync(new Date());
    } catch (e) {
      if (e.message && e.message.includes('404')) {
        setError(`Request "${requestId}" was not found in the database. Please verify the ID or submit a new request.`);
      } else {
        setError(e.message || 'Failed to fetch offers');
      }
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  // Initial fetch and automatic 3-second polling
  useEffect(() => {
    fetchOffers();
    const interval = setInterval(fetchOffers, 3000);
    return () => clearInterval(interval);
  }, [fetchOffers]);

  const handleBook = async (offerId) => {
    setActing(offerId + '-book');
    setActionError('');
    try {
      const result = await apiFetch(`/api/offers/${offerId}/book`, { method: 'POST' });
      onBooked(result.booking || result);
    } catch (e) {
      setActionError(e.message || 'Failed to confirm booking');
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (offerId) => {
    setActing(offerId + '-reject');
    setActionError('');
    try {
      await apiFetch(`/api/offers/${offerId}/reject`, { method: 'POST' });
      fetchOffers();
    } catch (e) {
      setActionError(e.message || 'Failed to reject offer');
    } finally {
      setActing(null);
    }
  };

  if (!requestId) {
    return (
      <div className="card" style={{ maxWidth: '540px', margin: '2rem auto', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❓</div>
        <h2 className="section-title">No Active Request Selected</h2>
        <p className="text-muted text-sm" style={{ marginBottom: '1.5rem' }}>
          Please submit a ride request to view supplier offers, or paste a Request ID.
        </p>
        <Link href="/traveler" className="btn-primary">
          Start New Request
        </Link>
      </div>
    );
  }

  const vehicleTypes = [...new Set(offers.map(o => o.vehicle_type).filter(Boolean))];
  const filtered = offers
    .filter(o => !filterType || o.vehicle_type === filterType)
    .sort((a, b) => {
      const pa = Number(a.price_inr) || 0;
      const pb = Number(b.price_inr) || 0;
      return sortOrder === 'asc' ? pa - pb : pb - pa;
    });

  return (
    <div>
      {/* Header with live sync pulse */}
      <div className="section-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2 className="section-title">Taxi Offers for Request</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem', color: '#1e293b' }}>
              {requestId}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#16a34a', background: '#dcfce7', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
              Live Sync (3s)
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-secondary btn-sm" onClick={fetchOffers}>
            🔄 Refresh Now
          </button>
        </div>
      </div>

      {/* Request Details banner if available */}
      {requestDetails && (
        <div className="card" style={{ marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <div>
              <span className="text-muted text-sm">Traveler:</span>
              <div><strong>{requestDetails.traveler_name}</strong></div>
            </div>
            <div>
              <span className="text-muted text-sm">Flight:</span>
              <div><strong>{requestDetails.flight_id}</strong> (Airport: {requestDetails.airport})</div>
            </div>
            <div>
              <span className="text-muted text-sm">Pickup Time:</span>
              <div><strong style={{ color: '#2563eb' }}>{requestDetails.pickup}</strong></div>
            </div>
            <div>
              <span className="text-muted text-sm">Budget:</span>
              <div><strong>INR {Number(requestDetails.price_inr).toLocaleString()}</strong></div>
            </div>
          </div>
        </div>
      )}

      {error && <div className="alert-error" style={{ marginBottom: '1.5rem' }}>⚠️ {error}</div>}
      {actionError && <div className="alert-error" style={{ marginBottom: '1.5rem' }}>⚠️ {actionError}</div>}

      {/* Filter and Sort Toolbar */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="text-sm text-muted">Filter Type:</span>
          <select className="input" style={{ width: 'auto', padding: '0.4rem 0.75rem' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All Vehicles ({offers.length})</option>
            {vehicleTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="text-sm text-muted">Sort by Price:</span>
          <select className="input" style={{ width: 'auto', padding: '0.4rem 0.75rem' }} value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
            <option value="asc">Lowest Price First (INR ↑)</option>
            <option value="desc">Highest Price First (INR ↓)</option>
          </select>
        </div>

        {lastSync && (
          <span className="text-sm text-muted" style={{ marginLeft: 'auto' }}>
            Last checked: {lastSync.toLocaleTimeString()}
          </span>
        )}
      </div>

      {loading && offers.length === 0 ? (
        <div className="loading-container"><div className="loading-spinner" /><span>Connecting to live offer stream…</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state" style={{ background: '#ffffff', border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '3rem 2rem' }}>
          <div className="empty-state-icon" style={{ fontSize: '3rem' }}>⏳</div>
          <h3 style={{ margin: '0.5rem 0', color: '#1e293b', fontSize: '1.4rem', fontWeight: 800 }}>No taxi offers yet</h3>
          <p className="text-muted text-sm" style={{ maxWidth: '480px', margin: '0 auto 1.5rem auto', lineHeight: 1.6 }}>
            Your request has been shared with eligible taxi suppliers. We will automatically show offers here as they become available.
          </p>

          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.75rem', background: '#f8fafc', padding: '1rem 1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'left', minWidth: '320px' }}>
            <div className="info-row" style={{ margin: 0 }}>
              <span className="text-muted text-sm">Request ID:</span>
              <code style={{ fontWeight: 700 }}>{requestId}</code>
            </div>
            <div className="info-row" style={{ margin: 0 }}>
              <span className="text-muted text-sm">Request Status:</span>
              <span className="badge badge-open">{requestDetails?.status || 'OPEN'}</span>
            </div>
            <div className="info-row" style={{ margin: 0 }}>
              <span className="text-muted text-sm">Real-time Stream:</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                Active (Auto-syncs every 3s)
              </span>
            </div>
            {lastSync && (
              <div className="info-row" style={{ margin: 0 }}>
                <span className="text-muted text-sm">Last Synced:</span>
                <span className="text-sm font-semibold">{lastSync.toLocaleTimeString()}</span>
              </div>
            )}
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <button className="btn-secondary btn-sm" onClick={fetchOffers}>
              🔄 Check for Offers Now
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filtered.map(offer => {
            const expireDate = offer.expires_at ? new Date(offer.expires_at.endsWith('Z') ? offer.expires_at : offer.expires_at + 'Z') : null;
            const isExpired = offer.status === 'EXPIRED' || (expireDate && expireDate < new Date());
            const displayStatus = isExpired && offer.status === 'OFFERED' ? 'EXPIRED' : offer.status;
            const isOffered = offer.status === 'OFFERED' && !isExpired;

            return (
              <div key={offer.offer_id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderLeft: isOffered ? '4px solid #2563eb' : isExpired ? '4px solid #dc2626' : '4px solid #cbd5e1' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '1.15rem' }}>
                      {offer.company_name || offer.company_id}
                    </span>
                    <Badge status={displayStatus} />
                    {expireDate && (
                      <span style={{ fontSize: '0.8rem', color: isExpired ? '#dc2626' : '#b45309', background: isExpired ? '#fee2e2' : '#fef3c7', padding: '0.2rem 0.55rem', borderRadius: '4px', fontWeight: 600 }}>
                        {isExpired ? '⚠️ Expired' : `⏱️ Expires: ${expireDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      </span>
                    )}
                  </div>

                  <div className="info-row" style={{ gap: '1.5rem', flexWrap: 'wrap' }}>
                    <span>🚗 <strong>{offer.vehicle_type || 'Vehicle'}</strong> (ID: <code>{offer.vehicle_id}</code>)</span>
                    {offer.seats && <span>👥 {offer.seats} seats</span>}
                    {offer.large_bags !== undefined && <span>🧳 {offer.large_bags}L / {offer.small_bags}S bags</span>}
                    <span className="text-muted text-sm">Offer Ref: <code>{offer.offer_id}</code></span>
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <div>
                    <span className="text-muted text-sm">Supplier Fare</span>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2563eb' }}>
                      INR {Number(offer.price_inr).toLocaleString()}
                    </div>
                  </div>

                  {isOffered && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn-primary"
                        disabled={acting === offer.offer_id + '-book'}
                        onClick={() => handleBook(offer.offer_id)}
                      >
                        {acting === offer.offer_id + '-book' ? 'Booking…' : '✅ Book This Taxi'}
                      </button>
                      <button
                        className="btn-danger btn-sm"
                        disabled={acting === offer.offer_id + '-reject'}
                        onClick={() => {
                          if (window.confirm('Are you sure you want to reject this taxi offer?')) {
                            handleReject(offer.offer_id);
                          }
                        }}
                      >
                        {acting === offer.offer_id + '-reject' ? '…' : '✕ Reject'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Step 8: Booking Confirmed Step ───────────────────────────────────────────
function BookingConfirmedStep({ booking }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(booking.booking_number || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <div className="card" style={{ maxWidth: '560px', margin: '2rem auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎊</div>
        <h2 className="section-title" style={{ marginBottom: '0.5rem', color: '#16a34a' }}>Booking Confirmed!</h2>
        <p className="text-muted text-sm mb-4">Your taxi transfer is booked. Save your unique 10-digit booking reference.</p>
        <div className="booking-number-display">{booking.booking_number}</div>
        <button className="btn-secondary" onClick={copy} style={{ marginBottom: '1.5rem' }}>
          {copied ? '✅ Copied!' : '📋 Copy Booking Number'}
        </button>
        <div className="divider" />
        <div style={{ textAlign: 'left' }}>
          <div className="card-title">Booking Details</div>
          {[
            ['Traveler', booking.traveler_name],
            ['Flight', booking.flight_id],
            ['Hotel', booking.hotel_id],
            ['Pickup Time', booking.pickup],
            ['Supplier', booking.company_id],
            ['Vehicle ID', booking.vehicle_id],
            ['Confirmed Price', booking.price_inr ? `INR ${Number(booking.price_inr).toLocaleString()}` : undefined],
            ['Drive Time', booking.drive_minutes ? `${booking.drive_minutes} min` : undefined],
            ['Status', booking.status],
          ].map(([k, v]) => v ? (
            <div key={k} className="info-row" style={{ padding: '0.4rem 0', borderBottom: '1px solid #f1f5f9' }}>
              <span className="text-muted" style={{ minWidth: '120px' }}>{k}:</span>
              <strong>{v}</strong>
            </div>
          ) : null)}
        </div>
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <Link href={`/lookup?number=${booking.booking_number}`} className="btn-primary">
            Track Itinerary →
          </Link>
          <button
            className="btn-secondary"
            onClick={() => {
              clearDraftStorage();
              window.location.href = '/traveler';
            }}
          >
            Book Another Ride
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Traveler Page (with Full Form Persistence & Date Validation) ─────────
export default function TravelerPage() {
  const [step, setStep] = useState(0);

  // Centralized Draft State with Persistence across all steps
  const [draft, setDraft] = useState({
    flight: null,
    flightDate: '',
    hotel: null,
    travelerName: '',
    adults: 1,
    numChildren: 0,
    childAges: [],
    largeBags: 0,
    smallBags: 0,
    carType: '',
    pickup: '',
    priceInr: '',
  });

  const [requestId, setRequestId] = useState(null);
  const [booking, setBooking] = useState(null);

  // Load draft and URL params on initial mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = loadDraftFromStorage();
      if (saved) {
        setDraft(prev => ({ ...prev, ...saved }));
      }

      const params = new URLSearchParams(window.location.search);
      const urlReq = params.get('request_id');
      const urlStep = params.get('step');

      if (urlReq) {
        setRequestId(urlReq);
        setStep(6); // Offers step
      } else if (urlStep === 'offers') {
        const cached = window.localStorage.getItem('rideport_request_id');
        if (cached) {
          setRequestId(cached);
          setStep(6);
        }
      }
    }
  }, []);

  const updateDraft = (updates) => {
    setDraft(prev => {
      const nextDraft = { ...prev, ...updates };
      saveDraftToStorage(nextDraft);
      return nextDraft;
    });
  };

  const handleFlightSelect = (flightObj, flightDateStr) => {
    // When flight changes, recalculate suggested pickup if not set
    const landingIso = resolveLandingDatetime(flightObj, flightDateStr);
    const suggestedPickup = calculateSuggestedPickup(flightObj.to, landingIso);

    updateDraft({
      flight: flightObj,
      flightDate: flightDateStr,
      // Only recalculate pickup if empty or if flight changed
      pickup: suggestedPickup || draft.pickup || '',
    });
    setStep(1);
  };

  const handleHotelSelect = (hotelObj) => {
    updateDraft({ hotel: hotelObj });
    setStep(2);
  };

  const handlePassengersNext = (passengerData) => {
    updateDraft(passengerData);
    setStep(3);
  };

  const handlePickupNext = (pickupDatetimeStr) => {
    updateDraft({ pickup: pickupDatetimeStr });
    setStep(4);
  };

  const handleRequestSubmitted = (result, reqId) => {
    setRequestId(reqId);
    clearDraftStorage(); // Clear temporary booking draft on success
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('rideport_request_id', reqId);
      window.history.pushState({}, '', `/traveler?step=submitted&request_id=${reqId}`);
    }
    setStep(5);
  };

  const handleViewOffers = () => {
    if (typeof window !== 'undefined' && requestId) {
      window.history.pushState({}, '', `/traveler?step=offers&request_id=${requestId}`);
    }
    setStep(6);
  };

  const handleResetForm = () => {
    clearDraftStorage();
    setDraft({
      flight: null,
      flightDate: '',
      hotel: null,
      travelerName: '',
      adults: 1,
      numChildren: 0,
      childAges: [],
      largeBags: 0,
      smallBags: 0,
      carType: '',
      pickup: '',
      priceInr: '',
    });
    setStep(0);
  };

  return (
    <div className="page-container">
      {/* Reset button when mid-booking */}
      {step > 0 && step < 5 && (
        <div style={{ textAlign: 'right', marginBottom: '0.5rem' }}>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={handleResetForm}
            style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
          >
            ✕ Reset &amp; Start Over
          </button>
        </div>
      )}

      <StepsBar current={step} />

      {step === 0 && (
        <FlightStep
          selectedFlight={draft.flight}
          selectedDate={draft.flightDate}
          onSelect={handleFlightSelect}
          onDateChange={date => updateDraft({ flightDate: date })}
          onNext={() => setStep(1)}
        />
      )}

      {step === 1 && (
        <HotelStep
          flight={draft.flight}
          selectedHotel={draft.hotel}
          onSelect={handleHotelSelect}
          onBack={() => setStep(0)}
        />
      )}

      {step === 2 && (
        <PassengerStep
          draft={draft}
          onChange={updateDraft}
          onNext={handlePassengersNext}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <PickupStep
          flight={draft.flight}
          flightDate={draft.flightDate}
          draftPickup={draft.pickup}
          onNext={handlePickupNext}
          onBack={() => setStep(2)}
        />
      )}

      {step === 4 && (
        <PriceStep
          flight={draft.flight}
          flightDate={draft.flightDate}
          hotel={draft.hotel}
          passengers={{
            travelerName: draft.travelerName,
            adults: draft.adults,
            numChildren: draft.numChildren,
            childAges: draft.childAges,
            largeBags: draft.largeBags,
            smallBags: draft.smallBags,
            carType: draft.carType,
            pickup: draft.pickup,
          }}
          draftPrice={draft.priceInr}
          onSubmit={handleRequestSubmitted}
          onBack={() => setStep(3)}
        />
      )}

      {step === 5 && (
        <SubmittedStep requestId={requestId} onViewOffers={handleViewOffers} />
      )}

      {step === 6 && (
        <OffersStep requestId={requestId} onBooked={b => { setBooking(b); setStep(7); }} />
      )}

      {step === 7 && (
        <BookingConfirmedStep booking={booking} />
      )}
    </div>
  );
}
