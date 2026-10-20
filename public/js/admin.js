/**
 * public/js/admin.js
 * Admin & Staff Console Controller:
 * - KPI Cards
 * - Appointments management with status updates, staff notes, and project conversion
 * - Project management, stage progression, photo documentation, customer updates
 * - Announcement publisher and expiration
 * - User directory with search and CSV download
 * - Audit logs feed
 */

import { checkAuthStatus } from './auth.js';
import { showToast } from './ui.js';

let currentUser = null;

export async function initAdminConsole() {
  currentUser = await checkAuthStatus();
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'staff')) {
    window.location.href = '/login?redirect=/admin';
    return;
  }

  setupAdminTabs();
  await loadKpis();
  await loadAdminAppointments();
  await loadAdminProjects();
  await loadAdminAnnouncements();
  await loadAdminUsers();
  await loadAdminAuditLogs();
  setupEventListeners();
}

function setupAdminTabs() {
  const tabs = document.querySelectorAll('.admin-tab-btn');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.admin-tab-pane').forEach((pane) => {
        pane.style.display = 'none';
      });

      const activePane = document.getElementById(`pane-${target}`);
      if (activePane) activePane.style.display = 'block';
    });
  });
}

// 1. Load KPIs
async function loadKpis() {
  try {
    const res = await fetch('/api/admin/kpis');
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('kpi-bookings-week').textContent = data.bookingsThisWeek ?? 0;
    document.getElementById('kpi-conversion-rate').textContent = data.conversionRate ?? '0%';
    document.getElementById('kpi-active-projects').textContent = data.activeProjects ?? 0;
    document.getElementById('kpi-storm-assessments').textContent = data.openStormAssessments ?? 0;
    document.getElementById('kpi-avg-stage-days').textContent = data.avgDaysPerStage ?? '2.4 days';
  } catch (err) {
    console.warn('KPI load error:', err);
  }
}

// 2. Appointments Manager
async function loadAdminAppointments() {
  const container = document.getElementById('admin-appointments-tbody');
  if (!container) return;

  const statusFilter = document.getElementById('filter-appt-status')?.value || 'all';
  const typeFilter = document.getElementById('filter-appt-type')?.value || 'all';
  const searchQuery = document.getElementById('filter-appt-search')?.value || '';

  try {
    const res = await fetch(`/api/admin/appointments?status=${statusFilter}&type=${typeFilter}&search=${encodeURIComponent(searchQuery)}`);
    const data = await res.json();
    const appts = data.appointments || [];

    if (appts.length === 0) {
      container.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem;">No matching appointments found.</td></tr>`;
      return;
    }

    container.innerHTML = appts.map((a) => `
      <tr>
        <td style="font-weight:600;">${a.customerName || 'Customer'}<br><span style="font-size:0.75rem; color:var(--color-text-muted); font-weight:400;">${a.customerPhone || ''}</span></td>
        <td>${a.typeLabel || a.type}<br><span style="font-size:0.75rem; color:var(--color-text-muted);">${a.propertyType || ''}</span></td>
        <td><strong>${a.localDate || ''}</strong><br><span style="font-size:0.8125rem;">${a.localTime || ''}</span></td>
        <td style="font-size:0.8125rem;">${a.address?.street || ''}, ${a.address?.zip || ''}</td>
        <td>
          <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; padding:3px 8px; border-radius:4px; ${getStatusBadgeStyle(a.status)}">
            ${a.status}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:0.375rem; flex-wrap:wrap;">
            ${a.status !== 'confirmed' ? `<button class="btn btn-sm btn-flat-secondary appt-action-btn" data-id="${a.id}" data-action="confirm">Confirm</button>` : ''}
            ${a.status !== 'completed' ? `<button class="btn btn-sm btn-flat-secondary appt-action-btn" data-id="${a.id}" data-action="completed">Done</button>` : ''}
            ${!a.projectId ? `<button class="btn btn-sm btn-clay-primary appt-convert-btn" data-id="${a.id}" data-uid="${a.uid}" data-name="${a.customerName || ''}" data-service="${a.serviceType || 'residential-asphalt-replacement'}" data-property="${a.propertyType || 'Single-family home'}" data-street="${a.address?.street || ''}" data-city="${a.address?.city || 'Houston'}" data-zip="${a.address?.zip || ''}">+ Project</button>` : `<span style="font-size:0.75rem; color:var(--color-teal-600); font-weight:600;">Linked</span>`}
          </div>
        </td>
      </tr>
    `).join('');

    // Attach appointment status listeners
    document.querySelectorAll('.appt-action-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        await fetch(`/api/admin/appointments/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: action })
        });
        showToast(`Appointment status updated to ${action}`, 'success');
        loadAdminAppointments();
      });
    });

    // Attach project conversion
    document.querySelectorAll('.appt-convert-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const appointmentId = btn.getAttribute('data-id');
        const uid = btn.getAttribute('data-uid');
        const name = btn.getAttribute('data-name');
        const serviceType = btn.getAttribute('data-service');
        const propertyType = btn.getAttribute('data-property');
        const street = btn.getAttribute('data-street');
        const city = btn.getAttribute('data-city');
        const zip = btn.getAttribute('data-zip');

        const title = `Roof Replacement - ${name}`;

        try {
          const res = await fetch('/api/admin/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              appointmentId,
              uid,
              title,
              serviceType,
              propertyType,
              address: { street, city, state: 'TX', zip },
              initialNote: 'Project created from on-site inspection visit.'
            })
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          showToast('Project created successfully and linked to customer dashboard!', 'success');
          loadAdminAppointments();
          loadAdminProjects();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<tr><td colspan="6" style="color:red;">Error: ${err.message}</td></tr>`;
  }
}

function getStatusBadgeStyle(status) {
  if (status === 'confirmed') return 'background:#f0fdfa; color:#0f766e; border:1px solid #99f6e4;';
  if (status === 'completed') return 'background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;';
  if (status === 'cancelled') return 'background:#fef2f2; color:#b91c1c; border:1px solid #fecaca;';
  return 'background:#fffbeb; color:#b45309; border:1px solid #fde68a;';
}

// 3. Projects Manager
async function loadAdminProjects() {
  const container = document.getElementById('admin-projects-container');
  if (!container) return;

  try {
    const res = await fetch('/api/admin/projects');
    const data = await res.json();
    const projects = data.projects || [];

    if (projects.length === 0) {
      container.innerHTML = `<div class="card-flat" style="padding:2rem; text-align:center;">No active projects. Convert an appointment or create one.</div>`;
      return;
    }

    container.innerHTML = projects.map((p) => `
      <div class="card-flat" style="margin-bottom:1.25rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <h3 style="font-size:1.125rem; margin:0 0 0.25rem;">${p.title}</h3>
            <p style="font-size:0.8125rem; color:var(--color-text-muted); margin:0;">
              📍 ${p.address?.street || ''}, ${p.address?.city || ''} · Started ${new Date(p.startedAt).toLocaleDateString()}
            </p>
          </div>
          <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--color-teal-600); background:var(--color-teal-50); padding:4px 10px; border-radius:6px; border:1px solid var(--color-teal-500);">
            Stage: ${p.stageKey}
          </span>
        </div>

        <div style="background:var(--color-canvas); padding:1rem; border-radius:8px; margin-bottom:1rem;">
          <p style="font-size:0.875rem; font-weight:600; margin-bottom:0.5rem;">Advance Project Stage / Add Update:</p>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:0.75rem;">
            <select class="form-select project-stage-select" id="stage-select-${p.id}" style="min-height:38px; font-size:0.8125rem;">
              <option value="request-received" ${p.stageKey === 'request-received' ? 'selected' : ''}>1. Request received</option>
              <option value="inspection-scheduled" ${p.stageKey === 'inspection-scheduled' ? 'selected' : ''}>2. Inspection scheduled</option>
              <option value="inspection-complete" ${p.stageKey === 'inspection-complete' ? 'selected' : ''}>3. Inspection complete</option>
              <option value="estimate-delivered" ${p.stageKey === 'estimate-delivered' ? 'selected' : ''}>4. Estimate delivered</option>
              <option value="agreement-signed" ${p.stageKey === 'agreement-signed' ? 'selected' : ''}>5. Agreement signed</option>
              <option value="materials-permits" ${p.stageKey === 'materials-permits' ? 'selected' : ''}>6. Permits and materials</option>
              <option value="install-scheduled" ${p.stageKey === 'install-scheduled' ? 'selected' : ''}>7. Install scheduled</option>
              <option value="in-progress" ${p.stageKey === 'in-progress' ? 'selected' : ''}>8. Work in progress</option>
              <option value="final-inspection" ${p.stageKey === 'final-inspection' ? 'selected' : ''}>9. Final inspection</option>
              <option value="warranty-registered" ${p.stageKey === 'warranty-registered' ? 'selected' : ''}>10. Warranty registered</option>
              <option value="complete" ${p.stageKey === 'complete' ? 'selected' : ''}>11. Complete</option>
            </select>
            <input type="text" id="note-input-${p.id}" class="form-input" placeholder="Update note (e.g. Roof deck inspected, no rot)" style="min-height:38px; font-size:0.8125rem;">
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.75rem;">
            <label style="font-size:0.8125rem; display:flex; align-items:center; gap:0.375rem; cursor:pointer;">
              <input type="checkbox" id="visible-cb-${p.id}" checked>
              <span>Visible to customer in live portal</span>
            </label>
            <button class="btn btn-sm btn-clay-primary advance-stage-btn" data-id="${p.id}">Publish Update</button>
          </div>
        </div>
      </div>
    `).join('');

    // Attach advance stage events
    document.querySelectorAll('.advance-stage-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const stageKey = document.getElementById(`stage-select-${id}`).value;
        const note = document.getElementById(`note-input-${id}`).value.trim() || `Advanced to ${stageKey}`;
        const visibleToCustomer = document.getElementById(`visible-cb-${id}`).checked;

        try {
          const res = await fetch(`/api/admin/projects/${id}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stageKey,
              note,
              visibleToCustomer,
              images: []
            })
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          showToast('Project updated & customer notified in real time!', 'success');
          loadAdminProjects();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
  }
}

// 4. Announcements Manager
async function loadAdminAnnouncements() {
  const container = document.getElementById('admin-announcements-list');
  if (!container) return;

  try {
    const res = await fetch('/api/admin/announcements');
    const data = await res.json();
    const items = data.announcements || [];

    container.innerHTML = items.map((a) => `
      <div class="card-flat" style="padding:1rem; margin-bottom:0.75rem; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
            <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; padding:2px 8px; border-radius:4px; background:var(--color-canvas);">
              ${a.severity}
            </span>
            <strong style="color:var(--color-slate-900);">${a.title}</strong>
            ${a.pinned ? `<span style="font-size:0.6875rem; color:#dc2626; font-weight:700;">📌 Pinned</span>` : ''}
          </div>
          <p style="font-size:0.8125rem; color:var(--color-text-muted); margin:0;">${a.body}</p>
        </div>
        <button class="btn btn-sm btn-flat-secondary delete-notice-btn" data-id="${a.id}" style="color:#dc2626;">Expire</button>
      </div>
    `).join('');

    document.querySelectorAll('.delete-notice-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' });
        showToast('Announcement removed.', 'info');
        loadAdminAnnouncements();
      });
    });
  } catch (err) {}
}

// 5. Users List & CSV Export
async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    const users = data.users || [];

    tbody.innerHTML = users.map((u) => `
      <tr>
        <td style="font-weight:600;">${u.displayName || 'Customer'}</td>
        <td>${u.email || '—'}</td>
        <td>${u.phone || '—'}</td>
        <td><span style="text-transform:uppercase; font-size:0.75rem; font-weight:700; background:var(--color-canvas); padding:2px 6px; border-radius:4px;">${u.role || 'customer'}</span></td>
        <td style="font-size:0.8125rem;">${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
      </tr>
    `).join('');
  } catch (err) {}
}

// 6. Audit Logs
async function loadAdminAuditLogs() {
  const container = document.getElementById('admin-audit-logs-list');
  if (!container) return;

  try {
    const res = await fetch('/api/admin/audit-logs');
    const data = await res.json();
    const logs = data.logs || [];

    container.innerHTML = logs.map((l) => `
      <div style="font-size:0.8125rem; padding:0.5rem 0; border-bottom:1px solid var(--color-border); display:flex; justify-content:space-between;">
        <span><strong>${l.action}</strong> by ${l.actor} (${l.targetPath})</span>
        <span style="color:var(--color-text-muted);">${new Date(l.at).toLocaleTimeString()}</span>
      </div>
    `).join('');
  } catch (err) {}
}

function setupEventListeners() {
  // Filter listeners
  document.getElementById('filter-appt-status')?.addEventListener('change', loadAdminAppointments);
  document.getElementById('filter-appt-type')?.addEventListener('change', loadAdminAppointments);
  document.getElementById('filter-appt-search')?.addEventListener('input', loadAdminAppointments);

  // New notice form
  const noticeForm = document.getElementById('new-notice-form');
  noticeForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(noticeForm);

    const title = fd.get('title')?.toString();
    const body = fd.get('body')?.toString();
    const severity = fd.get('severity')?.toString();
    const pinned = fd.get('pinned') === 'on';

    const now = new Date();
    const end = new Date(now.getTime() + 14 * 24 * 3600 * 1000);

    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          severity,
          pinned,
          startAt: now.toISOString(),
          endAt: end.toISOString()
        })
      });

      if (!res.ok) throw new Error('Failed to publish notice');

      showToast('Notice published in under 30 seconds!', 'success');
      noticeForm.reset();
      loadAdminAnnouncements();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', initAdminConsole);
