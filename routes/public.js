/**
 * routes/public.js
 * Public endpoints for verified facts, services, FAQs, reviews, and active notices.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getFirestore } = require('../lib/firebase');

function readJsonFile(filename) {
  const filePath = path.join(__dirname, '..', 'content', filename);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return {};
}

// GET /api/public/site
router.get('/site', (req, res) => {
  const site = readJsonFile('site.json');
  res.json(site);
});

// GET /api/public/services
router.get('/services', (req, res) => {
  const services = readJsonFile('services.json');
  res.json(services);
});

// GET /api/public/faqs
router.get('/faqs', (req, res) => {
  const faqs = readJsonFile('faqs.json');
  res.json(faqs);
});

// GET /api/public/reviews
router.get('/reviews', async (req, res) => {
  const db = getFirestore();
  try {
    const snap = await db.collection('reviews').where('status', '==', 'approved').get();
    const reviews = snap.docs.map((d) => d.data());
    res.json({ reviews });
  } catch (err) {
    // Return sample reviews from asset file if query fails
    const sampleReviews = [
      { id: "s1", sample: true, name: "Sample customer", area: "Cypress, TX", rating: 5, text: "Sample: The project manager walked the roof with me, showed me photos and explained my options without pressure.", service: "Roof replacement" },
      { "id": "s2", sample: true, name: "Sample customer", area: "Spring, TX", rating: 5, text: "Sample: I expected to hear I needed a new roof. They recommended a repair and explained why.", service: "Roof repair" },
      { "id": "s3", sample: true, name: "Sample customer", area: "The Woodlands, TX", rating: 5, text: "Sample: Clear updates at every step and a clean job site when they finished.", service: "Roof replacement" },
      { "id": "s4", sample: true, name: "Sample property manager", area: "Houston, TX", rating: 5, text: "Sample: Phased schedule across our buildings and good communication with residents.", service: "Multi-family roofing" },
      { "id": "s5", sample: true, name: "Sample business owner", area: "Houston, TX", rating: 5, text: "Sample: They worked around our operating hours and documented everything for our records.", service: "Commercial roofing" },
      { "id": "s6", sample: true, name: "Sample customer", area: "Katy, TX", rating: 5, text: "Sample: Booking online and seeing my project status made the whole process feel simple.", service: "Storm assessment" }
    ];
    res.json({ reviews: sampleReviews });
  }
});

// GET /api/public/notices (active public announcements)
router.get('/notices', async (req, res) => {
  const db = getFirestore();
  const nowIso = new Date().toISOString();
  try {
    const snap = await db.collection('announcements').get();
    const active = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((n) => {
        if (n.startAt && n.startAt > nowIso) return false;
        if (n.endAt && n.endAt < nowIso) return false;
        return true;
      });

    // Sort pinned first, then newest
    active.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.startAt || 0) - new Date(a.startAt || 0);
    });

    res.json({ notices: active });
  } catch (err) {
    res.json({ notices: [] });
  }
});

module.exports = router;
