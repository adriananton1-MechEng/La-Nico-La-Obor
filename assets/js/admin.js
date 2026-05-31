/* ===========================================================
   La Nico la Obor — admin panel
   GitHub-backed editor for reviews and gallery.
   Token is stored only in the user's browser localStorage.
   =========================================================== */

(function () {
  'use strict';

  // ----- Configuration -----
  const REPO_OWNER = 'adriananton1-MechEng';
  const REPO_NAME = 'La-Nico-La-Obor';
  const BRANCH = 'main';
  const TOKEN_KEY = 'la-nico-admin-token';
  const API = 'https://api.github.com';

  const PATHS = {
    reviews: 'data/reviews.json',
    gallery: 'data/gallery.json',
  };

  // ----- State -----
  const state = {
    token: null,
    user: null,
    reviews: { items: [], sha: null, dirty: false },
    gallery: { items: [], sha: null, dirty: false },
  };

  // ----- DOM helpers -----
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, '');
      else if (v !== false && v != null) node.setAttribute(k, v);
    }
    for (const child of children) {
      if (child == null || child === false) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function stars(n) {
    const r = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  // UTF-8 safe base64
  function b64encodeUtf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64decodeUtf8(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function arrayBufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  // ----- Toast -----
  let toastTimer;
  function toast(msg, kind = 'info') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 4000);
  }

  // ----- GitHub API client -----
  async function gh(path, init = {}) {
    const res = await fetch(API + path, {
      ...init,
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Authorization': `Bearer ${state.token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      const errText = await res.text();
      const err = new Error(`GitHub ${res.status}: ${errText}`);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function ghGetFile(path) {
    return gh(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`);
  }

  async function ghPutFile(path, contentBase64, sha, message) {
    const body = { message, content: contentBase64, branch: BRANCH };
    if (sha) body.sha = sha;
    return gh(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  // ----- Auth -----
  async function tryLogin(token) {
    state.token = token;
    const user = await gh('/user');
    state.user = user;
    return user;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    state.token = null;
    state.user = null;
    location.reload();
  }

  // ----- Data load -----
  async function loadData() {
    const [revFile, galFile] = await Promise.all([
      ghGetFile(PATHS.reviews).catch(() => null),
      ghGetFile(PATHS.gallery).catch(() => null),
    ]);

    if (revFile) {
      state.reviews.sha = revFile.sha;
      const json = JSON.parse(b64decodeUtf8(revFile.content));
      state.reviews.items = (json.reviews || []).map(r => ({ id: r.id || uid(), ...r }));
    }
    if (galFile) {
      state.gallery.sha = galFile.sha;
      const json = JSON.parse(b64decodeUtf8(galFile.content));
      state.gallery.items = (json.images || []).map(i => ({ id: i.id || uid(), ...i }));
    }
  }

  // ----- Reviews UI -----
  function renderReviews() {
    const list = $('#reviewsAdminList');
    list.innerHTML = '';
    if (!state.reviews.items.length) {
      list.appendChild(el('p', { class: 'muted' }, 'Nu există recenzii încă.'));
      return;
    }
    const sorted = [...state.reviews.items].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    for (const r of sorted) {
      const row = el('div', { class: 'admin-row', dataset: { id: r.id } });

      const main = el('div', { class: 'row-main' });
      main.appendChild(el('div', { class: 'row-title' },
        el('span', { style: 'color:#c79a3a;' }, stars(r.rating)),
        el('span', {}, r.name || 'Anonim'),
        el('span', { class: 'muted', style: 'font-size: 0.85em;' }, r.date || '')
      ));
      main.appendChild(el('div', { class: 'row-sub' }, r.comment || ''));

      const actions = el('div', { class: 'row-actions' });
      actions.appendChild(el('button', {
        class: 'btn btn-ghost btn-sm',
        onclick: () => editReview(r.id),
      }, 'Editează'));
      actions.appendChild(el('button', {
        class: 'btn btn-danger btn-sm',
        onclick: () => deleteReview(r.id),
      }, 'Șterge'));

      row.appendChild(main);
      row.appendChild(actions);
      list.appendChild(row);
    }
  }

  function addReview(ev) {
    ev.preventDefault();
    const f = ev.target;
    const review = {
      id: uid(),
      name: f.name.value.trim(),
      rating: Number(f.rating.value),
      comment: f.comment.value.trim(),
      date: f.date.value || todayISO(),
    };
    if (!review.name || !review.rating || !review.comment) {
      toast('Completați toate câmpurile.', 'error');
      return;
    }
    state.reviews.items.push(review);
    markDirty('reviews');
    renderReviews();
    f.reset();
    $('#ar-date').value = todayISO();
    toast('Recenzia a fost adăugată. Nu uitați să salvați.', 'info');
  }

  function editReview(id) {
    const r = state.reviews.items.find(x => x.id === id);
    if (!r) return;
    const newComment = prompt('Comentariu:', r.comment);
    if (newComment === null) return;
    const newRating = prompt('Notă (1-5):', String(r.rating));
    if (newRating === null) return;
    const newName = prompt('Nume:', r.name);
    if (newName === null) return;

    r.comment = newComment.trim();
    r.rating = Math.max(1, Math.min(5, parseInt(newRating, 10) || r.rating));
    r.name = newName.trim() || r.name;
    markDirty('reviews');
    renderReviews();
  }

  function deleteReview(id) {
    if (!confirm('Ștergeți această recenzie?')) return;
    state.reviews.items = state.reviews.items.filter(r => r.id !== id);
    markDirty('reviews');
    renderReviews();
  }

  async function saveReviews() {
    if (!state.reviews.dirty) return;
    const btn = $('#reviewsSaveBtn');
    const status = $('#reviewsStatus');
    btn.disabled = true;
    status.textContent = 'Se salvează…';

    try {
      const payload = { reviews: state.reviews.items };
      const json = JSON.stringify(payload, null, 2) + '\n';
      const message = `Actualizare recenzii (${state.reviews.items.length} în total)`;
      const res = await ghPutFile(PATHS.reviews, b64encodeUtf8(json), state.reviews.sha, message);
      state.reviews.sha = res.content.sha;
      state.reviews.dirty = false;
      updateDirtyUI();
      status.textContent = 'Toate modificările sunt salvate.';
      toast('Recenzii salvate și commit creat ✓', 'success');
    } catch (e) {
      status.textContent = 'Eroare la salvare.';
      toast('Eroare: ' + e.message, 'error');
      btn.disabled = false;
    }
  }

  // ----- Gallery UI -----
  function renderGallery() {
    const list = $('#galleryAdminList');
    list.innerHTML = '';
    if (!state.gallery.items.length) {
      list.appendChild(el('p', { class: 'muted' }, 'Nu există imagini încă.'));
      return;
    }
    for (const img of state.gallery.items) {
      const row = el('div', { class: 'admin-row', dataset: { id: img.id } });

      const main = el('div', { class: 'row-main', style: 'display: flex; gap: 14px; align-items: center;' });
      main.appendChild(el('img', { class: 'row-thumb', src: img.src, alt: img.alt || '' }));

      const text = el('div', { style: 'min-width: 0;' });
      text.appendChild(el('div', { class: 'row-title' }, img.caption || el('em', { class: 'muted' }, '(fără descriere)')));
      text.appendChild(el('div', { class: 'row-sub' }, img.src));
      main.appendChild(text);

      const actions = el('div', { class: 'row-actions' });
      actions.appendChild(el('button', {
        class: 'btn btn-ghost btn-sm',
        onclick: () => editImage(img.id),
      }, 'Editează'));
      actions.appendChild(el('button', {
        class: 'btn btn-danger btn-sm',
        onclick: () => deleteImage(img.id),
      }, 'Șterge'));

      row.appendChild(main);
      row.appendChild(actions);
      list.appendChild(row);
    }
  }

  function editImage(id) {
    const img = state.gallery.items.find(x => x.id === id);
    if (!img) return;
    const newCaption = prompt('Descriere (caption):', img.caption || '');
    if (newCaption === null) return;
    const newAlt = prompt('Text alternativ (alt):', img.alt || '');
    if (newAlt === null) return;
    img.caption = newCaption.trim();
    img.alt = newAlt.trim();
    markDirty('gallery');
    renderGallery();
  }

  function deleteImage(id) {
    if (!confirm('Ștergeți această imagine din galerie?\n(Fișierul rămâne în depozit, dar nu va mai fi afișat.)')) return;
    state.gallery.items = state.gallery.items.filter(i => i.id !== id);
    markDirty('gallery');
    renderGallery();
  }

  async function uploadImage(ev) {
    ev.preventDefault();
    const fileInput = $('#img-file');
    const file = fileInput.files[0];
    if (!file) { toast('Alegeți o imagine.', 'error'); return; }
    if (file.size > 8 * 1024 * 1024) {
      toast('Imagine prea mare (max 8 MB).', 'error'); return;
    }

    const btn = $('#uploadImageBtn');
    const status = $('#uploadStatus');
    btn.disabled = true;
    status.textContent = 'Se încarcă pe GitHub…';

    try {
      const buf = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);

      const ext = (file.name.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const slug = (file.name.replace(/\.[^.]+$/, '') || 'foto')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'foto';
      const filename = `${stamp}-${slug}-${uid().slice(0, 6)}${ext}`;
      const path = `images/${filename}`;

      const res = await ghPutFile(path, base64, null, `Adăugare imagine ${filename}`);

      const caption = $('#img-caption').value.trim();
      const alt = $('#img-alt').value.trim();

      state.gallery.items.push({
        id: uid(),
        src: path,
        alt: alt || caption || 'Fotografie La Nico la Obor',
        caption: caption,
      });
      markDirty('gallery');
      renderGallery();

      $('#addImageForm').reset();
      $('#imgPreview').hidden = true;
      $('#imgPreview').src = '';
      status.textContent = '';
      toast('Imagine încărcată. Apăsați „Salvează & commit" pentru a o publica.', 'success');
    } catch (e) {
      status.textContent = '';
      toast('Eroare la încărcare: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function saveGallery() {
    if (!state.gallery.dirty) return;
    const btn = $('#gallerySaveBtn');
    const status = $('#galleryStatus');
    btn.disabled = true;
    status.textContent = 'Se salvează…';

    try {
      const payload = { images: state.gallery.items };
      const json = JSON.stringify(payload, null, 2) + '\n';
      const message = `Actualizare galerie (${state.gallery.items.length} imagini)`;
      const res = await ghPutFile(PATHS.gallery, b64encodeUtf8(json), state.gallery.sha, message);
      state.gallery.sha = res.content.sha;
      state.gallery.dirty = false;
      updateDirtyUI();
      status.textContent = 'Toate modificările sunt salvate.';
      toast('Galerie salvată și commit creat ✓', 'success');
    } catch (e) {
      status.textContent = 'Eroare la salvare.';
      toast('Eroare: ' + e.message, 'error');
      btn.disabled = false;
    }
  }

  // ----- Dirty tracking -----
  function markDirty(which) {
    state[which].dirty = true;
    updateDirtyUI();
  }
  function updateDirtyUI() {
    $('#reviewsBadge').hidden = !state.reviews.dirty;
    $('#galleryBadge').hidden = !state.gallery.dirty;
    $('#reviewsSaveBtn').disabled = !state.reviews.dirty;
    $('#gallerySaveBtn').disabled = !state.gallery.dirty;
    if (state.reviews.dirty) $('#reviewsStatus').textContent = 'Modificări nesalvate.';
    if (state.gallery.dirty) $('#galleryStatus').textContent = 'Modificări nesalvate.';
  }

  // ----- Tabs -----
  function initTabs() {
    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        $$('.panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        $('#' + tab.dataset.panel).classList.add('active');
      });
    });
  }

  // ----- Image preview -----
  function initImagePreview() {
    $('#img-file').addEventListener('change', (ev) => {
      const file = ev.target.files[0];
      const preview = $('#imgPreview');
      if (!file) { preview.hidden = true; return; }
      preview.src = URL.createObjectURL(file);
      preview.hidden = false;
    });
  }

  // ----- Bootstrap -----
  async function showDashboard() {
    $('#loginCard').hidden = true;
    $('#dashboard').hidden = false;
    $('#logoutBtn').hidden = false;
    $('#whoami').textContent = state.user.login;

    try {
      await loadData();
      renderReviews();
      renderGallery();
      updateDirtyUI();
    } catch (e) {
      toast('Eroare la încărcarea datelor: ' + e.message, 'error');
    }
  }

  async function handleLogin(ev) {
    ev.preventDefault();
    const token = $('#token').value.trim();
    const status = $('#loginStatus');
    if (!token) { status.textContent = 'Introduceți tokenul.'; status.className = 'form-status error'; return; }

    status.textContent = 'Se verifică tokenul…';
    status.className = 'form-status';
    try {
      const user = await tryLogin(token);
      localStorage.setItem(TOKEN_KEY, token);
      status.textContent = `Bun venit, ${user.login}.`;
      status.className = 'form-status success';
      await showDashboard();
    } catch (e) {
      state.token = null;
      status.textContent = 'Token invalid sau fără permisiuni: ' + e.message;
      status.className = 'form-status error';
    }
  }

  async function bootstrap() {
    $('#year').textContent = new Date().getFullYear();
    $('#ar-date').value = todayISO();

    $('#loginForm').addEventListener('submit', handleLogin);
    $('#logoutBtn').addEventListener('click', (ev) => { ev.preventDefault(); logout(); });
    $('#addReviewForm').addEventListener('submit', addReview);
    $('#addImageForm').addEventListener('submit', uploadImage);
    $('#reviewsSaveBtn').addEventListener('click', saveReviews);
    $('#gallerySaveBtn').addEventListener('click', saveGallery);

    initTabs();
    initImagePreview();

    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
      try {
        await tryLogin(saved);
        await showDashboard();
      } catch (e) {
        localStorage.removeItem(TOKEN_KEY);
        toast('Sesiunea a expirat — autentificați-vă din nou.', 'info');
      }
    }
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
