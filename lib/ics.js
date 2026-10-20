/**
 * lib/ics.js
 * RFC 5545 iCalendar (.ics) string generator for appointment confirmations.
 */

function formatIcsDate(date) {
  const d = new Date(date);
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function generateIcs(appointment) {
  const {
    id = 'appt_' + Date.now(),
    typeLabel = 'Roof Inspection',
    startAt,
    endAt,
    address = {},
    notes = ''
  } = appointment;

  const dtStart = formatIcsDate(startAt);
  const dtEnd = formatIcsDate(endAt || new Date(new Date(startAt).getTime() + 60 * 60000));
  const dtStamp = formatIcsDate(new Date());

  const locationStr = address.street
    ? `${address.street}, ${address.city || 'Houston'}, ${address.state || 'TX'} ${address.zip || ''}`
    : '11330 West Rd, Houston, TX 77065';

  const descriptionStr = [
    `Houston Roofing & Construction: ${typeLabel}`,
    `Location: ${locationStr}`,
    `Phone: (832) 237-3737`,
    notes ? `Client Notes: ${notes}` : '',
    `Track your appointment live on your customer dashboard: https://houstonroofingonline.com/dashboard`
  ].filter(Boolean).join('\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Houston Roofing & Construction//Appointment Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${id}@houstonroofingonline.com`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:Houston Roofing - ${typeLabel}`,
    `DESCRIPTION:${descriptionStr}`,
    `LOCATION:${locationStr}`,
    'STATUS:CONFIRMED',
    'ORGANIZER;CN=Houston Roofing & Construction:mailto:contact@houstonroofingonline.com',
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder: Houston Roofing Inspection tomorrow',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

/**
 * Generates direct Google Calendar link
 */
function generateGoogleCalendarUrl(appointment) {
  const {
    typeLabel = 'Roof Inspection',
    startAt,
    endAt,
    address = {}
  } = appointment;

  const dtStart = formatIcsDate(startAt);
  const dtEnd = formatIcsDate(endAt || new Date(new Date(startAt).getTime() + 60 * 60000));

  const locationStr = address.street
    ? `${address.street}, ${address.city || 'Houston'}, ${address.state || 'TX'} ${address.zip || ''}`
    : 'Houston, TX';

  const details = encodeURIComponent(
    `Houston Roofing & Construction appointment. Phone: (832) 237-3737. Manage at /dashboard`
  );

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    'Houston Roofing - ' + typeLabel
  )}&dates=${dtStart}/${dtEnd}&details=${details}&location=${encodeURIComponent(locationStr)}`;
}

module.exports = {
  generateIcs,
  generateGoogleCalendarUrl
};
