/**
 * routes/bookings.js
 * Online appointment booking engine with transactional double-booking prevention,
 * capacity management, cancellation/rescheduling, and .ics calendar exports.
 */

const express = require('express');
const router = express.Router();
const { getFirestore } = require('../lib/firebase');
const { requireAuth } = require('../lib/auth');
const { createBookingSchema, rescheduleSchema } = require('../lib/validators');
const {
  calculateAvailableSlots,
  getBookingSettings,
  formatSlotKey,
  isChangeAllowed,
  toSlotDateTime
} = require('../lib/slots');
const { generateIcs, generateGoogleCalendarUrl } = require('../lib/ics');

/**
 * GET /api/slots?date=YYYY-MM-DD&type=free-inspection
 * Return available slots for a given date and service type.
 */
router.get('/slots', async (req, res) => {
  const { date, type } = req.query;
  if (!date || !type) {
    return res.status(400).json({ error: 'Query parameters date and type are required' });
  }

  const db = getFirestore();
  try {
    const result = await calculateAvailableSlots(db, date, type);
    res.json(result);
  } catch (err) {
    console.error('Failed to compute slots:', err);
    res.status(500).json({ error: 'Failed to compute availability: ' + err.message });
  }
});

/**
 * POST /api/bookings
 * Atomic slot booking in a Firestore transaction.
 */
router.post('/', requireAuth, async (req, res) => {
  // 1. Zod input validation (including honeypot check)
  const parseResult = createBookingSchema.safeParse(req.body);
  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0]?.message || 'Validation error';
    return res.status(400).json({ error: firstError, details: parseResult.error.format() });
  }

  const bookingData = parseResult.data;
  const db = getFirestore();
  const uid = req.user.uid;

  try {
    const settings = await getBookingSettings(db);
    const maxActive = settings.maxActiveAppointmentsPerUser || 3;

    // 2. Check active upcoming appointments count for this user
    const userApptsSnap = await db
      .collection('appointments')
      .where('uid', '==', uid)
      .get();

    const nowIso = new Date().toISOString();
    const activeUpcoming = userApptsSnap.docs.filter((d) => {
      const data = d.data();
      const isActive = data.status === 'confirmed' || data.status === 'pending';
      const isFuture = data.startAt >= nowIso;
      return isActive && isFuture;
    });

    if (activeUpcoming.length >= maxActive) {
      return res.status(400).json({
        error: `You already have ${activeUpcoming.length} active upcoming appointments. Maximum allowed is ${maxActive}.`
      });
    }

    const typeConfig = (settings.appointmentTypes || []).find((t) => t.key === bookingData.type) || {
      durationMinutes: 60,
      capacityPerSlot: 2,
      label: 'Free roof inspection',
      autoConfirm: true
    };

    const capacity = typeConfig.capacityPerSlot || 1;
    const { localString, utcTimestamp } = toSlotDateTime(bookingData.date, bookingData.time);
    const endTimestamp = new Date(
      new Date(utcTimestamp).getTime() + (typeConfig.durationMinutes || 60) * 60000
    ).toISOString();

    const appointmentId = 'appt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    // 3. Run Firestore transaction to check and lock slot
    let chosenSlotKey = null;

    await db.runTransaction(async (transaction) => {
      // Find an open capacity index for this slot
      let openIndex = null;
      for (let i = 1; i <= capacity; i++) {
        const key = formatSlotKey(bookingData.date, bookingData.time, bookingData.type, i);
        const slotRef = db.collection('slots').doc(key);
        const slotDoc = await transaction.get(slotRef);
        if (!slotDoc.exists) {
          openIndex = i;
          chosenSlotKey = key;
          break;
        }
      }

      if (!openIndex) {
        throw new Error('This time slot is no longer available. Please select another time.');
      }

      // Reserve slot
      const slotRef = db.collection('slots').doc(chosenSlotKey);
      transaction.set(slotRef, {
        appointmentId,
        uid,
        startAt: utcTimestamp,
        type: bookingData.type,
        createdAt: new Date().toISOString()
      });

      // Create appointment
      const apptRef = db.collection('appointments').doc(appointmentId);
      const newAppointment = {
        id: appointmentId,
        uid,
        slotKey: chosenSlotKey,
        type: bookingData.type,
        typeLabel: typeConfig.label,
        startAt: utcTimestamp,
        endAt: endTimestamp,
        tz: settings.timezone || 'America/Chicago',
        localDate: bookingData.date,
        localTime: bookingData.time,
        status: typeConfig.autoConfirm ? 'confirmed' : 'pending',
        customerName: bookingData.name,
        customerEmail: bookingData.email,
        customerPhone: bookingData.phone,
        propertyType: bookingData.propertyType,
        serviceType: bookingData.serviceType,
        address: bookingData.address,
        notes: bookingData.notes || '',
        howDidYouHear: bookingData.howDidYouHear || '',
        consentAt: new Date().toISOString(),
        consentVersion: bookingData.consentVersion,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      transaction.set(apptRef, newAppointment);
    });

    // 4. Update user contact info in users/{uid}
    try {
      const userDocRef = db.collection('users').doc(uid);
      await userDocRef.set(
        {
          displayName: bookingData.name,
          phone: bookingData.phone,
          addresses: [bookingData.address],
          consentAt: new Date().toISOString()
        },
        { merge: true }
      );

      // 5. In-app notification
      const notifRef = userDocRef.collection('notifications').doc();
      await notifRef.set({
        id: notifRef.id,
        uid,
        title: 'Appointment Confirmed',
        body: `Your ${typeConfig.label} is scheduled for ${bookingData.date} at ${bookingData.time}.`,
        link: `/dashboard`,
        read: false,
        createdAt: new Date().toISOString()
      });
    } catch (notifErr) {
      console.warn('Notification creation notice:', notifErr.message);
    }

    const fullAppt = {
      id: appointmentId,
      type: bookingData.type,
      typeLabel: typeConfig.label,
      startAt: utcTimestamp,
      endAt: endTimestamp,
      date: bookingData.date,
      time: bookingData.time,
      address: bookingData.address,
      status: typeConfig.autoConfirm ? 'confirmed' : 'pending'
    };

    return res.status(201).json({
      success: true,
      appointment: fullAppt,
      googleCalendarUrl: generateGoogleCalendarUrl(fullAppt),
      icsUrl: `/api/bookings/${appointmentId}/ics`
    });
  } catch (err) {
    console.error('Booking failed:', err.message);
    return res.status(409).json({ error: err.message });
  }
});

/**
 * GET /api/bookings
 * Returns authenticated customer's appointments
 */
router.get('/', requireAuth, async (req, res) => {
  const db = getFirestore();
  const uid = req.user.uid;

  try {
    const snap = await db.collection('appointments').where('uid', '==', uid).get();
    const appts = snap.docs.map((d) => d.data());
    appts.sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
    res.json({ appointments: appts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch appointments: ' + err.message });
  }
});

/**
 * GET /api/bookings/:id
 * Get single appointment details
 */
router.get('/:id', requireAuth, async (req, res) => {
  const db = getFirestore();
  try {
    const doc = await db.collection('appointments').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    const data = doc.data();
    if (data.uid !== req.user.uid && req.user.role !== 'staff' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({
      appointment: data,
      googleCalendarUrl: generateGoogleCalendarUrl(data),
      icsUrl: `/api/bookings/${data.id}/ics`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/bookings/:id/ics
 * Downloadable .ics calendar event
 */
router.get('/:id/ics', async (req, res) => {
  const db = getFirestore();
  try {
    const doc = await db.collection('appointments').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).send('Appointment not found');
    }
    const data = doc.data();
    const icsContent = generateIcs(data);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="houston-roofing-${data.id}.ics"`);
    return res.send(icsContent);
  } catch (err) {
    return res.status(500).send('Error generating calendar file');
  }
});

/**
 * POST /api/bookings/:id/cancel
 * Cancel appointment (checks 24h cutoff, runs in transaction releasing slot)
 */
router.post('/:id/cancel', requireAuth, async (req, res) => {
  const db = getFirestore();
  const appointmentId = req.params.id;

  try {
    await db.runTransaction(async (transaction) => {
      const apptRef = db.collection('appointments').doc(appointmentId);
      const apptDoc = await transaction.get(apptRef);
      if (!apptDoc.exists) {
        throw new Error('Appointment not found');
      }
      const data = apptDoc.data();

      // Check ownership
      if (data.uid !== req.user.uid && req.user.role !== 'staff' && req.user.role !== 'admin') {
        throw new Error('Unauthorized');
      }

      // Check 24-hour cutoff for customers
      if (req.user.role !== 'admin' && !isChangeAllowed(data.startAt, 24)) {
        throw new Error('Appointments cannot be cancelled within 24 hours of the scheduled time.');
      }

      // Release slot document
      if (data.slotKey) {
        const slotRef = db.collection('slots').doc(data.slotKey);
        transaction.delete(slotRef);
      }

      // Mark appointment as cancelled
      transaction.update(apptRef, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: req.user.uid,
        updatedAt: new Date().toISOString()
      });
    });

    return res.json({ success: true, message: 'Appointment successfully cancelled.' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/bookings/:id/reschedule
 * Reschedule appointment (checks 24h cutoff, releases old slot, locks new slot in transaction)
 */
router.post('/:id/reschedule', requireAuth, async (req, res) => {
  const parseResult = rescheduleSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Invalid parameters' });
  }

  const { date, time } = parseResult.data;
  const db = getFirestore();
  const appointmentId = req.params.id;

  try {
    const settings = await getBookingSettings(db);

    await db.runTransaction(async (transaction) => {
      const apptRef = db.collection('appointments').doc(appointmentId);
      const apptDoc = await transaction.get(apptRef);
      if (!apptDoc.exists) {
        throw new Error('Appointment not found');
      }
      const existing = apptDoc.data();

      // Check ownership
      if (existing.uid !== req.user.uid && req.user.role !== 'staff' && req.user.role !== 'admin') {
        throw new Error('Unauthorized');
      }

      // Check 24-hour cutoff on existing appointment
      if (req.user.role !== 'admin' && !isChangeAllowed(existing.startAt, 24)) {
        throw new Error('Appointments cannot be rescheduled within 24 hours of scheduled time.');
      }

      const typeConfig = (settings.appointmentTypes || []).find((t) => t.key === existing.type) || {
        durationMinutes: 60,
        capacityPerSlot: 2
      };
      const capacity = typeConfig.capacityPerSlot || 1;

      // Find open slot index on new date/time
      let newSlotKey = null;
      for (let i = 1; i <= capacity; i++) {
        const candidateKey = formatSlotKey(date, time, existing.type, i);
        const candRef = db.collection('slots').doc(candidateKey);
        const candDoc = await transaction.get(candRef);
        if (!candDoc.exists) {
          newSlotKey = candidateKey;
          break;
        }
      }

      if (!newSlotKey) {
        throw new Error('The selected new time slot is fully booked. Please choose another.');
      }

      // Release old slot
      if (existing.slotKey) {
        transaction.delete(db.collection('slots').doc(existing.slotKey));
      }

      const { localString, utcTimestamp } = toSlotDateTime(date, time);
      const endTimestamp = new Date(
        new Date(utcTimestamp).getTime() + (typeConfig.durationMinutes || 60) * 60000
      ).toISOString();

      // Reserve new slot
      transaction.set(db.collection('slots').doc(newSlotKey), {
        appointmentId,
        uid: req.user.uid,
        startAt: utcTimestamp,
        type: existing.type,
        createdAt: new Date().toISOString()
      });

      // Update appointment
      transaction.update(apptRef, {
        slotKey: newSlotKey,
        startAt: utcTimestamp,
        endAt: endTimestamp,
        localDate: date,
        localTime: time,
        status: 'rescheduled',
        updatedAt: new Date().toISOString()
      });
    });

    return res.json({ success: true, message: 'Appointment successfully rescheduled.' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
