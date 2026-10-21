/**
 * index.js
 * Root Express application.
 * Exports app for Vercel Serverless and listens on PORT (default 3000) when executed directly.
 */

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { attachUser } = require('./lib/auth');

// Route handlers
const sessionRouter = require('./routes/session');
const publicRouter = require('./routes/public');
const slotsRouter = require('./routes/slots');
const bookingsRouter = require('./routes/bookings');
const projectsRouter = require('./routes/projects');
const noticesRouter = require('./routes/notices');
const meRouter = require('./routes/me');
const adminRouter = require('./admin');

const app = express();

// Basic security and performance middlewares
app.use(
  helmet({
    contentSecurityPolicy: false, // Handled with fine-grained rules in vercel.json
    crossOriginEmbedderPolicy: false
  })
);
app.use(compression());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach authenticated user (from session cookie or bearer token)
app.use(attachUser);

// Rate limiter for appointment booking spam prevention
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many booking attempts. Please try again later.' }
});

// API Routes
app.use('/api/session', sessionRouter);
app.use('/api/public', publicRouter);
app.use('/api/slots', slotsRouter);
app.use('/api/bookings', bookingLimiter, bookingsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/notices', noticesRouter);
app.use('/api/me', meRouter);
app.use('/api/admin', adminRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Houston Roofing & Construction API', time: new Date().toISOString() });
});

// Static assets serving with clean HTML extension resolution
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath, { extensions: ['html'] }));

// Fallback: 404 for unknown HTML routes or missing files
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.status(404).sendFile(path.join(publicPath, '404.html'));
});

// Start listener when running directly (standalone mode), not when imported by Vercel serverless
const PORT = process.env.PORT || 3000;
if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Houston Roofing & Construction platform running on http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
