/**
 * public/js/dashboard.js
 * Customer portal dashboard controller:
 * - Upcoming & past appointments with 24-hr cancel/reschedule
 * - Active projects with visual milestone progress
 * - Real-time in-app notification center
 * - Profile and history management
 */

import { checkAuthStatus } from './auth.js';
import { showToast } from './ui.js';

let currentUser = null;
let appointmentsList = [];
let projectsList = [];

export async function initDashboard() {
  currentUser = await checkAuthStatus();
  if (!currentUser) {
    window.location.href = '/login?redirect=/dashboard';
    return;
  }

  // Set greeting
  const greetingEl = document.getElementById('dash-user-name');
  if (greetingEl) {
    greetingEl.textContent = currentUser.displayName || 'Customer';
  }

  setupDashboardTabs();
  await loadAppointments();
  await loadProjects();
  await loadNotifications();
}

function setupDashboardTabs() {
  const tabs = document.querySelectorAll('.dash-tab-btn');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.dash-tab-content').forEach((c) => {
        c.style.display = 'none';
      });

      const activeContent = document.getElementById(`tab-${target}`);
      if (activeContent) activeContent.style.display = 'block';
    });
  });
}

// 1. Appointments Controller
async function loadAppointments() {
  const container = document.getElementById('appointments-list');
  if (!container) return;

  try {
    const res = await fetch('/api/bookings');
    const data = await res.json();
    appointmentsList = data.appointments || [];

    if (appointmentsList.length === 0) {
      container.innerHTML = `
        <div class="card-flat" style="text-align:center; padding:3rem 1.5rem;">
          <p style="font-weight:600; color:var(--color-slate-800);">No scheduled appointments found.</p>
          <p style="font-size:0.875rem; color:var(--color-text-muted); margin-bottom:1.5rem;">Book a free inspection or storm damage assessment.</p>
          <a href="/book" class="btn btn-clay-primary">Book free inspection</a>
        </div>
      `;
      return;
    }

    container.innerHTML = appointmentsList.map((appt) => {
      const isPast = new Date(appt.startAt) < new Date();
      const isCancelled = appt.status === 'cancelled';
      const statusColor = isCancelled ? '#ef4444' : (appt.status === 'confirmed' ? '#0d9488' : '#f59e0b');

      return `
        <div class="card-flat" style="margin-bottom:1rem; border-left:4px solid ${statusColor};">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem;">
            <div>
              <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
                <h3 style="font-size:1.125rem; margin:0;">${appt.typeLabel || appt.type}</h3>
                <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:${statusColor}; background:var(--color-canvas); padding:2px 8px; border-radius:4px; border:1px solid ${statusColor};">
                  ${appt.status}
                </span>
              </div>
              <p style="font-size:0.875rem; font-weight:600; color:var(--color-slate-800); display:flex; align-items:center; gap:0.375rem;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>${appt.localDate || appt.date || ''} at ${appt.localTime || appt.time || ''} (CST)</span>
              </p>
              <p style="font-size:0.8125rem; color:var(--color-text-muted); display:flex; align-items:center; gap:0.375rem;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>${appt.address?.street || ''}, ${appt.address?.city || 'Houston'}, TX ${appt.address?.zip || ''}</span>
              </p>
              ${appt.notes ? `<p style="font-size:0.8125rem; color:var(--color-text-muted); margin-top:0.25rem; font-style:italic;">Notes: "${appt.notes}"</p>` : ''}
            </div>
            <div style="display:flex; gap:0.5rem; align-items:center;">
              <a href="/api/bookings/${appt.id}/ics" class="btn btn-sm btn-flat-secondary" title="Download .ics">Calendar .ics</a>
              ${!isPast && !isCancelled ? `
                <button class="btn btn-sm btn-flat-secondary reschedule-btn" data-id="${appt.id}" data-type="${appt.type}">Reschedule</button>
                <button class="btn btn-sm btn-flat-secondary cancel-btn" data-id="${appt.id}" style="color:#dc2626;">Cancel</button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach cancel & reschedule handlers
    document.querySelectorAll('.cancel-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleCancelAppointment(btn.getAttribute('data-id')));
    });

    document.querySelectorAll('.reschedule-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleOpenRescheduleModal(btn.getAttribute('data-id'), btn.getAttribute('data-type')));
    });

  } catch (err) {
    container.innerHTML = `<p style="color:red;">Error loading appointments: ${err.message}</p>`;
  }
}

async function handleCancelAppointment(id) {
  if (!confirm('Are you sure you want to cancel this appointment? This action cannot be undone.')) {
    return;
  }

  try {
    const res = await fetch(`/api/bookings/${id}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cancellation failed');

    showToast('Appointment cancelled successfully.', 'info');
    loadAppointments();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

let activeRescheduleApptId = null;
function handleOpenRescheduleModal(id, type) {
  activeRescheduleApptId = id;
  const modal = document.getElementById('reschedule-modal');
  if (!modal) return;

  const dateInput = document.getElementById('reschedule-date-input');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  dateInput.min = tomorrow.toISOString().split('T')[0];
  dateInput.value = dateInput.min;

  loadRescheduleSlots(dateInput.value, type);

  dateInput.onchange = () => loadRescheduleSlots(dateInput.value, type);
  modal.style.display = 'flex';
}

async function loadRescheduleSlots(dateStr, type) {
  const container = document.getElementById('reschedule-slots-container');
  container.innerHTML = '<div class="spinner"></div>';

  try {
    const res = await fetch(`/api/slots?date=${dateStr}&type=${type}`);
    const data = await res.json();

    if (!data.slots || data.slots.length === 0) {
      container.innerHTML = '<p style="font-size:0.875rem;">No open slots on this date.</p>';
      return;
    }

    container.innerHTML = '';
    data.slots.forEach((slot) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-btn';
      btn.textContent = slot.time;
      btn.addEventListener('click', () => {
        document.querySelectorAll('#reschedule-slots-container .slot-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('confirm-reschedule-btn').disabled = false;
        document.getElementById('confirm-reschedule-btn').setAttribute('data-time', slot.time);
      });
      container.appendChild(btn);
    });
  } catch (err) {
    container.innerHTML = '<p style="color:red;">Failed to load slots</p>';
  }
}

document.getElementById('close-reschedule-modal-btn')?.addEventListener('click', () => {
  document.getElementById('reschedule-modal').style.display = 'none';
});

document.getElementById('confirm-reschedule-btn')?.addEventListener('click', async () => {
  const date = document.getElementById('reschedule-date-input').value;
  const time = document.getElementById('confirm-reschedule-btn').getAttribute('data-time');

  try {
    const res = await fetch(`/api/bookings/${activeRescheduleApptId}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, time })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Reschedule failed');

    showToast('Appointment rescheduled successfully!', 'success');
    document.getElementById('reschedule-modal').style.display = 'none';
    loadAppointments();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// 2. Projects & Progress Tracker Controller
async function loadProjects() {
  const container = document.getElementById('projects-list');
  if (!container) return;

  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    projectsList = data.projects || [];

    if (projectsList.length === 0) {
      container.innerHTML = `
        <div class="card-flat" style="text-align:center; padding:3rem 1.5rem;">
          <p style="font-weight:600; color:var(--color-slate-800);">No active projects yet.</p>
          <p style="font-size:0.875rem; color:var(--color-text-muted);">Projects are opened after your on-site inspection is completed.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = projectsList.map((proj) => `
      <div class="card-flat" style="margin-bottom:1.5rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <h3 style="margin:0 0 0.25rem;">${proj.title}</h3>
            <div class="meta-unboxed">
              <span>${proj.propertyType || 'Residential'}</span>
              <span class="sep">·</span>
              <span>${proj.address?.street || 'Houston, TX'}</span>
              <span class="sep">·</span>
              <span>Started ${new Date(proj.startedAt).toLocaleDateString()}</span>
            </div>
          </div>
          <a href="/project?id=${proj.id}" class="btn btn-sm btn-clay-primary">View live tracker &rarr;</a>
        </div>
        <div style="background:var(--color-canvas); padding:1rem; border-radius:8px; display:flex; align-items:center; justify-content:space-between;">
          <span style="font-weight:600; font-size:0.875rem; color:var(--color-slate-800);">Current Phase: ${proj.stageKey.replace(/-/g, ' ').toUpperCase()}</span>
          <span style="font-size:0.75rem; font-weight:700; color:var(--color-teal-600); background:var(--color-teal-50); padding:3px 10px; border-radius:12px;">Active</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p style="color:red;">Error loading projects: ${err.message}</p>`;
  }
}

// 3. Notifications Center Controller
async function loadNotifications() {
  const container = document.getElementById('notifications-list');
  if (!container) return;

  try {
    const res = await fetch('/api/notices/notifications');
    const data = await res.json();
    const notifs = data.notifications || [];

    if (notifs.length === 0) {
      container.innerHTML = `<p style="color:var(--color-text-muted); padding:1rem 0;">No new notifications.</p>`;
      return;
    }

    container.innerHTML = notifs.map((n) => `
      <div class="card-flat" style="padding:1rem; margin-bottom:0.75rem; display:flex; justify-content:space-between; align-items:center; background:${n.read ? '#ffffff' : 'var(--color-amber-50)'};">
        <div>
          <p style="font-weight:600; color:var(--color-slate-800); margin:0;">${n.title}</p>
          <p style="font-size:0.8125rem; color:var(--color-text-muted); margin:0.125rem 0;">${n.body}</p>
          <span style="font-size:0.6875rem; color:var(--color-text-muted);">${new Date(n.createdAt).toLocaleString()}</span>
        </div>
        ${!n.read ? `<button class="btn btn-sm btn-flat-secondary mark-read-btn" data-id="${n.id}">Mark read</button>` : ''}
      </div>
    `).join('');

    document.querySelectorAll('.mark-read-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nid = btn.getAttribute('data-id');
        await fetch(`/api/notices/notifications/${nid}/read`, { method: 'PATCH' });
        loadNotifications();
      });
    });
  } catch (err) {}
}

document.addEventListener('DOMContentLoaded', initDashboard);
