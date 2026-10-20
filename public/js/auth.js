/**
 * public/js/auth.js
 * Client authentication bridge supporting Firebase Web SDK,
 * session cookie exchange (/api/session), demo sign-in for preview, and header state syncing.
 */

import { showToast } from './ui.js';

let currentUser = null;

/**
 * Check authenticated session status from server
 */
export async function checkAuthStatus() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) return null;
    const data = await res.json();
    currentUser = data.authenticated ? data.user : null;
    updateAuthNav(currentUser);
    return currentUser;
  } catch (err) {
    console.warn('Auth status check failed:', err);
    updateAuthNav(null);
    return null;
  }
}

/**
 * Update navigation bar with user state
 */
export function updateAuthNav(user) {
  const container = document.getElementById('auth-nav-container');
  if (!container) return;

  if (user) {
    const isAdmin = user.role === 'admin' || user.role === 'staff';
    const unreadHtml = user.unreadCount > 0
      ? `<span style="background:var(--color-amber-500); color:#0f172a; font-size:0.6875rem; font-weight:700; padding:1px 6px; border-radius:10px; margin-left:4px;">${user.unreadCount}</span>`
      : '';

    container.innerHTML = `
      <div style="display:flex; align-items:center; gap:0.75rem;">
        <a href="/dashboard" class="nav-link" style="display:flex; align-items:center; gap:0.25rem;">
          <span>Portal</span>${unreadHtml}
        </a>
        ${isAdmin ? `<a href="/admin" class="btn btn-sm btn-flat-secondary" style="border-color:var(--color-amber-500); color:var(--color-amber-700);">Admin</a>` : ''}
        <button id="sign-out-btn" class="btn btn-sm btn-flat-secondary">Sign out</button>
      </div>
    `;

    document.getElementById('sign-out-btn')?.addEventListener('click', handleSignOut);
  } else {
    container.innerHTML = `
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <a href="/login" class="nav-link">Sign in</a>
        <a href="/book" class="btn btn-sm btn-clay-primary">Book free inspection</a>
      </div>
    `;
  }
}

/**
 * Demo Login (instant sign-in for rapid preview & local testing)
 */
export async function loginWithDemo(role = 'customer', email) {
  try {
    const res = await fetch('/api/session/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, email })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Demo login failed');

    showToast(`Signed in as ${data.user.displayName} (${data.user.role})`, 'success');
    currentUser = data.user;
    updateAuthNav(currentUser);
    return data.user;
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
  }
}

/**
 * Handle Sign Out
 */
export async function handleSignOut() {
  try {
    await fetch('/api/session/logout', { method: 'POST' });
    showToast('Signed out successfully', 'info');
    currentUser = null;
    updateAuthNav(null);
    if (window.location.pathname === '/dashboard' || window.location.pathname === '/admin' || window.location.pathname === '/project') {
      window.location.href = '/';
    }
  } catch (err) {
    showToast('Sign out error', 'error');
  }
}

// Auto-check session on load
document.addEventListener('DOMContentLoaded', () => {
  checkAuthStatus();
});
