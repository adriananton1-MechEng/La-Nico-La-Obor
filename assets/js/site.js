/* ===========================================================
   La Nico la Obor — public site behaviour
   Nav, scroll reveal, gallery + lightbox, cookie consent.
   No dependencies, no build step.
   =========================================================== */

(function () {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- small DOM helper ---------- */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      node.append(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  /* ---------- current year in footer ---------- */
  function setYear() {
    $$('[data-year]').forEach((n) => { n.textContent = String(new Date().getFullYear()); });
  }

  /* ---------- mark the active nav link ---------- */
  function markCurrentPage() {
    const here = location.pathname.split('/').pop() || 'index.html';
    $$('.nav-links a[href]').forEach((a) => {
      const target = a.getAttribute('href').split('#')[0].split('/').pop();
      if (target && target === here) a.setAttribute('aria-current', 'page');
    });
  }

  /* ---------- mobile navigation ---------- */
  function initNav() {
    const toggle = $('.nav-toggle');
    const list   = $('.nav-links');
    if (!toggle || !list) return;

    const setOpen = (open) => {
      list.dataset.open = String(open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Închide meniul' : 'Deschide meniul');
    };

    setOpen(false);

    toggle.addEventListener('click', () => setOpen(list.dataset.open !== 'true'));

    // Close when a link is followed, on Escape, or on resize to desktop.
    list.addEventListener('click', (e) => {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && list.dataset.open === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 880) setOpen(false);
    });
  }

  /* ---------- scroll reveal ---------- */
  function initReveal() {
    const items = $$('.reveal');
    if (!items.length) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach((n) => n.classList.add('in'));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;
        // Light stagger so a row of cards doesn't pop all at once.
        setTimeout(() => entry.target.classList.add('in'), i * 70);
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });

    items.forEach((n) => io.observe(n));
  }

  /* ---------- gallery ---------- */
  async function initGallery() {
    const grid = $('#galleryGrid');
    if (!grid) return;

    let images = [];
    try {
      const res = await fetch('data/gallery.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      images = Array.isArray(data.images) ? data.images : [];
    } catch (err) {
      grid.replaceChildren(el('div', { class: 'empty-state' },
        'Galeria nu poate fi încărcată momentan. Vă rugăm reîncercați mai târziu.'));
      return;
    }

    if (!images.length) {
      grid.replaceChildren(el('div', { class: 'empty-state' },
        'Galeria este în pregătire. Reveniți curând — vom adăuga fotografii de la tarabă, din piață și cu marfa proaspătă.'));
      return;
    }

    grid.replaceChildren(...images.map((img, i) => {
      const caption = img.caption || '';
      const fig = el('figure', { tabindex: '0', role: 'button',
        'aria-label': 'Mărește: ' + (img.alt || caption || 'fotografie') },
        el('img', { src: img.src, alt: img.alt || caption || '', loading: i < 4 ? 'eager' : 'lazy', decoding: 'async' }),
        caption ? el('figcaption', {}, caption) : null
      );
      const open = () => openLightbox(img);
      fig.addEventListener('click', open);
      fig.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
      return fig;
    }));
  }

  /* ---------- lightbox ---------- */
  let lastFocused = null;

  function openLightbox(img) {
    let box = $('#lightbox');
    if (!box) {
      box = el('div', {
        class: 'lightbox', id: 'lightbox', role: 'dialog',
        'aria-modal': 'true', 'aria-label': 'Imagine mărită', tabindex: '-1',
      });
      box.addEventListener('click', closeLightbox);
      document.body.append(box);
    }

    lastFocused = document.activeElement;
    box.replaceChildren(
      el('img', { src: img.src, alt: img.alt || img.caption || '' }),
      img.caption ? el('div', { class: 'cap' }, img.caption) : null
    );
    box.dataset.open = 'true';
    box.focus();
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onLightboxKey);
  }

  function closeLightbox() {
    const box = $('#lightbox');
    if (!box) return;
    box.dataset.open = 'false';
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onLightboxKey);
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    lastFocused = null;
  }

  function onLightboxKey(e) {
    // The dialog holds no focusable children, so Tab must not escape it.
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'Tab') e.preventDefault();
  }

  /* ---------- cookie consent ----------
     Purely informational: the site sets no tracking cookies of its own.
     The embedded Google reviews widget and map may, so we disclose it. */
  const CONSENT_KEY = 'lanico.consent.v1';

  function initCookieBar() {
    const bar = $('#cookieBar');
    if (!bar) return;

    let stored = null;
    try { stored = localStorage.getItem(CONSENT_KEY); } catch (e) { /* private mode */ }
    if (stored) return;

    // Reveal after a beat so it doesn't fight the hero animation.
    setTimeout(() => { bar.dataset.show = 'true'; }, 900);

    $$('[data-consent]', bar).forEach((btn) => {
      btn.addEventListener('click', () => {
        try { localStorage.setItem(CONSENT_KEY, btn.dataset.consent); } catch (e) { /* ignore */ }
        bar.dataset.show = 'false';
      });
    });
  }

  /* ---------- init ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    setYear();
    markCurrentPage();
    initNav();
    initReveal();
    initGallery();
    initCookieBar();
  });
})();
