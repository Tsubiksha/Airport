'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname() || '';

  const isSupplier = pathname.startsWith('/supplier');
  const isTraveler = pathname.startsWith('/traveler') || pathname === '/lookup' || pathname === '/change';

  return (
    <nav className="nav">
      <div className="nav-inner">
        {/* Brand / Logo */}
        <Link href="/" className="nav-logo">
          ✈️ Ride<span>Port</span>
          {isSupplier && (
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f59e0b', marginLeft: '0.6rem', padding: '0.15rem 0.5rem', background: 'rgba(245, 158, 11, 0.15)', borderRadius: '6px' }}>
              🚕 Supplier Operations
            </span>
          )}
          {isTraveler && (
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2563eb', marginLeft: '0.6rem', padding: '0.15rem 0.5rem', background: 'rgba(37, 99, 235, 0.1)', borderRadius: '6px' }}>
              👤 Traveler
            </span>
          )}
        </Link>

        {/* Dynamic Context-Aware Role Navigation */}
        <ul className="nav-links">
          {isSupplier ? (
            <>
              <li><Link href="/supplier">Dispatch Dashboard</Link></li>
              <li>
                <Link
                  href="/"
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.85rem',
                    color: '#64748b'
                  }}
                >
                  Exit / Switch Role ⇄
                </Link>
              </li>
            </>
          ) : isTraveler ? (
            <>
              <li><Link href="/traveler">Book a Ride</Link></li>
              <li><Link href="/lookup">Track Booking</Link></li>
              <li><Link href="/change">Change Request</Link></li>
              <li>
                <Link
                  href="/"
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.85rem',
                    color: '#64748b'
                  }}
                >
                  Switch Role ⇄
                </Link>
              </li>
            </>
          ) : (
            <>
              <li><Link href="/traveler" className="font-semibold text-primary">Traveler Portal</Link></li>
              <li><Link href="/supplier" className="font-semibold" style={{ color: '#d97706' }}>Supplier Portal</Link></li>
              <li><Link href="/lookup">Track Booking</Link></li>
            </>
          )}
        </ul>
      </div>
    </nav>
  );
}
