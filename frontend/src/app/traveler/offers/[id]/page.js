'use client';

import { useState } from 'react';
import Link from 'next/link';
import { OffersStep } from '../../page';

export default function DedicatedOffersPage({ params }) {
  const requestId = params.id;
  const [booking, setBooking] = useState(null);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (booking?.booking_number) {
      navigator.clipboard.writeText(booking.booking_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (booking) {
    return (
      <div className="page-container" style={{ maxWidth: '580px', margin: '2rem auto', textAlign: 'center' }}>
        <div className="card">
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎊</div>
          <h2 className="section-title" style={{ marginBottom: '0.5rem', color: '#16a34a' }}>Booking Confirmed!</h2>
          <p className="text-muted text-sm mb-4">Your taxi transfer is booked. Save your 10-digit booking number.</p>
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

  return (
    <div className="page-container">
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href="/traveler" className="btn-secondary btn-sm">
          ← Book Another Ride
        </Link>
      </div>
      <OffersStep requestId={requestId} onBooked={b => setBooking(b)} />
    </div>
  );
}
