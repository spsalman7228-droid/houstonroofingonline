/**
 * public/js/ui.js
 * Shared client UI controller: scroll reveals, toast notifications, notice banners, and counters.
 */

// Show floating toast
export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Initialize scroll reveal
export function initScrollReveal() {
  const elements = document.querySelectorAll('.reveal-on-scroll');
  if (!elements.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  elements.forEach((el) => observer.observe(el));
}

// Initialize active notice banner
export async function initNoticeBanner() {
  const bannerContainer = document.getElementById('live-notice-banner');
  if (!bannerContainer) return;

  try {
    const res = await fetch('/api/public/notices');
    if (!res.ok) return;
    const { notices } = await res.json();
    if (!notices || notices.length === 0) return;

    // Highest severity: storm > schedule > info > promo
    const highest = notices[0];
    bannerContainer.innerHTML = `
      <div class="notice-banner severity-${highest.severity || 'info'}">
        <div class="container" style="display:flex; align-items:center; justify-content:space-between; gap:1rem; width:100%;">
          <div style="display:flex; align-items:center; gap:0.625rem;">
            <span style="font-weight:700; text-transform:uppercase; font-size:0.75rem; letter-spacing:0.05em; background:rgba(0,0,0,0.08); padding:2px 8px; border-radius:4px;">
              ${highest.severity}
            </span>
            <span><strong>${highest.title}</strong> — ${highest.body}</span>
          </div>
          <a href="/updates" style="text-decoration:underline; font-weight:600; white-space:nowrap; font-size:0.8125rem;">View all updates &rarr;</a>
        </div>
      </div>
    `;
    bannerContainer.style.display = 'block';
  } catch (err) {
    // Silently continue if notices unavailable
  }
}

// Header scroll state
export function initHeaderScroll() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  }, { passive: true });
}

// Animate real statistics counters
export function initCounters() {
  const counters = document.querySelectorAll('[data-counter-target]');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseFloat(el.getAttribute('data-counter-target'));
        const suffix = el.getAttribute('data-counter-suffix') || '';
        const decimals = parseInt(el.getAttribute('data-counter-decimals') || '0', 10);
        let current = 0;
        const step = target / 35;

        const timer = setInterval(() => {
          current += step;
          if (current >= target) {
            current = target;
            clearInterval(timer);
          }
          el.textContent = current.toFixed(decimals) + suffix;
        }, 30);

        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach((c) => observer.observe(c));
}

// Document Ready Initialization
document.addEventListener('DOMContentLoaded', () => {
  initHeaderScroll();
  initScrollReveal();
  initNoticeBanner();
  initCounters();
});
