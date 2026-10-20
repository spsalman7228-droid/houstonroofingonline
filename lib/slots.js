/**
 * lib/slots.js
 * Availability calculation and double-booking slot reservation logic.
 */

const fs = require('fs');
const path = require('path');

let cachedSettings = null;

function loadDefaultSettings() {
  if (!cachedSettings) {
    const file = path.join(__dirname, '..', 'content', 'settings.json');
    if (fs.existsSync(file)) {
      cachedSettings = JSON.parse(fs.readFileSync(file, 'utf8')).booking;
    }
  }
  return cachedSettings || {
    timezone: 'America/Chicago',
    slotIntervalMinutes: 30,
    minLeadHours: 12,
    maxDaysAhead: 60,
    cancelOrRescheduleCutoffHours: 24,
    weeklyHours: {
      mon: [['08:00', '18:00']],
      tue: [['08:00', '18:00']],
      wed: [['08:00', '18:00']],
      thu: [['08:00', '18:00']],
      fri: [['08:00', '18:00']],
      sat: [['08:00', '16:00']],
      sun: [['10:00', '16:00']]
    },
    blackoutDates: [],
    appointmentTypes: []
  };
}

async function getBookingSettings(db) {
  try {
    const doc = await db.collection('settings').doc('booking').get();
    if (doc.exists) {
      return { ...loadDefaultSettings(), ...doc.data() };
    }
  } catch (e) {
    // Fallback to local defaults
  }
  return loadDefaultSettings();
}

/**
 * Convert Date or YYYY-MM-DD + HH:mm to UTC string and Chicago local
 */
function toSlotDateTime(dateStr, timeStr) {
  // Houston is America/Chicago (UTC-5 or UTC-6)
  // Construct ISO timestamp approximation
  const localIso = `${dateStr}T${timeStr}:00`;
  const dateObj = new Date(localIso);
  return {
    localString: `${dateStr} ${timeStr}`,
    utcTimestamp: dateObj.toISOString()
  };
}

/**
 * Returns available slots for a given date string (YYYY-MM-DD) and appointment type
 */
async function calculateAvailableSlots(db, dateStr, typeKey) {
  const settings = await getBookingSettings(db);
  const now = new Date();

  const typeConfig = (settings.appointmentTypes || []).find((t) => t.key === typeKey) || {
    durationMinutes: 60,
    capacityPerSlot: 2
  };

  // 1. Check blackout dates
  const isBlackout = (settings.blackoutDates || []).some((b) => b.date === dateStr);
  if (isBlackout) {
    return { slots: [], reason: 'Blackout date / holiday' };
  }

  // 2. Validate maxDaysAhead and minLeadHours
  const targetDate = new Date(`${dateStr}T00:00:00`);
  const diffDays = Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0 || diffDays > (settings.maxDaysAhead || 60)) {
    return { slots: [], reason: 'Date outside booking window' };
  }

  // 3. Get day of week
  const daysMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayKey = daysMap[targetDate.getDay()];
  const hoursRanges = (settings.weeklyHours && settings.weeklyHours[dayKey]) || [];

  if (hoursRanges.length === 0) {
    return { slots: [], reason: 'No operating hours on this day' };
  }

  // 4. Generate all candidate time slots for the day
  const interval = settings.slotIntervalMinutes || 30;
  const candidateTimes = [];

  for (const [startH, endH] of hoursRanges) {
    const [startHour, startMin] = startH.split(':').map(Number);
    const [endHour, endMin] = endH.split(':').map(Number);

    let currentMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    while (currentMinutes + typeConfig.durationMinutes <= endMinutes) {
      const hh = String(Math.floor(currentMinutes / 60)).padStart(2, '0');
      const mm = String(currentMinutes % 60).padStart(2, '0');
      candidateTimes.push(`${hh}:${mm}`);
      currentMinutes += interval;
    }
  }

  // 5. Query existing active slot locks for this date & type
  const prefix = `${dateStr}_`;
  let existingSlots = [];
  try {
    const snapshot = await db.collection('slots').get();
    existingSlots = snapshot.docs
      .map((d) => d.id)
      .filter((id) => id.startsWith(prefix) && id.includes(`_${typeKey}_`));
  } catch (err) {
    console.warn('Could not query slots table:', err.message);
  }

  // Count taken slots per time
  const takenCountByTime = {};
  for (const slotKey of existingSlots) {
    // format: YYYY-MM-DD_HHmm_type_slotIndex
    const parts = slotKey.split('_');
    if (parts.length >= 3) {
      const rawTime = parts[1]; // e.g. "0830"
      const formattedTime = `${rawTime.substring(0, 2)}:${rawTime.substring(2, 4)}`;
      takenCountByTime[formattedTime] = (takenCountByTime[formattedTime] || 0) + 1;
    }
  }

  // 6. Filter by minLeadHours and capacity
  const minLeadMs = (settings.minLeadHours || 12) * 60 * 60 * 1000;
  const availableSlots = [];

  for (const time of candidateTimes) {
    const slotDateTime = new Date(`${dateStr}T${time}:00`);
    if (slotDateTime.getTime() - now.getTime() < minLeadMs) {
      continue; // Too soon
    }

    const taken = takenCountByTime[time] || 0;
    const capacity = typeConfig.capacityPerSlot || 1;
    const remaining = capacity - taken;

    if (remaining > 0) {
      availableSlots.push({
        time,
        date: dateStr,
        capacityRemaining: remaining,
        durationMinutes: typeConfig.durationMinutes,
        label: `${time} (${remaining} open)`
      });
    }
  }

  return { slots: availableSlots, timezone: settings.timezone || 'America/Chicago' };
}

/**
 * Generate slot key for transactional reservation
 * format: YYYY-MM-DD_HHmm_type_index
 */
function formatSlotKey(dateStr, timeStr, typeKey, index = 1) {
  const cleanTime = timeStr.replace(':', '');
  return `${dateStr}_${cleanTime}_${typeKey}_${index}`;
}

/**
 * Check if cancellation or reschedule is allowed (> 24 hours ahead)
 */
function isChangeAllowed(appointmentStartIso, cutoffHours = 24) {
  const start = new Date(appointmentStartIso).getTime();
  const now = Date.now();
  const diffHours = (start - now) / (1000 * 60 * 60);
  return diffHours >= cutoffHours;
}

module.exports = {
  getBookingSettings,
  calculateAvailableSlots,
  formatSlotKey,
  isChangeAllowed,
  toSlotDateTime
};
