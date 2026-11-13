import Link from 'next/link';

export default function Home() {
  return (
    <>
      {/* Hero with Two Separate Role Portals */}
      <section className="hero">
        <div className="hero-inner">
          <div style={{ display: 'inline-block', padding: '0.35rem 1rem', background: 'rgba(255,255,255,0.15)', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem', letterSpacing: '0.05em' }}>
            AIRPORT TAXI RIDE OFFERS PLATFORM
          </div>
          <h1 style={{ fontSize: '3rem', fontWeight: 900, marginBottom: '0.75rem' }}>✈️ RidePort</h1>
          <p style={{ fontSize: '1.25rem', opacity: 0.9, maxWidth: '640px', margin: '0 auto 2.5rem auto', lineHeight: 1.5 }}>
            Direct marketplace connecting arriving airline passengers with verified local fleet suppliers.
          </p>

          {/* Two Distinct Role Choices */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', maxWidth: '720px', margin: '0 auto', textAlign: 'left' }}>
            {/* Role 1: Traveler */}
            <div style={{ background: '#ffffff', color: '#1e293b', padding: '2rem', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>👤</div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem' }}>
                  Continue as Traveler
                </h2>
                <p style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                  Request an airport pickup, receive live competing offers from verified taxi fleets, choose your vehicle, and secure your 10-digit booking reference.
                </p>
              </div>
              <Link
                href="/traveler"
                className="btn-primary"
                style={{ width: '100%', textAlign: 'center', padding: '0.85rem', fontSize: '1rem', fontWeight: 700 }}
              >
                🚕 Enter Traveler Portal →
              </Link>
            </div>

            {/* Role 2: Supplier */}
            <div style={{ background: '#ffffff', color: '#1e293b', padding: '2rem', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏢</div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem' }}>
                  Continue as Supplier
                </h2>
                <p style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                  Access the live dispatch console, review matching passenger requests adhering to operating rules (R4–R7), submit competitive vehicle offers, and manage booking changes.
                </p>
              </div>
              <Link
                href="/supplier"
                className="btn-secondary"
                style={{ width: '100%', textAlign: 'center', padding: '0.85rem', fontSize: '1rem', fontWeight: 700, borderColor: '#d97706', color: '#d97706', background: '#fffbeb' }}
              >
                🚕 Enter Supplier Portal →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="how-it-works">
        <div className="how-it-works-inner">
          <div className="section-heading">
            <h2>Two Roles · One Unified Platform</h2>
            <p>Real-time coordination powered by FastAPI and MySQL</p>
          </div>
          <div className="grid-3">
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="feature-icon">📝</div>
              <h3 className="card-title">1. Traveler Broadcast</h3>
              <p className="text-muted text-sm">Traveler inputs flight, hotel, luggage, and proposed budget. Request is validated and stored in MySQL.</p>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="feature-icon">⚡</div>
              <h3 className="card-title">2. Supplier Dispatch</h3>
              <p className="text-muted text-sm">Eligible suppliers instantly see the request on their dispatch screen, assign a suitable vehicle, and submit an offer.</p>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="feature-icon">🔒</div>
              <h3 className="card-title">3. Instant Confirmation</h3>
              <p className="text-muted text-sm">Traveler selects the best offer with 1 click. Unique 10-digit booking number is generated and vehicle buffer window is locked.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
