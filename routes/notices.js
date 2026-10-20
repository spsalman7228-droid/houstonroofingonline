/**
 * routes/notices.js
 * In-app notifications and announcements feed.
 */

const express = require('express');
const router = express.Router();
const { getFirestore } = require('../lib/firebase');
const { requireAuth } = require('../lib/auth');

/**
 * GET /api/notices
 * Public announcements feed
 */
router.get('/', async (req, res) => {
  const db = getFirestore();
  const now = new Date().toISOString();
  try {
    const snap = await db.collection('announcements').get();
    const notices = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((n) => {
        if (n.startAt && n.startAt > now) return false;
        if (n.endAt && n.endAt < now) return false;
        return true;
      });

    notices.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    res.json({ notices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/notices/notifications
 * In-app notifications for authenticated user
 */
router.get('/notifications', requireAuth, async (req, res) => {
  const db = getFirestore();
  const uid = req.user.uid;

  try {
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.collection('notifications').get();
    const items = snap.docs.map((d) => d.data());
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const unreadCount = items.filter((n) => !n.read).length;

    res.json({
      notifications: items,
      unreadCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/notices/notifications/:nid/read
 * Mark notification as read
 */
router.patch('/notifications/:nid/read', requireAuth, async (req, res) => {
  const db = getFirestore();
  const uid = req.user.uid;
  const nid = req.params.nid;

  try {
    const notifRef = db.collection('users').doc(uid).collection('notifications').doc(nid);
    await notifRef.update({ read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
