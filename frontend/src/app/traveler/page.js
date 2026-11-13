'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';

const STEPS = [
  'Flight', 'Hotel', 'Passengers', 'Price', 'Submitted', 'Offers', 'Confirmed',
];

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
  }[status] || 'badge-waiting';
  return <span className={`badge ${cls}`}>{status}</span>;
}

// ── Step 1: Flight Selection ──────────────────────────────────────────────────
function FlightStep({ onSelect }) {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    apiFetch('/api/catalog/flights')
      .then(setFlights)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = flights.filter(f =>
    !q || f.flight_id?.toLowerCase().includes(q.toLowerCase()) || f.airline?.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div>
      <h2 className="section-title" style={{ marginBottom: '1.5rem' }}>Select Your Flight</h2>
      {error && <div className="alert-error">⚠️ {error}</div>}
      <div className="search-wrapper">
        <span className="search-icon">🔍</span>
        <input className="search-bar" placeholder="Search by flight ID or airline…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {loading ? (
        <div className="loading-container"><div className="loading-spinner" /><span>Loading flights…</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">✈️</div><p>No flights found</p></div>
      ) : (
        <div className="grid-2">
          {filtered.map(f => (
            <div key={f.flight_id} className="card card-clickable" onClick={() => onSelect(f)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="card-title">{f.flight_id}</div>
                  <div className="info-row">
                    <span>✈️ {f.from} → {f.to}</span>
                  </div>
                  {f.airline && <div className="text-sm text-muted mt-1">{f.airline}</div>}
                  {f.arrival_local && <div className="text-sm text-muted mt-1">🕐 Arrival: {f.arrival_local}</div>}
                </div>
                <span style={{ fontSize: '1.5rem', color: '#2563eb' }}>→</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 2: Hotel Selection ───────────────────────────────────────────────────
function HotelStep({ flight, onSelect, onBack }) {
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
    !q || h.name?.toLowerCase().includes(q.toLowerCase()) || h.city?.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Select Your Destination Hotel</h2>
        <button className="btn-secondary btn-sm" onClick={onBack}>← Back</button>
      </div>
      <div className="card" style={{ marginBottom: '1rem', background: '#f0f9ff', border: '1px solid #bae6fd' }}>
        <div className="text-sm text-muted">Arrival Airport: <strong>{flight.to}</strong> (Flight: {flight.flight_id})</div>
      </div>
      {error && <div className="alert-error">⚠️ {error}</div>}
      <div className="search-wrapper">
        <span className="search-icon">🔍</span>
        <input className="search-bar" placeholder="Search by hotel name or city…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {loading ? (
        <div className="loading-container"><div className="loading-spinner" /><span>Loading hotels…</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">🏨</div><p>No hotels found</p></div>
      ) : (
        <div className="grid-2">
          {filtered.map(h => (
            <div key={h.hotel_id || h.name} className="card card-clickable" onClick={() => onSelect(h)}>
              <div className="card-title">{h.name}</div>
              <div className="info-row">
                <span>🏙️ {h.city}</span>
                {h.area && <span>📍 {h.area}</span>}
              </div>
              <div className="text-sm text-muted mt-1">Hotel ID: <code>{h.hotel_id}</code></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 3: Passenger Details ─────────────────────────────────────────────────
function PassengerStep({ flight, hotel, onNext, onBack }) {
  const [adults, setAdults] = useState(1);
  const [numChildren, setNumChildren] = useState(0);
  const [childAges, setChildAges] = useState([]);
  const [largeBags, setLargeBags] = useState(0);
  const [smallBags, setSmallBags] = useState(0);
  const [pickup, setPickup] = useState('');
  const [carType, setCarType] = useState('');
  const [travelerName, setTravelerName] = useState('');
  const [error, setError] = useState('');

  // Default pickup 60 min after arrival
  useEffect(() => {
    if (flight?.arrival_local) {
      try {
        const arr = new Date(flight.arrival_local);
        const p = new Date(arr.getTime() + 60 * 60 * 1000);
        // format local YYYY-MM-DDTHH:mm
        const pad = n => String(n).padStart(2, '0');
        const formatted = `${p.getFullYear()}-${pad(p.getMonth() + 1)}-${pad(p.getDate())}T${pad(p.getHours())}:${pad(p.getMinutes())}`;
        setPickup(formatted);
      } catch {}
    }
  }, [flight]);

  const handleNumChildrenChange = (e) => {
    const val = Math.max(0, parseInt(e.target.value) || 0);
    setNumChildren(val);
    const newAges = [...childAges];
    while (newAges.length < val) newAges.push(5);
    while (newAges.length > val) newAges.pop();
    setChildAges(newAges);
  };

  const handleChildAgeChange = (index, value) => {
    const updated = [...childAges];
    updated[index] = Math.max(0, Math.min(17, parseInt(value) || 0));
    setChildAges(updated);
  };

  const handleNext = () => {
    if (!travelerName.trim() || travelerName.trim().length < 2) {
      setError('Please enter a valid traveler or family name');
      return;
    }
    if (adults < 1) {
      setError('At least 1 adult is required');
      return;
    }
    for (const age of childAges) {
      if (age < 0 || age > 17) {
        setError('Child age must be between 0 and 17');
        return;
      }
    }
    setError('');
    onNext({
      travelerName: travelerName.trim(),
      adults,
      numChildren,
      childAges,
      largeBags,
      smallBags,
      pickup: pickup || null,
      carType: carType || null,
    });
  };

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Passenger &amp; Luggage Details</h2>
        <button className="btn-secondary btn-sm" onClick={onBack}>← Back</button>
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
              onChange={e => setAdults(Math.max(1, parseInt(e.target.value) || 1))}
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
            <label style={{ marginBottom: '0.5rem', display: 'block' }}>Children's Ages (Rule R1: 0 to 17)</label>
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
                    style={{ width: '65px' }}
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
              onChange={e => setLargeBags(Math.max(0, parseInt(e.target.value) || 0))}
            />
          </div>
          <div className="form-group">
            <label>🎒 Small Bags</label>
            <input
              className="input"
              type="number"
              min="0"
              value={smallBags}
              onChange={e => setSmallBags(Math.max(0, parseInt(e.target.value) || 0))}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Pickup Time (Local Airport Time)</label>
          <input
            className="input"
            type="datetime-local"
            value={pickup}
            onChange={e => setPickup(e.target.value)}
          />
          <span className="text-sm text-muted mt-1" style={{ display: 'block' }}>
            Rule R2: Must be at least 60 minutes after flight landing ({flight.arrival_local})
          </span>
        </div>

        <div className="form-group">
          <label>Preferred Vehicle Type (Good-to-Have G2)</label>
          <select className="input" value={carType} onChange={e => setCarType(e.target.value)}>
            <option value="">Any Vehicle Class (Recommended)</option>
            <option value="SEDAN">SEDAN</option>
            <option value="SUV">SUV</option>
            <option value="HATCHBACK">HATCHBACK</option>
            <option value="BUS">BUS</option>
          </select>
        </div>

        <button className="btn-primary" onClick={handleNext} style={{ width: '100%', marginTop: '1rem' }}>
          Continue to Pricing →
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Price Selection ───────────────────────────────────────────────────
function PriceStep({ flight, hotel, passengers, onSubmit, onBack }) {
  const [route, setRoute] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(true);
  const [routeError, setRouteError] = useState('');
  const [priceInr, setPriceInr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ airport: flight.to, city: hotel.city, area: hotel.area || '' });
    apiFetch(`/api/routes?${params}`)
      .then(data => {
        setRoute(data);
        const minP = data.price_min_inr || data.min_price_inr;
        if (minP) setPriceInr(String(minP));
      })
      .catch(e => setRouteError(e.message))
      .finally(() => setLoadingRoute(false));
  }, [flight, hotel]);

  const handleSubmit = async () => {
    const price = parseFloat(priceInr);
    if (isNaN(price)) { setError('Please enter a valid price in INR'); return; }

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
        hotel_id: hotel.hotel_id || hotel.name,
        adults: passengers.adults,
        child_ages: passengers.childAges.map(a => parseInt(a) || 0),
        large_bags: passengers.largeBags,
        small_bags: passengers.smallBags,
        car_type: passengers.carType || null,
        traveler_name: passengers.travelerName,
        price_inr: price,
      };
      if (passengers.pickup) payload.pickup = passengers.pickup;

      const result = await apiFetch('/api/requests', { method: 'POST', body: JSON.stringify(payload) });

      // Robust extraction of request ID from top-level or request object
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
        <h2 className="section-title">Set Your Budget &amp; Confirm</h2>
        <button className="btn-secondary btn-sm" onClick={onBack}>← Back</button>
      </div>

      {error && <div className="alert-error">⚠️ {error}</div>}

      <div className="card" style={{ maxWidth: '580px', margin: '0 auto' }}>
        {loadingRoute ? (
          <div className="loading-container"><div className="loading-spinner" /><span>Calculating route fare bounds…</span></div>
        ) : routeError ? (
          <div className="alert-error">⚠️ {routeError}</div>
        ) : route ? (
          <div style={{ marginBottom: '1.5rem' }}>
            <div className="price-range" style={{ padding: '1rem', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
              <div style={{ fontSize: '0.85rem', color: '#047857', fontWeight: 600 }}>OFFICIAL ROUTE FARE BOUNDS (RULE R3)</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#065f46', marginTop: '0.25rem' }}>
                INR {minPrice?.toLocaleString()} – {maxPrice?.toLocaleString()}
              </div>
            </div>
            {route.drive_minutes && (
              <div className="text-sm text-muted mt-2">
                🕐 Estimated drive time: <strong>{route.drive_minutes} minutes</strong> ({route.distance_km} km)
              </div>
            )}
          </div>
        ) : null}

        <div className="form-group">
          <label>Your Proposed Price (INR) *</label>
          <input
            className="input"
            type="number"
            min={minPrice || 0}
            max={maxPrice}
            value={priceInr}
            onChange={e => setPriceInr(e.target.value)}
            placeholder="Enter price in INR within route bounds"
            style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e293b' }}
          />
        </div>

        <button className="btn-primary" onClick={handleSubmit} disabled={submitting} style={{ width: '100%', padding: '0.85rem' }}>
          {submitting ? <><span className="loading-spinner" style={{ width: '1rem', height: '1rem' }} /> Submitting Request…</> : '🚕 Submit Ride Request'}
        </button>
      </div>
    </div>
  );
}

// ── Step 5: Request Submitted ─────────────────────────────────────────────────
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

// ── Step 6: Taxi Offers (Real-time 3s auto-sync) ──────────────────────────────
export function OffersStep({ requestId, onBooked }) {
  const [offers, setOffers] = useState([]);
  const [requestDetails, setRequestDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState('');
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'
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
            const isOffered = offer.status === 'OFFERED';
            return (
              <div key={offer.offer_id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderLeft: isOffered ? '4px solid #2563eb' : '4px solid #cbd5e1' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '1.15rem' }}>
                      {offer.company_name || offer.company_id}
                    </span>
                    <Badge status={offer.status} />
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

// ── Step 7: Booking Confirmed ─────────────────────────────────────────────────
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
          <Link href="/traveler" className="btn-secondary">
            Book Another Ride
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Main Traveler Page (with URL & LocalStorage persistence) ─────────────────
export default function TravelerPage() {
  const [step, setStep] = useState(0);
  const [flight, setFlight] = useState(null);
  const [hotel, setHotel] = useState(null);
  const [passengers, setPassengers] = useState(null);
  const [requestId, setRequestId] = useState(null);
  const [booking, setBooking] = useState(null);

  // Read URL query params on initial load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlReq = params.get('request_id');
      const urlStep = params.get('step');

      if (urlReq) {
        setRequestId(urlReq);
        window.localStorage.setItem('rideport_request_id', urlReq);
        setStep(5); // Directly jump to Offers step
      } else if (urlStep === 'offers') {
        const cached = window.localStorage.getItem('rideport_request_id');
        if (cached) {
          setRequestId(cached);
          setStep(5);
        }
      }
    }
  }, []);

  const handleRequestSubmitted = (result, reqId) => {
    setRequestId(reqId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('rideport_request_id', reqId);
      window.history.pushState({}, '', `/traveler?step=submitted&request_id=${reqId}`);
    }
    setStep(4);
  };

  const handleViewOffers = () => {
    if (typeof window !== 'undefined' && requestId) {
      window.history.pushState({}, '', `/traveler?step=offers&request_id=${requestId}`);
    }
    setStep(5);
  };

  return (
    <div className="page-container">
      <StepsBar current={step} />

      {step === 0 && (
        <FlightStep onSelect={f => { setFlight(f); setStep(1); }} />
      )}
      {step === 1 && (
        <HotelStep flight={flight} onSelect={h => { setHotel(h); setStep(2); }} onBack={() => setStep(0)} />
      )}
      {step === 2 && (
        <PassengerStep flight={flight} hotel={hotel} onNext={p => { setPassengers(p); setStep(3); }} onBack={() => setStep(1)} />
      )}
      {step === 3 && (
        <PriceStep flight={flight} hotel={hotel} passengers={passengers} onSubmit={handleRequestSubmitted} onBack={() => setStep(2)} />
      )}
      {step === 4 && (
        <SubmittedStep requestId={requestId} onViewOffers={handleViewOffers} />
      )}
      {step === 5 && (
        <OffersStep requestId={requestId} onBooked={b => { setBooking(b); setStep(6); }} />
      )}
      {step === 6 && (
        <BookingConfirmedStep booking={booking} />
      )}
    </div>
  );
}
