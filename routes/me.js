/**
 * routes/me.js
 * Authenticated user profile and session status.
 */

const express = require('express');
const router = express.Router();
const { getFirestore } = require('../lib/firebase');
const { requireAuth } = require('../lib/auth');

router.get('/', async (req, res) => {
  if (!req.user) {
    return res.json({ authenticated: false, user: null });
  }

  const db = getFirestore();
  try {
    const doc = await db.collection('users').doc(req.user.uid).get();
    const data = doc.exists ? doc.data() : {};

    // Get unread notification count
    let unreadCount = 0;
    try {
      const notifsSnap = await db.collection('users').doc(req.user.uid).collection('notifications').get();
      unreadCount = notifsSnap.docs.filter((d) => !d.data().read).length;
    } catch (e) {}

    return res.json({
      authenticated: true,
      user: {
        uid: req.user.uid,
        email: req.user.email,
        displayName: data.displayName || req.user.displayName || 'Customer',
        phone: data.phone || null,
        role: data.role || req.user.role || 'customer',
        addresses: data.addresses || [],
        unreadCount
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/', requireAuth, async (req, res) => {
  const db = getFirestore();
  const uid = req.user.uid;
  const { displayName, phone, address } = req.body;

  try {
    const updates = {};
    if (displayName) updates.displayName = displayName.trim();
    if (phone) updates.phone = phone.trim();
    if (address) {
      const userDoc = await db.collection('users').doc(uid).get();
      const addresses = (userDoc.exists && userDoc.data().addresses) || [];
      updates.addresses = [address, ...addresses.slice(0, 4)];
    }

    await db.collection('users').doc(uid).update(updates);
    return res.json({ success: true, message: 'Profile updated' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
