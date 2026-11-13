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
    CANCELLED: 'badge-rejected',
  }[status] || 'badge-waiting';
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function BookingLookupPage() {
  const [bookingNumber, setBookingNumber] = useState('');
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  // Check URL params on load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const bkg = params.get('number');
      if (bkg) {
        setBookingNumber(bkg);
        fetchBooking(bkg);
      }
    }
  }, []);

  // Periodic auto-refresh every 3 seconds when booking is active
  useEffect(() => {
    if (!bookingNumber || !booking) return;
    const interval = setInterval(() => {
      if (/^\d{10}$/.test(bookingNumber)) {
        apiFetch(`/api/bookings/${bookingNumber}`)
          .then(data => setBooking(data))
          .catch(() => {});
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [bookingNumber, booking]);

  const fetchBooking = async (number) => {
    const trimmed = (number || bookingNumber).trim();
    if (!trimmed) {
      setError('Please enter a booking number');
      return;
    }
    if (!/^\d{10}$/.test(trimmed)) {
      setError('Booking number must contain exactly 10 digits');
      setBooking(null);
      setSearched(true);
      return;
    }

    setError('');
    setLoading(true);
    setSearched(true);
    setBooking(null);

    try {
      const data = await apiFetch(`/api/bookings/${trimmed}`);
      setBooking(data);
    } catch (err) {
      if (err.message && err.message.includes('404')) {
        setError('Booking not found');
      } else {
        setError(err.message || 'Booking not found');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchBooking();
  };

  return (
    <div className="page-container" style={{ maxWidth: '720px' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 className="section-title">Track Your Booking</h1>
        <p className="text-muted">Enter your unique 10-digit booking number to view ride details or request changes.</p>
      </div>

      <form onSubmit={handleSearch} className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            className="input"
            type="text"
            placeholder="Enter 10-digit booking number (e.g. 5489201943)"
            value={bookingNumber}
            onChange={(e) => {
              setBookingNumber(e.target.value.replace(/\D/g, '').slice(0, 10));
              setError('');
            }}
            style={{ flex: 1, fontSize: '1.1rem', letterSpacing: '0.05em' }}
            maxLength={10}
          />
          <button type="submit" className="btn-primary" disabled={loading} style={{ minWidth: '120px' }}>
            {loading ? 'Searching…' : '🔍 Track'}
          </button>
        </div>
      </form>

      {error && (
        <div className="alert-error" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          ⚠️ {error}
        </div>
      )}

      {loading && (
        <div className="loading-container">
          <div className="loading-spinner" />
          <span>Retrieving booking details…</span>
        </div>
      )}

      {!loading && searched && !booking && !error && (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <p>Booking not found</p>
          <span className="text-sm text-muted">Please double-check the 10-digit number and try again.</span>
        </div>
      )}

      {booking && (
        <div className="card" style={{ borderTop: '4px solid #2563eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <span className="text-sm text-muted">Booking Reference</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e293b', letterSpacing: '0.05em' }}>
                {booking.booking_number}
              </div>
            </div>
            <Badge status={booking.status} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Traveler & Route */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.75rem', color: '#1e293b' }}>👤 Traveler &amp; Pickup</div>
              <div className="info-row" style={{ marginBottom: '0.4rem' }}>
                <span className="text-muted text-sm">Traveler Name:</span>
                <strong>{booking.traveler_name}</strong>
              </div>
              <div className="info-row" style={{ marginBottom: '0.4rem' }}>
                <span className="text-muted text-sm">Scheduled Pickup:</span>
                <strong>{booking.pickup}</strong>
              </div>
              <div className="info-row">
                <span className="text-muted text-sm">Confirmed Fare:</span>
                <strong style={{ color: '#2563eb' }}>INR {Number(booking.price_inr).toLocaleString()}</strong>
              </div>
            </div>

            {/* Flight Details */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.75rem', color: '#1e293b' }}>✈️ Flight Information</div>
              {booking.flight ? (
                <>
                  <div className="info-row" style={{ marginBottom: '0.4rem' }}>
                    <span className="text-muted text-sm">Flight ID:</span>
                    <strong>{booking.flight.flight_id} ({booking.flight.airline || 'Airline'})</strong>
                  </div>
                  <div className="info-row" style={{ marginBottom: '0.4rem' }}>
                    <span className="text-muted text-sm">Route:</span>
                    <span>{booking.flight.from} → <strong>{booking.flight.to}</strong></span>
                  </div>
                  <div className="info-row">
                    <span className="text-muted text-sm">Scheduled Landing:</span>
                    <span>{booking.flight.arrival_local}</span>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted">Flight info available on arrival</div>
              )}
            </div>
          </div>

          {/* Hotel & Vehicle */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.75rem', color: '#1e293b' }}>🏨 Destination Hotel</div>
              {booking.hotel ? (
                <>
                  <div className="info-row" style={{ marginBottom: '0.4rem' }}>
                    <span className="text-muted text-sm">Hotel Name:</span>
                    <strong>{booking.hotel.name}</strong>
                  </div>
                  <div className="info-row">
                    <span className="text-muted text-sm">Location:</span>
                    <span>{booking.hotel.area}, {booking.hotel.city}</span>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted">Hotel details not specified</div>
              )}
            </div>

            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.75rem', color: '#1e293b' }}>🚕 Assigned Taxi</div>
              <div className="info-row" style={{ marginBottom: '0.4rem' }}>
                <span className="text-muted text-sm">Supplier:</span>
                <strong>{booking.supplier || 'Sakura Cabs'}</strong>
              </div>
              <div className="info-row">
                <span className="text-muted text-sm">Vehicle ID:</span>
                <code>{booking.vehicle_id}</code>
              </div>
            </div>
          </div>

          {/* Change Requests Section */}
          {booking.change_requests && booking.change_requests.length > 0 && (
            <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', marginBottom: '2rem', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ fontWeight: 700, color: '#1e293b' }}>🔄 Flight &amp; Pickup Change Requests</div>
                <span className="text-sm text-muted">Total: {booking.change_requests.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {booking.change_requests.map((chg) => (
                  <div key={chg.change_id} style={{ background: 'white', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{chg.change_id}</span>
                        <Badge status={chg.status} />
                      </div>
                      <div className="text-sm text-muted" style={{ marginTop: '0.2rem' }}>
                        Flight: <strong>{chg.new_flight_id || 'Same'}</strong> · Pickup: <strong>{chg.new_pickup}</strong>
                        {chg.remarks && <span> · Remarks: <em>{chg.remarks}</em></span>}
                      </div>
                    </div>
                    {chg.decided_at && (
                      <span className="text-sm text-muted">
                        {new Date(chg.decided_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
            <Link href={`/change?number=${booking.booking_number}`} className="btn-secondary">
              ✏️ Request Flight/Pickup Change
            </Link>
            <Link href="/traveler" className="btn-primary">
              Book Another Ride
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
