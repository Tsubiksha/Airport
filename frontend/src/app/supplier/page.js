'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api';

function Badge({ status }) {
  const cls = {
    OFFERED: 'badge-offered',
    BOOKED: 'badge-booked',
    REJECTED: 'badge-rejected',
    NOT_CHOSEN: 'badge-not-chosen',
    WAITING: 'badge-waiting',
    ACCEPTED: 'badge-booked',
    OPEN: 'badge-open',
  }[status] || 'badge-waiting';
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function SupplierPortalPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);
  const [activeTab, setActiveTab] = useState('requests'); // 'requests' | 'offers' | 'changes'

  // Tab 1: Eligible Requests
  const [eligibleData, setEligibleData] = useState(null);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [assignForm, setAssignForm] = useState({}); // { [req_id]: { vehicle_id, price_inr } }
  const [assignStatus, setAssignStatus] = useState({}); // { [req_id]: { loading, error, success } }

  // Tab 2: Offers
  const [offers, setOffers] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(false);

  // Tab 3: Change Requests
  const [changes, setChanges] = useState([]);
  const [loadingChanges, setLoadingChanges] = useState(false);
  const [decisionStatus, setDecisionStatus] = useState({}); // { [chg_id]: { loading, error, success } }
  const [lastSync, setLastSync] = useState(null);

  // Load suppliers
  useEffect(() => {
    apiFetch('/api/suppliers')
      .then((data) => setSuppliers(data))
      .catch((err) => console.error('Failed to load suppliers:', err))
      .finally(() => setLoadingSuppliers(false));
  }, []);

  // Fetch Eligible Requests for selected supplier
  const fetchRequests = useCallback(async (companyId, silent = false) => {
    if (!silent) setLoadingRequests(true);
    try {
      const data = await apiFetch(`/api/suppliers/${companyId}/requests`);
      setEligibleData(data);
      setLastSync(new Date());
    } catch (err) {
      console.error('Failed to load supplier requests:', err);
    } finally {
      if (!silent) setLoadingRequests(false);
    }
  }, []);

  // Fetch Offers for selected supplier
  const fetchOffers = useCallback(async (companyId, silent = false) => {
    if (!silent) setLoadingOffers(true);
    try {
      const data = await apiFetch(`/api/suppliers/${companyId}/offers`);
      setOffers(data.offers || []);
    } catch (err) {
      console.error('Failed to load offers:', err);
    } finally {
      if (!silent) setLoadingOffers(false);
    }
  }, []);

  // Fetch Change Requests for selected supplier
  const fetchChanges = useCallback(async (companyId, silent = false) => {
    if (!silent) setLoadingChanges(true);
    try {
      const data = await apiFetch(`/api/suppliers/${companyId}/change-requests`);
      setChanges(data.change_requests || []);
    } catch (err) {
      console.error('Failed to load change requests:', err);
    } finally {
      if (!silent) setLoadingChanges(false);
    }
  }, []);

  // Real-time automatic synchronization: initial load + 3-second polling
  useEffect(() => {
    if (selectedSupplier) {
      const companyId = selectedSupplier.company_id;
      // Immediate load
      fetchRequests(companyId, false);
      fetchOffers(companyId, false);
      fetchChanges(companyId, false);

      // 3-second periodic polling for instant updates without page refresh
      const interval = setInterval(() => {
        fetchRequests(companyId, true);
        fetchOffers(companyId, true);
        fetchChanges(companyId, true);
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [selectedSupplier, fetchRequests, fetchOffers, fetchChanges]);

  // Handle vehicle assignment submit
  const handleAssignVehicle = async (requestId) => {
    const form = assignForm[requestId] || {};
    if (!form.vehicle_id) {
      setAssignStatus((prev) => ({
        ...prev,
        [requestId]: { error: 'Please select a vehicle' },
      }));
      return;
    }
    if (!form.price_inr || Number(form.price_inr) <= 0) {
      setAssignStatus((prev) => ({
        ...prev,
        [requestId]: { error: 'Please enter a valid price in INR' },
      }));
      return;
    }

    setAssignStatus((prev) => ({
      ...prev,
      [requestId]: { loading: true, error: null, success: null },
    }));

    try {
      const res = await apiFetch(
        `/api/suppliers/${selectedSupplier.company_id}/requests/${requestId}/offers`,
        {
          method: 'POST',
          body: JSON.stringify({
            vehicle_id: form.vehicle_id,
            price_inr: Number(form.price_inr),
          }),
        }
      );

      setAssignStatus((prev) => ({
        ...prev,
        [requestId]: {
          loading: false,
          success: `Offer created successfully! Offer ID: ${res.offer?.offer_id}`,
        },
      }));

      // Clear input fields for this request
      setAssignForm((prev) => ({
        ...prev,
        [requestId]: { vehicle_id: '', price_inr: '' },
      }));

      // Refresh offers and requests
      fetchOffers(selectedSupplier.company_id, true);
      fetchRequests(selectedSupplier.company_id, true);
    } catch (err) {
      setAssignStatus((prev) => ({
        ...prev,
        [requestId]: {
          loading: false,
          error: err.message || 'Failed to assign vehicle',
        },
      }));
    }
  };

  // Handle Change Request decision
  const handleDecision = async (changeId, decision) => {
    setDecisionStatus((prev) => ({
      ...prev,
      [changeId]: { loading: true, error: null },
    }));

    try {
      await apiFetch(`/api/change-requests/${changeId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });

      setDecisionStatus((prev) => ({
        ...prev,
        [changeId]: { loading: false, success: `Change ${decision.toLowerCase()}` },
      }));

      // Refresh changes
      fetchChanges(selectedSupplier.company_id);
    } catch (err) {
      setDecisionStatus((prev) => ({
        ...prev,
        [changeId]: { loading: false, error: err.message },
      }));
    }
  };

  // View: Supplier Selection
  if (!selectedSupplier) {
    return (
      <div className="page-container">
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 className="section-title">Supplier Operations Portal</h1>
          <p className="text-muted">Select your taxi company to access your dispatch dashboard, view eligible passenger requests, and submit offers.</p>
        </div>

        {loadingSuppliers ? (
          <div className="loading-container">
            <div className="loading-spinner" />
            <span>Loading registered taxi companies…</span>
          </div>
        ) : (
          <div className="grid-3">
            {suppliers.map((s) => (
              <div
                key={s.company_id}
                className="card card-clickable"
                onClick={() => setSelectedSupplier(s)}
                style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div className="card-title" style={{ fontSize: '1.2rem', marginBottom: 0 }}>
                      {s.name}
                    </div>
                    <span className="badge badge-booked">★ {s.rating}</span>
                  </div>
                  <div className="text-sm text-muted" style={{ marginBottom: '0.5rem' }}>
                    ID: <code>{s.company_id}</code>
                  </div>
                  <div className="info-row" style={{ marginBottom: '0.4rem' }}>
                    <span className="text-muted text-sm">Airports:</span>
                    <strong>{s.airports?.join(', ')}</strong>
                  </div>
                  <div className="info-row" style={{ marginBottom: '0.4rem' }}>
                    <span className="text-muted text-sm">Hours:</span>
                    <span>{s.service_from} – {s.service_until}</span>
                  </div>
                  <div className="info-row">
                    <span className="text-muted text-sm">Fleet:</span>
                    <span>{s.vehicles?.length || 0} vehicles</span>
                  </div>
                </div>

                <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9', textAlign: 'right' }}>
                  <button className="btn-primary btn-sm">Enter Dashboard →</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Count metrics
  const eligibleCount = eligibleData?.requests?.length || 0;
  const offersCount = offers.length;
  const bookedCount = offers.filter((o) => o.status === 'BOOKED').length;
  const pendingChangesCount = changes.filter((c) => c.status === 'WAITING').length;

  return (
    <div className="page-container">
      {/* Supplier Header */}
      <div className="card" style={{ marginBottom: '2rem', background: '#1e293b', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Active Dispatch Session
            </span>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0.25rem 0', color: 'white' }}>
              🚕 {selectedSupplier.name}
            </h1>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', fontSize: '0.9rem', color: '#cbd5e1', flexWrap: 'wrap' }}>
              <span>Airports: <strong>{selectedSupplier.airports?.join(', ')}</strong></span>
              <span>Hours: <strong>{selectedSupplier.service_from}–{selectedSupplier.service_until}</strong></span>
              <span>Rating: <strong>★ {selectedSupplier.rating}</strong></span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#4ade80', background: 'rgba(34, 197, 94, 0.2)', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                Live Sync (3s)
              </span>
            </div>
          </div>
          <button
            className="btn-secondary"
            onClick={() => setSelectedSupplier(null)}
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
          >
            Switch Company ⇄
          </button>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid-3" style={{ marginBottom: '2rem' }}>
        <div className="card" style={{ textAlign: 'center', borderLeft: '4px solid #2563eb' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#2563eb' }}>{eligibleCount}</div>
          <div className="text-muted text-sm font-semibold">Eligible Passenger Requests</div>
        </div>
        <div className="card" style={{ textAlign: 'center', borderLeft: '4px solid #16a34a' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#16a34a' }}>{bookedCount}</div>
          <div className="text-muted text-sm font-semibold">Confirmed Bookings</div>
        </div>
        <div className="card" style={{ textAlign: 'center', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f59e0b' }}>{pendingChangesCount}</div>
          <div className="text-muted text-sm font-semibold">Pending Change Requests</div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem' }}>
        <button
          className={activeTab === 'requests' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
          onClick={() => setActiveTab('requests')}
        >
          📥 Eligible Requests ({eligibleCount})
        </button>
        <button
          className={activeTab === 'offers' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
          onClick={() => setActiveTab('offers')}
        >
          🏷️ My Offers ({offersCount})
        </button>
        <button
          className={activeTab === 'changes' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
          onClick={() => setActiveTab('changes')}
        >
          🔄 Change Requests ({pendingChangesCount})
        </button>
      </div>

      {/* Tab 1: Eligible Requests */}
      {activeTab === 'requests' && (
        <div>
          {/* Search Toolbar */}
          <div style={{ marginBottom: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px' }}>
              <input
                type="text"
                className="input"
                placeholder="🔍 Search requests by ID (e.g. REQ-...), traveler name, flight, or hotel..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ fontSize: '0.9rem' }}
              />
            </div>
            {searchTerm && (
              <button className="btn-secondary btn-sm" onClick={() => setSearchTerm('')}>
                ✕ Clear Filter
              </button>
            )}
            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
              Sorted newest first · Real-time 3s sync
            </div>
          </div>

          {loadingRequests ? (
            <div className="loading-container">
              <div className="loading-spinner" />
              <span>Matching eligible requests based on operating rules (R4–R6)…</span>
            </div>
          ) : eligibleCount === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <p>No eligible requests at this time</p>
              <span className="text-sm text-muted">
                Requests appear here when airport coverage, destination area, operating hours, and vehicle availability align.
              </span>
            </div>
          ) : (
            <div>
              {eligibleData.requests
                .filter(({ request: req }) => {
                  if (!searchTerm) return true;
                  const term = searchTerm.toLowerCase();
                  return (
                    req.request_id?.toLowerCase().includes(term) ||
                    req.traveler_name?.toLowerCase().includes(term) ||
                    req.flight_id?.toLowerCase().includes(term) ||
                    req.hotel_id?.toLowerCase().includes(term)
                  );
                })
                .map(({ request: req, available_vehicles, existing_offers }) => {
                const form = assignForm[req.request_id] || {};
                const status = assignStatus[req.request_id] || {};

                return (
                  <div key={req.request_id} className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #2563eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'monospace', color: '#1e293b' }}>
                            {req.request_id}
                          </span>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => {
                              navigator.clipboard.writeText(req.request_id);
                              alert(`Copied Request ID: ${req.request_id}`);
                            }}
                          >
                            📋 Copy ID
                          </button>
                          <Badge status={req.status || 'OPEN'} />
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginTop: '0.35rem' }}>
                          👤 {req.traveler_name}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="text-muted text-sm">Traveler Budget</span>
                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#2563eb' }}>
                          INR {Number(req.price_inr).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Existing offers notice for this supplier */}
                    {existing_offers && existing_offers.length > 0 && (
                      <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#065f46', marginBottom: '0.25rem' }}>
                          🏷️ You already submitted {existing_offers.length} offer(s) for this request:
                        </div>
                        {existing_offers.map(o => (
                          <div key={o.offer_id} style={{ fontSize: '0.85rem', color: '#047857', display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.2rem' }}>
                            <span>• Offer <strong>{o.offer_id}</strong> (Vehicle: <strong>{o.vehicle_id}</strong>, Price: <strong>INR {Number(o.price_inr).toLocaleString()}</strong>)</span>
                            <Badge status={o.status} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Request Details Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem' }}>
                      <div>
                        <span className="text-muted text-sm">Flight &amp; Landing:</span>
                        <div><strong>{req.flight_id}</strong> (Airport: <strong>{req.airport}</strong>)</div>
                        <div className="text-sm text-muted">Pickup: <strong>{req.pickup}</strong></div>
                      </div>
                      <div>
                        <span className="text-muted text-sm">Destination Hotel:</span>
                        <div><strong>{req.hotel_id}</strong></div>
                      </div>
                      <div>
                        <span className="text-muted text-sm">Passengers:</span>
                        <div>
                          <strong>{req.adults} Adults</strong>
                          {req.child_ages?.length > 0 && <span>, {req.child_ages.length} Children (Ages: {req.child_ages.join(', ')})</span>}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted text-sm">Luggage:</span>
                        <div>🧳 {req.large_bags} Large · 🎒 {req.small_bags} Small</div>
                      </div>
                    </div>

                    {/* Status alerts */}
                    {status.error && <div className="alert-error" style={{ marginBottom: '1rem' }}>⚠️ {status.error}</div>}
                    {status.success && <div className="alert-success" style={{ marginBottom: '1rem' }}>✅ {status.success}</div>}

                    {/* Vehicle Assignment Form */}
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', color: '#1e293b' }}>
                        🚗 Assign Vehicle &amp; Submit Offer (Rule R7)
                      </h4>

                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 1 240px' }}>
                          <label className="label" style={{ fontSize: '0.85rem' }}>Select Suitable Vehicle</label>
                          <select
                            className="input"
                            value={form.vehicle_id || ''}
                            onChange={(e) =>
                              setAssignForm((prev) => ({
                                ...prev,
                                [req.request_id]: { ...form, vehicle_id: e.target.value },
                              }))
                            }
                          >
                            <option value="">-- Choose an available vehicle --</option>
                            {available_vehicles.map((v) => (
                              <option key={v.vehicle_id} value={v.vehicle_id}>
                                {v.vehicle_id} ({v.type}) — {v.seats} seats · {v.large_bags}L/{v.small_bags}S bags
                              </option>
                            ))}
                          </select>
                        </div>

                        <div style={{ flex: '1 1 180px' }}>
                          <label className="label" style={{ fontSize: '0.85rem' }}>Supplier Price (INR)</label>
                          <input
                            type="number"
                            className="input"
                            placeholder="e.g. 12000"
                            value={form.price_inr || ''}
                            onChange={(e) =>
                              setAssignForm((prev) => ({
                                ...prev,
                                [req.request_id]: { ...form, price_inr: e.target.value },
                              }))
                            }
                          />
                        </div>

                        <button
                          className="btn-primary"
                          onClick={() => handleAssignVehicle(req.request_id)}
                          disabled={status.loading}
                          style={{ padding: '0.65rem 1.5rem' }}
                        >
                          {status.loading ? 'Assigning…' : 'Submit Offer →'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: My Offers */}
      {activeTab === 'offers' && (
        <div>
          {loadingOffers ? (
            <div className="loading-container">
              <div className="loading-spinner" />
              <span>Loading submitted offers…</span>
            </div>
          ) : offers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🏷️</div>
              <p>No offers submitted yet</p>
              <span className="text-sm text-muted">Assign vehicles from the Eligible Requests tab to create offers.</span>
            </div>
          ) : (
            <div className="grid-2">
              {offers.map((offer) => (
                <div key={offer.offer_id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 800 }}>{offer.offer_id}</span>
                      <Badge status={offer.status} />
                    </div>
                    <div className="info-row" style={{ marginBottom: '0.4rem' }}>
                      <span className="text-muted text-sm">Request Ref:</span>
                      <code>{offer.request_id}</code>
                    </div>
                    <div className="info-row" style={{ marginBottom: '0.4rem' }}>
                      <span className="text-muted text-sm">Assigned Vehicle:</span>
                      <strong>{offer.vehicle_id}</strong>
                    </div>
                    <div className="info-row">
                      <span className="text-muted text-sm">Offered Price:</span>
                      <strong style={{ color: '#2563eb' }}>INR {Number(offer.price_inr).toLocaleString()}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Change Requests */}
      {activeTab === 'changes' && (
        <div>
          {loadingChanges ? (
            <div className="loading-container">
              <div className="loading-spinner" />
              <span>Loading change requests…</span>
            </div>
          ) : changes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔄</div>
              <p>No change requests for your fleet</p>
              <span className="text-sm text-muted">When travelers modify their flight or pickup time, you can accept or reject here.</span>
            </div>
          ) : (
            <div>
              {changes.map((chg) => {
                const status = decisionStatus[chg.change_id] || {};
                const isWaiting = chg.status === 'WAITING';

                return (
                  <div key={chg.change_id} className="card" style={{ marginBottom: '1.5rem', borderLeft: isWaiting ? '4px solid #f59e0b' : '4px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 800 }}>Change Request {chg.change_id}</span>
                          <Badge status={chg.status} />
                        </div>
                        <div className="text-sm text-muted" style={{ marginTop: '0.2rem' }}>
                          Booking Number: <strong>{chg.booking_number}</strong>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                      <div>
                        <span className="text-muted text-sm">Proposed Flight:</span>
                        <div><strong>{chg.new_flight_id || 'Same Flight'}</strong></div>
                      </div>
                      <div>
                        <span className="text-muted text-sm">Proposed Pickup Time:</span>
                        <div><strong style={{ color: '#2563eb' }}>{chg.new_pickup || 'Same Time'}</strong></div>
                      </div>
                    </div>

                    {status.error && <div className="alert-error" style={{ marginBottom: '1rem' }}>⚠️ {status.error}</div>}
                    {status.success && <div className="alert-success" style={{ marginBottom: '1rem' }}>✅ {status.success}</div>}

                    {isWaiting && (
                      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => handleDecision(chg.change_id, 'REJECTED')}
                          disabled={status.loading}
                        >
                          ✕ Reject Change
                        </button>
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => handleDecision(chg.change_id, 'ACCEPTED')}
                          disabled={status.loading}
                        >
                          ✓ Accept Change
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
