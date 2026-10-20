/**
 * lib/auth.js
 * Session verification, custom claims role extraction, and route security middleware.
 */

const { getAuth, getFirestore } = require('./firebase');

const SESSION_COOKIE_NAME = '__session';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Middleware: extracts authenticated user from session cookie or Authorization header.
 * Attaches user object to req.user.
 */
async function attachUser(req, res, next) {
  req.user = null;
  const cookie = req.cookies ? req.cookies[SESSION_COOKIE_NAME] : null;
  const authHeader = req.headers.authorization;

  let tokenToVerify = null;
  let isSessionCookie = false;

  if (cookie) {
    tokenToVerify = cookie;
    isSessionCookie = true;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    tokenToVerify = authHeader.split('Bearer ')[1].trim();
    isSessionCookie = false;
  }

  if (!tokenToVerify) {
    return next();
  }

  const auth = getAuth();
  const db = getFirestore();

  try {
    let decoded;
    if (isSessionCookie) {
      decoded = await auth.verifySessionCookie(tokenToVerify, true);
    } else {
      decoded = await auth.verifyIdToken(tokenToVerify);
    }

    const email = (decoded.email || '').toLowerCase();
    let role = decoded.role || 'customer';

    // Auto-promote if in ADMIN_EMAILS
    if (email && ADMIN_EMAILS.includes(email) && role !== 'admin') {
      role = 'admin';
      try {
        await auth.setCustomUserClaims(decoded.uid, { role: 'admin' });
      } catch (err) {
        console.warn('Could not persist custom claims for auto-admin:', err.message);
      }
    }

    // Ensure users/{uid} document exists
    const userDocRef = db.collection('users').doc(decoded.uid);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      await userDocRef.set({
        uid: decoded.uid,
        email: decoded.email || null,
        displayName: decoded.name || decoded.displayName || 'Customer',
        phone: decoded.phone_number || decoded.phone || null,
        photoURL: decoded.picture || decoded.photoURL || null,
        role: role,
        addresses: [],
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      });
    } else {
      const existingData = userDoc.data();
      // Keep role in sync with database if claims are lagging
      if (existingData.role && existingData.role !== role) {
        role = existingData.role;
      }
      await userDocRef.update({
        lastLoginAt: new Date().toISOString(),
        role: role
      });
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      displayName: decoded.name || decoded.displayName,
      role: role
    };

    next();
  } catch (err) {
    // If token expired or invalid, continue as unauthenticated
    req.user = null;
    next();
  }
}

/**
 * Guard: User must be authenticated
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  next();
}

/**
 * Guard: Role must be staff or admin
 */
function requireStaff(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.user.role !== 'staff' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Staff access required.' });
  }
  next();
}

/**
 * Guard: Role must be admin
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
  next();
}

module.exports = {
  SESSION_COOKIE_NAME,
  ADMIN_EMAILS,
  attachUser,
  requireAuth,
  requireStaff,
  requireAdmin
};
