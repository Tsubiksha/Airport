import './globals.css';
import Navbar from '../components/Navbar';

export const metadata = {
  title: 'RidePort – Airport Taxi Ride Offers Platform',
  description: 'Book professional airport taxi services or dispatch fleet vehicles across Asia & Middle East',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main style={{ flex: 1 }}>
          {children}
        </main>
        <footer className="footer">
          <p>© 2026 RidePort — Airport Taxi Ride Offers Platform</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#64748b' }}>
            <a href="/traveler">Traveler Experience</a> · <a href="/supplier">Supplier Experience</a> · <a href="/lookup">Track 10-Digit Booking</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
