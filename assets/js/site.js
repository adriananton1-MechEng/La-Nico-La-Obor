/* ===========================================================
   La Nico la Obor — public site JS
   Handles: year, reviews, gallery, lightbox
   =========================================================== */

(function () {
  'use strict';

  const DATA = {
    reviews: 'data/reviews.json',
    gallery: 'data/gallery.json',
  };

  const PENDING_KEY = 'la-nico-pending-review';

  // ---------- utilities ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) node.setAttribute(k, v);
    }
    for (const child of children) {
      if (child == null) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('ro-RO', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
      return iso;
    }
  }

  function stars(n) {
    const r = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
  }

  // ---------- year ----------
  function setYear() {
    const y = $('#year');
    if (y) y.textContent = new Date().getFullYear();
  }

  // ---------- reviews ----------
  async function loadReviews() {
    const list = $('#reviewsList');
    if (!list) return;
    try {
      const res = await fetch(DATA.reviews, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      renderReviews(list, data.reviews || []);
    } catch (e) {
      list.innerHTML = '';
      list.appendChild(el('div', { class: 'reviews-empty' },
        'Recenziile nu pot fi încărcate momentan. Reîncărcați pagina sau reveniți mai târziu.'));
    }
  }

  function renderReviews(list, reviews) {
    list.innerHTML = '';
    if (!reviews.length) {
      list.appendChild(el('div', { class: 'reviews-empty' },
        'Încă nu avem recenzii. Fiți primul care lasă o părere — vă mulțumim!'));
      return;
    }
    // newest first
    const sorted = [...reviews].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    for (const r of sorted) {
      list.appendChild(reviewCard(r));
    }
  }

  function reviewCard(r) {
    const card = el('article', { class: 'review-card' });
    card.appendChild(el('div', { class: 'review-stars', 'aria-label': `${r.rating} din 5 stele` }, stars(r.rating)));
    card.appendChild(el('p', { class: 'review-comment' }, r.comment || ''));
    const meta = el('div', { class: 'review-meta' });
    meta.appendChild(el('span', { class: 'name' }, r.name || 'Anonim'));
    meta.appendChild(el('span', { class: 'date' }, formatDate(r.date)));
    card.appendChild(meta);
    return card;
  }

  function handleReviewForm() {
    const form = $('#reviewForm');
    if (!form) return;
    const status = $('#reviewStatus');

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const review = {
        name: (fd.get('name') || '').toString().trim(),
        rating: Number(fd.get('rating') || 0),
        comment: (fd.get('comment') || '').toString().trim(),
        date: new Date().toISOString().slice(0, 10),
      };

      if (!review.name || !review.comment || !review.rating) {
        status.textContent = 'Vă rugăm completați toate câmpurile și alegeți o notă.';
        status.className = 'form-status error';
        return;
      }

      // Persist locally so it isn't lost; owner will publish via admin after verifying.
      try {
        const queue = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
        queue.push({ ...review, submittedAt: new Date().toISOString() });
        localStorage.setItem(PENDING_KEY, JSON.stringify(queue));
      } catch (e) { /* storage may be unavailable; not critical */ }

      status.textContent = 'Mulțumim! Recenzia va fi publicată după verificare. Pentru o părere directă, sunați-ne la +40 727 774 567.';
      status.className = 'form-status success';
      form.reset();
    });
  }

  // ---------- gallery ----------
  async function loadGallery() {
    const grid = $('#galleryGrid');
    if (!grid) return;
    try {
      const res = await fetch(DATA.gallery, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      renderGallery(grid, data.images || []);
    } catch (e) {
      grid.innerHTML = '';
      grid.appendChild(el('div', { class: 'gallery-empty' },
        'Galeria nu poate fi încărcată momentan.'));
    }
  }

  function renderGallery(grid, images) {
    grid.innerHTML = '';
    if (!images.length) {
      grid.appendChild(el('div', { class: 'gallery-empty' },
        'Galeria este în pregătire. Reveniți curând — vom adăuga fotografii de la tarabă, din piață și cu marfa proaspătă.'));
      return;
    }
    images.forEach((img, idx) => {
      const tile = el('figure', { class: 'gallery-tile', dataset: { index: String(idx) } });
      const image = el('img', {
        src: img.src,
        alt: img.alt || img.caption || 'Fotografie La Nico la Obor',
        loading: 'lazy',
      });
      tile.appendChild(image);
      if (img.caption) tile.appendChild(el('figcaption', {}, img.caption));
      tile.addEventListener('click', () => openLightbox(img));
      grid.appendChild(tile);
    });
  }

  function openLightbox(img) {
    let box = $('#lightbox');
    if (!box) {
      box = el('div', { class: 'lightbox', id: 'lightbox', role: 'dialog', 'aria-label': 'Imagine mărită' });
      box.addEventListener('click', () => box.classList.remove('open'));
      document.body.appendChild(box);
    }
    box.innerHTML = '';
    box.appendChild(el('img', { src: img.src, alt: img.alt || img.caption || '' }));
    if (img.caption) box.appendChild(el('div', { class: 'lightbox-caption' }, img.caption));
    box.classList.add('open');
    document.addEventListener('keydown', escClose, { once: true });
  }
  function escClose(ev) {
    if (ev.key === 'Escape') {
      const box = $('#lightbox');
      if (box) box.classList.remove('open');
    }
  }

  // ---------- init ----------
  document.addEventListener('DOMContentLoaded', () => {
    setYear();
    loadReviews();
    handleReviewForm();
    loadGallery();
  });
})();
