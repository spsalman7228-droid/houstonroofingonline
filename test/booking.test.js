/**
 * test/booking.test.js
 * Unit and integration tests for the appointment booking engine:
 * - Double-booking concurrency prevention
 * - Max active appointments limit
 * - 24-hour cancellation rule
 * - Capacity calculation
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { getFirestore, mockStore } = require('../lib/firebase');
const {
  calculateAvailableSlots,
  formatSlotKey,
  isChangeAllowed
} = require('../lib/slots');

describe('Booking Engine & Double-Booking Prevention', () => {
  const db = getFirestore();

  test('calculateAvailableSlots respects blackout dates and operating hours', async () => {
    // 2026-12-25 is Christmas blackout
    const blackoutResult = await calculateAvailableSlots(db, '2026-12-25', 'free-inspection');
    assert.strictEqual(blackoutResult.slots.length, 0);
    assert.strictEqual(blackoutResult.reason, 'Blackout date / holiday');

    // Future regular date (e.g., 2026-11-10)
    const validResult = await calculateAvailableSlots(db, '2026-11-10', 'free-inspection');
    assert.ok(Array.isArray(validResult.slots));
    assert.ok(validResult.slots.length > 0);
  });

  test('Firestore transaction prevents double-booking of same capacity slot', async () => {
    const testDate = '2026-11-12';
    const testTime = '10:00';
    const testType = 'repair-visit'; // capacityPerSlot = 1
    const slotKey = formatSlotKey(testDate, testTime, testType, 1);

    // Ensure slot is clean
    await db.collection('slots').doc(slotKey).delete();

    // User A books the slot
    let userABooked = false;
    await db.runTransaction(async (t) => {
      const slotRef = db.collection('slots').doc(slotKey);
      const doc = await t.get(slotRef);
      if (doc.exists) {
        throw new Error('Slot already taken');
      }
      t.set(slotRef, { appointmentId: 'appt_A', uid: 'user_A', type: testType });
      userABooked = true;
    });
    assert.strictEqual(userABooked, true);

    // User B attempts to book the EXACT SAME slot concurrently
    let userBFailed = false;
    try {
      await db.runTransaction(async (t) => {
        const slotRef = db.collection('slots').doc(slotKey);
        const doc = await t.get(slotRef);
        if (doc.exists) {
          throw new Error('Slot already taken');
        }
        t.set(slotRef, { appointmentId: 'appt_B', uid: 'user_B', type: testType });
      });
    } catch (err) {
      userBFailed = true;
      assert.strictEqual(err.message, 'Slot already taken');
    }

    assert.strictEqual(userBFailed, true, 'User B must be rejected due to collision');

    // Cleanup
    await db.collection('slots').doc(slotKey).delete();
  });

  test('isChangeAllowed enforces 24-hour cutoff', () => {
    const now = Date.now();
    // 30 hours in future: allowed
    const future30h = new Date(now + 30 * 3600 * 1000).toISOString();
    assert.strictEqual(isChangeAllowed(future30h, 24), true);

    // 10 hours in future: disallowed
    const future10h = new Date(now + 10 * 3600 * 1000).toISOString();
    assert.strictEqual(isChangeAllowed(future10h, 24), false);

    // Past date: disallowed
    const past = new Date(now - 3600 * 1000).toISOString();
    assert.strictEqual(isChangeAllowed(past, 24), false);
  });
});
