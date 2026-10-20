/**
 * routes/slots.js
 * Dedicated public endpoint for querying real-time appointment availability.
 */

const express = require('express');
const router = express.Router();
const { getFirestore } = require('../lib/firebase');
const { calculateAvailableSlots } = require('../lib/slots');

router.get('/', async (req, res) => {
  const { date, type } = req.query;
  if (!date || !type) {
    return res.status(400).json({ error: 'Query parameters date and type are required' });
  }

  const db = getFirestore();
  try {
    const result = await calculateAvailableSlots(db, date, type);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute availability: ' + err.message });
  }
});

module.exports = router;
