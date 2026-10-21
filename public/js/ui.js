/**
 * public/js/ui.js
 * Shared client UI controller:
 * - Mathematical smooth page transitions with brand logo overlay
 * - Scroll reveals with spring/quintic physics
 * - Toast notifications
 * - Live notice banner
 * - Counter animations
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

// -------------------------------------------------------------
// Advanced Mathematical Page Transitions with Brand Logo
// -------------------------------------------------------------
export function initPageTransitions() {
  let curtain = document.getElementById('page-transition-curtain');
  if (!curtain) {
    curtain = document.createElement('div');
    curtain.id = 'page-transition-curtain';
    curtain.className = 'page-transition-curtain';
    curtain.innerHTML = `
      <div class="transition-logo-badge">
        <div class="transition-logo-icon-wrap">
          <svg class="transition-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <path d="M9 22V12h6v10"/>
          </svg>
        </div>
        <div class="transition-logo-text">Houston Roofing</div>
        <div class="transition-tagline">&amp; Construction</div>
      </div>
    `;
    document.body.appendChild(curtain);
  }

  // Smooth entry reveal: display logo for 300ms, then smoothly fade out curtain
  setTimeout(() => {
    curtain.classList.add('is-hidden');
  }, 300);

  // Handle bfcache back/forward navigation
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      curtain.classList.add('is-hidden');
      curtain.classList.remove('is-entering');
    }
  });

  // Intercept internal navigation link clicks
  document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    // Skip external links, hash anchors, mailto, tel, downloads, or target="_blank"
    if (
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:') ||
      anchor.getAttribute('target') === '_blank' ||
      anchor.hasAttribute('download') ||
      href.includes('ics') ||
      href.includes('/api/')
    ) {
      return;
    }

    // Only apply to same-origin pages
    if (href.startsWith('/') || href.startsWith(window.location.origin)) {
      const url = new URL(href, window.location.origin);
      if (url.origin === window.location.origin && url.pathname !== window.location.pathname) {
        e.preventDefault();
        curtain.classList.remove('is-hidden');
        curtain.classList.add('is-entering');

        // Allow logo badge to remain visible for 340ms during mathematical easing transition
        setTimeout(() => {
          window.location.href = href;
        }, 340);
      }
    }
  });
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
  initPageTransitions();
  initHeaderScroll();
  initScrollReveal();
  initNoticeBanner();
  initCounters();
});
