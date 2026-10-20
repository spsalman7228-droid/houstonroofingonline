/**
 * scripts/seed.js
 * Populates Firestore settings, stages, starter notices, and demo users.
 * Run via: npm run seed
 */

const fs = require('fs');
const path = require('path');
const { getFirestore } = require('../lib/firebase');

async function seed() {
  console.log('Seeding Firestore data...');
  const db = getFirestore();

  const settingsFile = path.join(__dirname, '..', 'content', 'settings.json');
  if (!fs.existsSync(settingsFile)) {
    console.error('content/settings.json not found');
    process.exit(1);
  }

  const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));

  // 1. Seed settings/booking
  if (settings.booking) {
    await db.collection('settings').doc('booking').set(settings.booking);
    console.log('✓ Seeded settings/booking');
  }

  // 2. Seed settings/stages
  if (settings.stages) {
    await db.collection('settings').doc('stages').set(settings.stages);
    console.log('✓ Seeded settings/stages');
  }

  // 3. Seed starter announcements
  if (settings.announcementTemplates) {
    for (const tpl of settings.announcementTemplates) {
      const id = 'notice_' + tpl.key;
      await db.collection('announcements').doc(id).set({
        id,
        title: tpl.title,
        body: tpl.body,
        severity: tpl.severity,
        pinned: tpl.severity === 'storm',
        startAt: new Date(Date.now() - 3600000).toISOString(),
        endAt: new Date(Date.now() + 30 * 24 * 3600000).toISOString(),
        createdBy: 'seed-script',
        createdAt: new Date().toISOString()
      });
    }
    console.log('✓ Seeded announcements');
  }

  // 4. Seed sample reviews
  const reviews = [
    { id: "s1", sample: true, name: "Sample customer", area: "Cypress, TX", rating: 5, text: "Sample: The project manager walked the roof with me, showed me photos and explained my options without pressure.", service: "Roof replacement", verified: false, status: 'approved' },
    { id: "s2", sample: true, name: "Sample customer", area: "Spring, TX", rating: 5, text: "Sample: I expected to hear I needed a new roof. They recommended a repair and explained why.", service: "Roof repair", verified: false, status: 'approved' },
    { id: "s3", sample: true, name: "Sample customer", area: "The Woodlands, TX", rating: 5, text: "Sample: Clear updates at every step and a clean job site when they finished.", service: "Roof replacement", verified: false, status: 'approved' },
    { id: "s4", sample: true, name: "Sample property manager", area: "Houston, TX", rating: 5, text: "Sample: Phased schedule across our buildings and good communication with residents.", service: "Multi-family roofing", verified: false, status: 'approved' },
    { id: "s5", sample: true, name: "Sample business owner", area: "Houston, TX", rating: 5, text: "Sample: They worked around our operating hours and documented everything for our records.", service: "Commercial roofing", verified: false, status: 'approved' },
    { id: "s6", sample: true, name: "Sample customer", area: "Katy, TX", rating: 5, text: "Sample: Booking online and seeing my project status made the whole process feel simple.", service: "Storm assessment", verified: false, status: 'approved' }
  ];

  for (const r of reviews) {
    await db.collection('reviews').doc(r.id).set({
      ...r,
      createdAt: new Date().toISOString()
    });
  }
  console.log('✓ Seeded sample reviews');

  console.log('All seed operations completed successfully.');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seeding error:', err);
      process.exit(1);
    });
}

module.exports = seed;
