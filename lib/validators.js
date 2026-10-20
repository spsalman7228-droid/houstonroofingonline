/**
 * lib/validators.js
 * Zod validation schemas for API inputs with honeypot spam protection.
 */

const { z } = require('zod');

// Booking creation schema
const createBookingSchema = z.object({
  type: z.enum([
    'free-inspection',
    'free-estimate',
    'storm-assessment',
    'repair-visit',
    'commercial-walkthrough',
    'phone-consult'
  ]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format'),
  name: z.string().trim().min(2, 'Name is required (at least 2 characters)').max(100),
  email: z.string().trim().email('Valid email is required'),
  phone: z.string().trim().min(7, 'Valid phone number is required').max(20),
  propertyType: z.enum([
    'Single-family home',
    'Townhome',
    'Commercial building',
    'Multi-family community',
    'Other'
  ]),
  serviceType: z.string().trim().min(2),
  address: z.object({
    street: z.string().trim().min(3, 'Street address is required'),
    city: z.string().trim().default('Houston'),
    state: z.string().trim().default('TX'),
    zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Valid 5-digit ZIP code is required')
  }),
  notes: z.string().trim().max(1000).optional().default(''),
  howDidYouHear: z.string().trim().max(100).optional().default(''),
  consent: z.boolean().refine((val) => val === true, {
    message: 'You must consent to being contacted regarding this appointment'
  }),
  consentVersion: z.string().default('v1'),
  // Honeypot spam field: must remain empty
  website: z.string().max(0, 'Spam detected').optional()
});

// Reschedule appointment schema
const rescheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format'),
  reason: z.string().max(500).optional().default('')
});

// Create project from appointment schema (staff/admin)
const createProjectSchema = z.object({
  appointmentId: z.string().optional(),
  uid: z.string().min(1, 'Customer UID is required'),
  title: z.string().min(3, 'Title is required'),
  serviceType: z.string().min(2),
  propertyType: z.string().min(2),
  address: z.object({
    street: z.string().min(3),
    city: z.string().default('Houston'),
    state: z.string().default('TX'),
    zip: z.string().min(5)
  }),
  initialNote: z.string().optional()
});

// Advance project stage / add event schema (staff/admin)
const addProjectEventSchema = z.object({
  stageKey: z.string().min(1, 'Stage key is required'),
  stageIndex: z.number().int().min(0).max(10).optional(),
  note: z.string().min(1, 'Note is required').max(2000),
  images: z.array(z.string().url()).max(10).default([]),
  visibleToCustomer: z.boolean().default(true)
});

// Announcement schema (admin)
const announcementSchema = z.object({
  title: z.string().min(3).max(150),
  body: z.string().min(5).max(3000),
  severity: z.enum(['info', 'storm', 'schedule', 'promo']),
  pinned: z.boolean().default(false),
  startAt: z.string().datetime(),
  endAt: z.string().datetime()
});

module.exports = {
  createBookingSchema,
  rescheduleSchema,
  createProjectSchema,
  addProjectEventSchema,
  announcementSchema
};
