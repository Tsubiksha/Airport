/**
 * dateValidation.js - Dynamic timezone-aware datetime validation for RidePort.
 */

export const AIRPORT_TIMEZONES = {
  NRT: 'Asia/Tokyo',
  HND: 'Asia/Tokyo',
  KIX: 'Asia/Tokyo',
  ITM: 'Asia/Tokyo',
  BOM: 'Asia/Kolkata',
  DEL: 'Asia/Kolkata',
  BLR: 'Asia/Kolkata',
  MAA: 'Asia/Kolkata',
  DXB: 'Asia/Dubai',
  AUH: 'Asia/Dubai',
};

export function getAirportTimezone(airportCode) {
  return AIRPORT_TIMEZONES[(airportCode || '').toUpperCase()] || 'UTC';
}

/**
 * Get current date and time components in the airport's timezone.
 */
export function getAirportNowComponents(airportCode) {
  const tz = getAirportTimezone(airportCode);
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const map = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }
    // Note: in 24-hour format, midnight can be formatted as 24 in some engines; normalize
    const hour = map.hour === '24' ? '00' : map.hour;
    const dateStr = `${map.year}-${map.month}-${map.day}`;
    const timeStr = `${hour}:${map.minute}`;
    const isoLocal = `${dateStr}T${timeStr}`;

    const dateObj = new Date(
      parseInt(map.year, 10),
      parseInt(map.month, 10) - 1,
      parseInt(map.day, 10),
      parseInt(hour, 10),
      parseInt(map.minute, 10)
    );

    return {
      timezone: tz,
      dateStr,
      timeStr,
      isoLocal,
      dateObj,
    };
  } catch (e) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return {
      timezone: 'UTC',
      dateStr,
      timeStr,
      isoLocal: `${dateStr}T${timeStr}`,
      dateObj: d,
    };
  }
}

/**
 * Format Date to local YYYY-MM-DDTHH:mm string without timezone shift.
 */
export function formatLocalDatetime(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const year = dateObj.getFullYear();
  const month = pad(dateObj.getMonth() + 1);
  const day = pad(dateObj.getDate());
  const hours = pad(dateObj.getHours());
  const minutes = pad(dateObj.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Compute the landing datetime given a flight object and optional custom travel date (YYYY-MM-DD).
 */
export function resolveLandingDatetime(flight, travelDate) {
  if (!flight?.arrival_local) return null;
  const baseArr = flight.arrival_local; // e.g. "2027-04-10T10:30:00"
  const timePart = baseArr.includes('T') ? baseArr.split('T')[1].substring(0, 5) : '10:30';

  let datePart = '';
  if (travelDate && /^\d{4}-\d{2}-\d{2}$/.test(travelDate)) {
    datePart = travelDate;
  } else if (baseArr.includes('T')) {
    datePart = baseArr.split('T')[0];
  }

  if (!datePart) return null;
  return `${datePart}T${timePart}`;
}

/**
 * Validate flight travel date and landing time against airport local current time.
 */
export function validateFlightSchedule(flight, travelDate) {
  if (!flight) return { valid: false, error: 'No flight selected' };

  const airport = flight.to;
  const landingIso = resolveLandingDatetime(flight, travelDate);
  if (!landingIso) return { valid: false, error: 'Invalid flight landing details' };

  const airportNow = getAirportNowComponents(airport);
  const landingDatePart = landingIso.split('T')[0];
  const landingTimePart = landingIso.split('T')[1];

  // 1. Past flight date check
  if (landingDatePart < airportNow.dateStr) {
    return {
      valid: false,
      error: 'Selected flight date is in the past. Please select a future flight date.',
      landingIso,
    };
  }

  // 2. Same day, past landing time check
  if (landingDatePart === airportNow.dateStr && landingTimePart < airportNow.timeStr) {
    return {
      valid: false,
      error: 'Flight landing time has already passed. Please select a future flight.',
      landingIso,
    };
  }

  return { valid: true, error: '', landingIso };
}

/**
 * Validate pickup datetime against landing datetime and current airport time.
 */
export function validatePickupSchedule(airport, landingIso, pickupIso) {
  if (!pickupIso) {
    return { valid: false, error: 'Please enter a pickup date and time' };
  }

  // Guard against invalid zero dates
  if (
    pickupIso.startsWith('0000') ||
    pickupIso.startsWith('0001') ||
    pickupIso.includes('00:00:00') && pickupIso.startsWith('0000')
  ) {
    return { valid: false, error: 'Invalid pickup date/time format' };
  }

  const airportNow = getAirportNowComponents(airport);

  const landingDate = new Date(landingIso);
  const pickupDate = new Date(pickupIso);

  if (isNaN(landingDate.getTime()) || isNaN(pickupDate.getTime())) {
    return { valid: false, error: 'Invalid date format' };
  }

  // 1. Pickup cannot be in the past
  // Compare pickupDate timestamp with airportNow.dateObj
  if (pickupDate.getTime() < airportNow.dateObj.getTime() - 60000) { // 1 min grace for clock drift
    return { valid: false, error: 'Pickup time cannot be in the past.' };
  }

  // 2. Rule R2: Pickup at least 60 minutes after landing
  const minPickupTimestamp = landingDate.getTime() + 60 * 60 * 1000;
  if (pickupDate.getTime() < minPickupTimestamp) {
    return {
      valid: false,
      error: 'Pickup must be at least 60 minutes after flight landing (Rule R2).',
    };
  }

  return { valid: true, error: '' };
}

/**
 * Calculate the earliest valid suggested pickup time (landing + 60 mins).
 */
export function calculateSuggestedPickup(airport, landingIso) {
  if (!landingIso) return '';
  const landingDate = new Date(landingIso);
  if (isNaN(landingDate.getTime())) return '';

  const suggestedDate = new Date(landingDate.getTime() + 60 * 60 * 1000);
  const airportNow = getAirportNowComponents(airport);

  // If the flight landing or suggested pickup is in the past, do not generate an invalid pickup suggestion
  if (suggestedDate.getTime() < airportNow.dateObj.getTime()) {
    return '';
  }

  return formatLocalDatetime(suggestedDate);
}
