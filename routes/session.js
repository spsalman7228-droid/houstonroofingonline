/**
 * routes/session.js
 * Session management via Firebase Session Cookies.
 */

const express = require('express');
const router = express.Router();
const { getAuth, getFirestore } = require('../lib/firebase');
const { SESSION_COOKIE_NAME, ADMIN_EMAILS } = require('../lib/auth');

const EXPIRES_IN_MS = 60 * 60 * 24 * 14 * 1000; // 14 days

/**
 * POST /api/session
 * Mint session cookie from client Firebase ID token
 */
router.post('/', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: 'Missing idToken' });
  }

  const auth = getAuth();
  const db = getFirestore();

  try {
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: EXPIRES_IN_MS });
    const decoded = await auth.verifyIdToken(idToken);

    const email = (decoded.email || '').toLowerCase();
    let role = decoded.role || 'customer';

    if (email && ADMIN_EMAILS.includes(email) && role !== 'admin') {
      role = 'admin';
      try {
        await auth.setCustomUserClaims(decoded.uid, { role: 'admin' });
      } catch (e) {
        console.warn('Could not set custom claim for admin:', e.message);
      }
    }

    // Upsert users/{uid}
    const userRef = db.collection('users').doc(decoded.uid);
    const existing = await userRef.get();

    const userData = {
      uid: decoded.uid,
      email: decoded.email || null,
      displayName: decoded.name || decoded.displayName || 'Customer',
      phone: decoded.phone_number || decoded.phone || null,
      photoURL: decoded.picture || decoded.photoURL || null,
      role: existing.exists && existing.data().role ? existing.data().role : role,
      lastLoginAt: new Date().toISOString()
    };

    if (!existing.exists) {
      userData.createdAt = new Date().toISOString();
      userData.addresses = [];
      await userRef.set(userData);
    } else {
      await userRef.update({
        lastLoginAt: userData.lastLoginAt,
        role: userData.role
      });
    }

    // Set secure HttpOnly cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie(SESSION_COOKIE_NAME, sessionCookie, {
      maxAge: EXPIRES_IN_MS,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/'
    });

    return res.json({
      success: true,
      user: {
        uid: decoded.uid,
        email: decoded.email,
        displayName: userData.displayName,
        role: userData.role
      }
    });
  } catch (err) {
    console.error('Session creation failed:', err.message);
    return res.status(401).json({ error: 'Unauthorized token: ' + err.message });
  }
});

/**
 * POST /api/session/demo-login
 * Instant demo login for local preview and testing (customer or admin)
 */
router.post('/demo-login', async (req, res) => {
  const { role = 'customer', email } = req.body;
  const isTargetAdmin = role === 'admin' || (email && ADMIN_EMAILS.includes(email.toLowerCase()));

  const uid = isTargetAdmin ? 'demo-admin-uid' : 'demo-customer-uid';
  const targetEmail = isTargetAdmin
    ? (email || 'admin@houstonroofingonline.com')
    : (email || 'customer@example.com');
  const targetRole = isTargetAdmin ? 'admin' : 'customer';
  const displayName = isTargetAdmin ? 'Admin Manager' : 'Jane Doe';

  const db = getFirestore();
  const userRef = db.collection('users').doc(uid);
  await userRef.set(
    {
      uid,
      email: targetEmail,
      displayName,
      role: targetRole,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    },
    { merge: true }
  );

  const auth = getAuth();
  const demoToken = isTargetAdmin ? 'demo-admin-token' : 'demo-customer-token';
  const sessionCookie = await auth.createSessionCookie(demoToken, { expiresIn: EXPIRES_IN_MS });

  res.cookie(SESSION_COOKIE_NAME, sessionCookie, {
    maxAge: EXPIRES_IN_MS,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });

  return res.json({
    success: true,
    user: {
      uid,
      email: targetEmail,
      displayName,
      role: targetRole
    }
  });
});

/**
 * POST /api/session/logout
 * Clears the session cookie
 */
router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  return res.json({ success: true, message: 'Signed out successfully' });
});

module.exports = router;
