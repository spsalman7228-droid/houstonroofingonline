/**
 * public/js/booking.js
 * 4-Step Online Automated Booking Wizard:
 * Step 1: Service Type
 * Step 2: Date & Available Time Slot (queried via /api/slots)
 * Step 3: Property & Contact Details with Texas consent
 * Step 4: Auth Check & Atomic Submission via /api/bookings
 * Confirmation: Add to Google Calendar & Download .ics file
 */

import { checkAuthStatus, loginWithDemo } from './auth.js';
import { showToast } from './ui.js';

let bookingState = {
  type: 'free-inspection',
  typeLabel: 'Free roof inspection',
  date: '',
  time: '',
  name: '',
  email: '',
  phone: '',
  propertyType: 'Single-family home',
  serviceType: 'residential-asphalt-replacement',
  address: { street: '', city: 'Houston', state: 'TX', zip: '' },
  notes: '',
  howDidYouHear: 'Google search',
  consent: false,
  website: '' // Honeypot
};

let currentUser = null;

export async function initBookingWizard() {
  currentUser = await checkAuthStatus();

  // Pre-fill user profile if authenticated
  if (currentUser) {
    bookingState.email = currentUser.email || '';
    bookingState.name = currentUser.displayName || '';
    bookingState.phone = currentUser.phone || '';
  }

  // Preselect from URL query params (e.g., /book?service=roof-repair)
  const urlParams = new URLSearchParams(window.location.search);
  const serviceParam = urlParams.get('service');
  if (serviceParam) {
    bookingState.serviceType = serviceParam;
    if (serviceParam.includes('repair') || serviceParam.includes('storm')) {
      bookingState.type = 'storm-assessment';
      bookingState.typeLabel = 'Storm or hail damage assessment';
    } else if (serviceParam.includes('commercial') || serviceParam.includes('multifamily')) {
      bookingState.type = 'commercial-walkthrough';
      bookingState.typeLabel = 'Commercial or multi-family walkthrough';
    }
  }

  setupStepEvents();
  renderStep(1);
}

function setupStepEvents() {
  // Step 1: Service Cards
  document.querySelectorAll('.service-type-option').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.service-type-option').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      bookingState.type = card.getAttribute('data-type');
      bookingState.typeLabel = card.getAttribute('data-label');
      renderStep(2);
    });
  });

  // Step 2: Date selection
  const dateInput = document.getElementById('booking-date-input');
  if (dateInput) {
    // Default to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minIso = tomorrow.toISOString().split('T')[0];
    dateInput.min = minIso;
    dateInput.value = minIso;
    bookingState.date = minIso;

    dateInput.addEventListener('change', (e) => {
      bookingState.date = e.target.value;
      loadSlots(bookingState.date, bookingState.type);
    });
  }

  // Step navigation buttons
  document.getElementById('to-step-3-btn')?.addEventListener('click', () => {
    if (!bookingState.time) {
      showToast('Please select an available time slot', 'error');
      return;
    }
    renderStep(3);
  });

  document.getElementById('back-to-step-1-btn')?.addEventListener('click', () => renderStep(1));
  document.getElementById('back-to-step-2-btn')?.addEventListener('click', () => renderStep(2));
  document.getElementById('back-to-step-3-btn')?.addEventListener('click', () => renderStep(3));

  // Step 3: Form submission
  const detailsForm = document.getElementById('booking-details-form');
  if (detailsForm) {
    detailsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(detailsForm);

      bookingState.name = fd.get('name')?.toString().trim();
      bookingState.email = fd.get('email')?.toString().trim();
      bookingState.phone = fd.get('phone')?.toString().trim();
      bookingState.propertyType = fd.get('propertyType')?.toString();
      bookingState.address = {
        street: fd.get('street')?.toString().trim(),
        city: fd.get('city')?.toString().trim() || 'Houston',
        state: 'TX',
        zip: fd.get('zip')?.toString().trim()
      };
      bookingState.notes = fd.get('notes')?.toString().trim() || '';
      bookingState.howDidYouHear = fd.get('howDidYouHear')?.toString() || '';
      bookingState.consent = fd.get('consent') === 'on';
      bookingState.website = fd.get('website')?.toString() || ''; // honeypot

      if (!bookingState.consent) {
        showToast('Please check the consent box to proceed', 'error');
        return;
      }

      renderStep(4);
    });
  }

  // Step 4: Final confirmation trigger
  document.getElementById('confirm-booking-btn')?.addEventListener('click', submitBooking);
  document.getElementById('quick-auth-demo-btn')?.addEventListener('click', async () => {
    await loginWithDemo('customer', bookingState.email || 'customer@example.com');
    currentUser = await checkAuthStatus();
    updateStep4AuthStatus();
  });
}

function renderStep(stepNumber) {
  document.querySelectorAll('.wizard-step-panel').forEach((panel) => {
    panel.style.display = 'none';
  });

  // Update step indicator
  document.querySelectorAll('.step-indicator-item').forEach((item, index) => {
    const num = index + 1;
    item.classList.remove('active', 'completed');
    if (num === stepNumber) item.classList.add('active');
    else if (num < stepNumber) item.classList.add('completed');
  });

  const activePanel = document.getElementById(`step-${stepNumber}-panel`);
  if (activePanel) {
    activePanel.style.display = 'block';
  }

  if (stepNumber === 2) {
    loadSlots(bookingState.date, bookingState.type);
  } else if (stepNumber === 3) {
    // Populate form with existing state
    if (bookingState.name) document.getElementById('input-name').value = bookingState.name;
    if (bookingState.email) document.getElementById('input-email').value = bookingState.email;
    if (bookingState.phone) document.getElementById('input-phone').value = bookingState.phone;
    if (bookingState.address.street) document.getElementById('input-street').value = bookingState.address.street;
    if (bookingState.address.zip) document.getElementById('input-zip').value = bookingState.address.zip;
  } else if (stepNumber === 4) {
    renderStep4Summary();
    updateStep4AuthStatus();
  }
}

async function loadSlots(dateStr, typeKey) {
  const container = document.getElementById('slots-container');
  if (!container) return;

  container.innerHTML = `
    <div style="grid-column: 1 / -1; padding: 2rem; text-align: center;">
      <div class="spinner" style="border-top-color: var(--color-amber-500); width: 28px; height: 28px;"></div>
      <p style="margin-top: 0.5rem; font-size: 0.875rem;">Checking real-time calendar capacity...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/slots?date=${dateStr}&type=${typeKey}`);
    const data = await res.json();

    if (!res.ok || !data.slots || data.slots.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 2rem; text-align: center; background: var(--color-surface-muted); border-radius: 8px;">
          <p style="font-weight: 600; color: var(--color-slate-800);">No open slots available for this date.</p>
          <p style="font-size: 0.8125rem; color: var(--color-text-muted); margin-top: 0.25rem;">${data.reason || 'Please select another day or choose a different service type.'}</p>
        </div>
      `;
      document.getElementById('to-step-3-btn').disabled = true;
      return;
    }

    container.innerHTML = '';
    data.slots.forEach((slot) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `slot-btn ${bookingState.time === slot.time ? 'selected' : ''}`;
      btn.innerHTML = `
        <span>${slot.time}</span>
        <span class="capacity-tag">${slot.capacityRemaining} spot${slot.capacityRemaining > 1 ? 's' : ''} left</span>
      `;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        bookingState.time = slot.time;
        document.getElementById('to-step-3-btn').disabled = false;
      });
      container.appendChild(btn);
    });

    document.getElementById('to-step-3-btn').disabled = !bookingState.time;
  } catch (err) {
    container.innerHTML = `<p style="color:red; grid-column:1/-1;">Error loading slots: ${err.message}</p>`;
  }
}

function renderStep4Summary() {
  document.getElementById('summary-service').textContent = bookingState.typeLabel;
  document.getElementById('summary-datetime').textContent = `${bookingState.date} at ${bookingState.time} (America/Chicago)`;
  document.getElementById('summary-customer').textContent = `${bookingState.name} (${bookingState.phone}, ${bookingState.email})`;
  document.getElementById('summary-address').textContent = `${bookingState.address.street}, ${bookingState.address.city}, TX ${bookingState.address.zip}`;
}

async function updateStep4AuthStatus() {
  currentUser = await checkAuthStatus();
  const authPrompt = document.getElementById('step-4-auth-prompt');
  const confirmBtn = document.getElementById('confirm-booking-btn');

  if (currentUser) {
    authPrompt.innerHTML = `
      <div style="background:var(--color-teal-50); border:1px solid var(--color-teal-500); padding:1rem; border-radius:8px; display:flex; align-items:center; justify-content:space-between;">
        <div>
          <p style="font-weight:600; color:#0f766e; margin:0;">Signed in as ${currentUser.displayName} (${currentUser.email || currentUser.role})</p>
          <p style="font-size:0.8125rem; color:#115e59; margin:0;">Your appointment will be linked to your portal dashboard.</p>
        </div>
        <span style="font-size:1.25rem;">✓</span>
      </div>
    `;
    confirmBtn.disabled = false;
  } else {
    authPrompt.innerHTML = `
      <div style="background:#fffbeb; border:1px solid #fde68a; padding:1.25rem; border-radius:8px;">
        <p style="font-weight:600; color:#92400e; margin-bottom:0.25rem;">Account verification required to finalize booking</p>
        <p style="font-size:0.875rem; color:#b45309; margin-bottom:0.75rem;">Sign in so you can track your inspector's arrival and project progress online.</p>
        <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
          <a href="/login?redirect=/book" class="btn btn-sm btn-flat-dark">Sign in with Google</a>
          <button type="button" id="quick-demo-auth-action" class="btn btn-sm btn-clay-primary">Instant 1-Click Verification (Demo)</button>
        </div>
      </div>
    `;
    confirmBtn.disabled = true;

    document.getElementById('quick-demo-auth-action')?.addEventListener('click', async () => {
      await loginWithDemo('customer', bookingState.email || 'customer@example.com');
      updateStep4AuthStatus();
    });
  }
}

async function submitBooking() {
  const btn = document.getElementById('confirm-booking-btn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Confirming slot...`;

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingState)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to book appointment');
    }

    // Success! Show confirmation panel (Step 5)
    document.querySelectorAll('.wizard-step-panel').forEach((p) => (p.style.display = 'none'));
    const confirmPanel = document.getElementById('step-confirmation-panel');
    confirmPanel.style.display = 'block';

    document.getElementById('conf-reference').textContent = data.appointment.id;
    document.getElementById('conf-service').textContent = data.appointment.typeLabel;
    document.getElementById('conf-datetime').textContent = `${data.appointment.date} at ${data.appointment.time}`;

    const googleBtn = document.getElementById('add-google-cal-btn');
    if (googleBtn && data.googleCalendarUrl) {
      googleBtn.href = data.googleCalendarUrl;
    }

    const icsBtn = document.getElementById('download-ics-btn');
    if (icsBtn && data.icsUrl) {
      icsBtn.href = data.icsUrl;
    }

    showToast('Appointment successfully confirmed!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Confirm Free Inspection';
  }
}

document.addEventListener('DOMContentLoaded', initBookingWizard);
