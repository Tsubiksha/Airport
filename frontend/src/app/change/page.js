'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';

function Badge({ status }) {
  const cls = {
    BOOKED: 'badge-booked',
    WAITING: 'badge-waiting',
    ACCEPTED: 'badge-booked',
    REJECTED: 'badge-rejected',
  }[status] || 'badge-waiting';
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function ChangeRequestPage() {
  const [bookingNumber, setBookingNumber] = useState('');
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Flight catalog for selecting new flight
  const [flights, setFlights] = useState([]);
  const [loadingFlights, setLoadingFlights] = useState(false);

  // Form states
  const [newFlightId, setNewFlightId] = useState('');
  const [newPickup, setNewPickup] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [changeResult, setChangeResult] = useState(null);
  const [submitError, setSubmitError] = useState('');

  // Load booking if number in URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const bkg = params.get('number');
      if (bkg) {
        setBookingNumber(bkg);
        loadBooking(bkg);
      }
    }
    // Load flight catalog
    setLoadingFlights(true);
    apiFetch('/api/catalog/flights')
      .then(setFlights)
      .catch(() => {})
      .finally(() => setLoadingFlights(false));
  }, []);

  const loadBooking = async (number) => {
    const num = (number || bookingNumber).trim();
    if (!num || !/^\d{10}$/.test(num)) {
      setError('Please enter a valid 10-digit booking number');
      return;
    }

    setError('');
    setLoading(true);
    setBooking(null);
    setChangeResult(null);

    try {
      const data = await apiFetch(`/api/bookings/${num}`);
      setBooking(data);
      if (data.flight) {
        setNewFlightId(data.flight.flight_id);
      }
      setNewPickup(data.pickup || '');
      if (data.active_change) {
        setChangeResult(data.active_change);
      } else if (data.latest_change) {
        setChangeResult(data.latest_change);
      }
    } catch (err) {
      setError(err.message || 'Booking not found');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitChange = async (e) => {
    e.preventDefault();
    if (!newFlightId && !newPickup) {
      setSubmitError('Please specify either a new flight or a new pickup time');
      return;
    }

    setSubmitError('');
    setSubmitting(true);

    try {
      const payload = {};
      if (newFlightId && newFlightId !== booking?.flight?.flight_id) {
        payload.new_flight_id = newFlightId;
      }
      if (newPickup) {
        payload.new_pickup = newPickup;
      }

      const res = await apiFetch(`/api/bookings/${booking.booking_number}/change-requests`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setChangeResult(res.change_request);
    } catch (err) {
      setSubmitError(err.message || 'Failed to submit change request');
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-sync change status every 3 seconds while booking is active
  useEffect(() => {
    if (!booking?.booking_number) return;

    const interval = setInterval(async () => {
      try {
        const updatedBooking = await apiFetch(`/api/bookings/${booking.booking_number}`);
        setBooking(updatedBooking);
        if (updatedBooking.latest_change) {
          setChangeResult(updatedBooking.latest_change);
        }
      } catch {}
    }, 3000);

    return () => clearInterval(interval);
  }, [booking?.booking_number]);

  return (
    <div className="page-container" style={{ maxWidth: '800px' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 className="section-title">Modify Booking / Change Request</h1>
        <p className="text-muted">Need to change your flight or arrival pickup time? Submit a request to your taxi supplier.</p>
      </div>

      {/* Step 1: Booking Lookup */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 className="card-title" style={{ marginBottom: '1rem' }}>1. Find Your Booking</h2>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            className="input"
            type="text"
            placeholder="10-digit booking number (e.g. 5489201943)"
            value={bookingNumber}
            onChange={(e) => {
              setBookingNumber(e.target.value.replace(/\D/g, '').slice(0, 10));
              setError('');
            }}
            maxLength={10}
            style={{ flex: 1, letterSpacing: '0.05em' }}
          />
          <button className="btn-primary" onClick={() => loadBooking()} disabled={loading}>
            {loading ? 'Loading…' : 'Load Booking'}
          </button>
        </div>
        {error && <div className="alert-error" style={{ marginTop: '1rem' }}>⚠️ {error}</div>}
      </div>

      {/* Step 2: Show Current Details & Change Form */}
      {booking && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
            <div>
              <span className="text-sm text-muted">Current Booking</span>
              <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{booking.booking_number} ({booking.traveler_name})</div>
            </div>
            <Badge status={booking.status} />
          </div>

          {/* Current Booking Summary */}
          <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#475569', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Current Booking Details
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <span className="text-muted text-sm">Flight:</span>
                <div><strong>{booking.flight?.flight_id || 'N/A'}</strong> ({booking.flight?.from} → {booking.flight?.to})</div>
                <div className="text-sm text-muted">Landing: {booking.flight?.arrival_local}</div>
              </div>
              <div>
                <span className="text-muted text-sm">Hotel:</span>
                <div><strong>{booking.hotel?.name || 'N/A'}</strong></div>
                <div className="text-sm text-muted">{booking.hotel?.area}, {booking.hotel?.city}</div>
              </div>
              <div>
                <span className="text-muted text-sm">Pickup Time:</span>
                <div><strong style={{ color: '#2563eb' }}>{booking.pickup}</strong></div>
              </div>
              <div>
                <span className="text-muted text-sm">Assigned Vehicle:</span>
                <div><code>{booking.vehicle_id}</code> ({booking.supplier})</div>
              </div>
            </div>
          </div>

          {/* If change already requested */}
          {changeResult ? (
            <div
              className="card"
              style={{
                background: changeResult.status === 'ACCEPTED' ? '#f0fdf4' : changeResult.status === 'REJECTED' ? '#fef2f2' : '#fffbeb',
                border: changeResult.status === 'ACCEPTED' ? '1px solid #86efac' : changeResult.status === 'REJECTED' ? '1px solid #fca5a5' : '1px solid #fcd34d',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.8rem' }}>
                    {changeResult.status === 'ACCEPTED' ? '✅' : changeResult.status === 'REJECTED' ? '❌' : '⏳'}
                  </span>
                  <div>
                    <h3 style={{ margin: 0, color: changeResult.status === 'ACCEPTED' ? '#16a34a' : changeResult.status === 'REJECTED' ? '#dc2626' : '#b45309' }}>
                      {changeResult.status === 'ACCEPTED'
                        ? 'Change Request Accepted'
                        : changeResult.status === 'REJECTED'
                        ? 'Change Request Rejected by Supplier'
                        : 'Change Request Pending Approval'}
                    </h3>
                    <p className="text-sm text-muted" style={{ margin: 0 }}>
                      Request ID: <strong>{changeResult.change_id}</strong>
                    </p>
                  </div>
                </div>
                {changeResult.status === 'WAITING' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#b45309', background: '#fef3c7', padding: '0.2rem 0.6rem', borderRadius: '999px', fontWeight: 600 }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#b45309', display: 'inline-block' }} />
                    Live Syncing (3s)
                  </span>
                )}
              </div>

              <div style={{ background: 'white', padding: '1rem', borderRadius: '6px', marginBottom: '1.25rem', border: '1px solid #e2e8f0' }}>
                <div className="info-row" style={{ marginBottom: '0.5rem' }}>
                  <span className="text-muted text-sm">Decision Status:</span>
                  <Badge status={changeResult.status} />
                </div>
                <div className="info-row" style={{ marginBottom: '0.5rem' }}>
                  <span className="text-muted text-sm">Proposed Flight:</span>
                  <strong>{changeResult.new_flight_id || 'Same Flight'}</strong>
                </div>
                <div className="info-row" style={{ marginBottom: '0.5rem' }}>
                  <span className="text-muted text-sm">Proposed Pickup:</span>
                  <strong style={{ color: '#2563eb' }}>{changeResult.new_pickup}</strong>
                </div>
                {changeResult.remarks && (
                  <div className="info-row">
                    <span className="text-muted text-sm">Supplier Remarks:</span>
                    <strong style={{ color: changeResult.status === 'REJECTED' ? '#dc2626' : '#1e293b' }}>
                      {changeResult.remarks}
                    </strong>
                  </div>
                )}
                {changeResult.decided_at && (
                  <div className="info-row" style={{ marginTop: '0.4rem' }}>
                    <span className="text-muted text-sm">Decided At:</span>
                    <span className="text-sm">{new Date(changeResult.decided_at).toLocaleString()}</span>
                  </div>
                )}
              </div>

              <p className="text-sm text-muted" style={{ marginBottom: '1.5rem' }}>
                {changeResult.status === 'ACCEPTED'
                  ? 'Your flight and pickup schedule have been updated in the database and confirmed with the supplier.'
                  : changeResult.status === 'REJECTED'
                  ? 'The supplier was unable to accommodate the proposed change. Your existing booking remains active and unchanged.'
                  : 'Your request has been dispatched to the taxi supplier. As soon as the supplier reviews it, this page will update automatically.'}
              </p>

              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <Link href={`/lookup?number=${booking.booking_number}`} className="btn-primary">
                  View Booking Status →
                </Link>
                {changeResult.status !== 'WAITING' && (
                  <button className="btn-secondary" onClick={() => setChangeResult(null)}>
                    Propose Another Change
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Change Proposal Form */
            <form onSubmit={handleSubmitChange}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem' }}>
                Propose New Flight or Pickup
              </h3>

              {submitError && (
                <div className="alert-error" style={{ marginBottom: '1.5rem' }}>
                  ⚠️ {submitError}
                </div>
              )}

              {/* New Flight */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label className="label">
                  New Flight (Optional)
                  <span className="text-muted text-sm" style={{ fontWeight: 'normal', marginLeft: '0.5rem' }}>
                    Must arrive at an airport serving {booking.hotel?.city}
                  </span>
                </label>
                <select
                  className="input"
                  value={newFlightId}
                  onChange={(e) => setNewFlightId(e.target.value)}
                >
                  <option value="">-- Keep Current Flight ({booking.flight?.flight_id}) --</option>
                  {flights.map((f) => (
                    <option key={f.flight_id} value={f.flight_id}>
                      {f.flight_id} - {f.airline} ({f.from} → {f.to}) | Arrives: {f.arrival_local}
                    </option>
                  ))}
                </select>
              </div>

              {/* New Pickup Time */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label className="label">
                  New Pickup Datetime
                  <span className="text-muted text-sm" style={{ fontWeight: 'normal', marginLeft: '0.5rem' }}>
                    Rule R2: Must be at least 60 minutes after flight landing
                  </span>
                </label>
                <input
                  type="datetime-local"
                  className="input"
                  value={newPickup ? newPickup.slice(0, 16) : ''}
                  onChange={(e) => setNewPickup(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
                <Link href={`/lookup?number=${booking.booking_number}`} className="btn-secondary">
                  Cancel
                </Link>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting…' : '📤 Submit Change Request'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
