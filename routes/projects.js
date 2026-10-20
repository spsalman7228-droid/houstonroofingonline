/**
 * routes/projects.js
 * Customer project tracking and event history.
 */

const express = require('express');
const router = express.Router();
const { getFirestore } = require('../lib/firebase');
const { requireAuth } = require('../lib/auth');

/**
 * GET /api/projects
 * List projects belonging to the authenticated user.
 */
router.get('/', requireAuth, async (req, res) => {
  const db = getFirestore();
  const uid = req.user.uid;

  try {
    const snap = await db.collection('projects').where('uid', '==', uid).get();
    const projects = snap.docs.map((d) => d.data());
    projects.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve projects: ' + err.message });
  }
});

/**
 * GET /api/projects/:id
 * Retrieve a project and its progress timeline events.
 */
router.get('/:id', requireAuth, async (req, res) => {
  const db = getFirestore();
  const projectId = req.params.id;

  try {
    const projectRef = db.collection('projects').doc(projectId);
    const doc = await projectRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectData = doc.data();

    // Check ownership
    const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
    if (projectData.uid !== req.user.uid && !isStaff) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Retrieve events subcollection
    const eventsSnap = await projectRef.collection('events').get();
    let events = eventsSnap.docs.map((d) => d.data());

    // If customer, hide internal staff events
    if (!isStaff) {
      events = events.filter((e) => e.visibleToCustomer !== false);
    }

    events.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Also include standard stages configuration for visual stepper
    let stages = [];
    try {
      const stagesDoc = await db.collection('settings').doc('stages').get();
      if (stagesDoc.exists) {
        stages = stagesDoc.data();
      }
    } catch (e) {}

    res.json({
      project: projectData,
      events,
      stages
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load project: ' + err.message });
  }
});

module.exports = router;
