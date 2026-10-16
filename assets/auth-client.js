(() => {
  'use strict';
  const KEY = 'english-access-v1';
  const root = new URL('../', document.currentScript.src);
  const page = document.body.dataset.accessPage || 'protected';
  if (page === 'protected') {
    document.body.classList.add('access-locked');
    if (!document.querySelector('.access-status')) {
      const status = document.createElement('div'); status.className = 'access-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      const brand = document.createElement('strong'); brand.textContent = 'English';
      const paragraph = document.createElement('p'); paragraph.textContent = 'Oturumunuz kontrol ediliyor…';
      status.append(brand, paragraph); document.body.prepend(status);
    }
  }
  document.documentElement.classList.remove('access-pending');
  const configured = String(window.ACCESS_CONFIG?.apiBase || '').trim();
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  let apiBase = '';
  let configurationError = '';
  try {
    if (!configured && !local) throw new Error('Merkezi giriş hizmeti henüz bağlanmadı. Yönetici, GitHub Pages için API adresini ayarlamalıdır.');
    const candidate = new URL(configured || location.origin);
    if (!['https:', 'http:'].includes(candidate.protocol) || candidate.username || candidate.password || candidate.search || candidate.hash) throw new Error('Merkezi hizmet adresi geçersiz.');
    if (location.protocol === 'https:' && candidate.protocol !== 'https:') throw new Error('Merkezi hizmet adresi HTTPS kullanmalıdır.');
    apiBase = candidate.href.replace(/\/$/, '');
  } catch (error) { configurationError = error.message; }
  let current = null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (saved && typeof saved.token === 'string' && saved.token.length >= 16 && ['student', 'admin'].includes(saved.role)) current = saved;
  } catch (_) { /* Session unavailable or malformed: request fresh authentication. */ }
  function forget() { current = null; try { sessionStorage.removeItem(KEY); } catch (_) {} }
  function remember(value) {
    if (!value || typeof value.token !== 'string' || !['student', 'admin'].includes(value.role)) throw new Error('Giriş yanıtı doğrulanamadı.');
    const next = { token: value.token, role: value.role, expiresAt: value.expiresAt, ...(value.student ? {student: value.student} : {}) };
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch (_) { throw new Error('Oturum kaydedilemiyor. Tarayıcınızda bu site için oturum depolamasına izin verin.'); }
    current = next;
    return next;
  }
  function destination(value, fallback) {
    if (typeof value !== 'string' || !value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value) || /[\\\r\n]/.test(value)) return new URL(fallback, root).href;
    try { const candidate = new URL(value, root); return candidate.origin === location.origin && candidate.pathname.startsWith(root.pathname) && !/\/(login|admin)\.html$/.test(candidate.pathname) ? candidate.href : new URL(fallback, root).href; } catch (_) { return new URL(fallback, root).href; }
  }
  function loginUrl() {
    const url = new URL('login.html', root);
    const relative = location.pathname.startsWith(root.pathname) ? location.pathname.slice(root.pathname.length) + location.search + location.hash : 'index.html';
    url.searchParams.set('return', relative);
    return url.href;
  }
  async function request(path, options = {}) {
    if (configurationError) throw new Error(configurationError);
    if (typeof path !== 'string' || !path.startsWith('/api/') || path.startsWith('//')) throw new Error('Geçersiz hizmet isteği.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const headers = new Headers(options.headers || {});
    if (current?.token && !['/api/auth/login', '/api/admin/login'].includes(path)) headers.set('Authorization', `Bearer ${current.token}`);
    let body = options.body;
    if (body != null && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) { body = JSON.stringify(body); headers.set('Content-Type', 'application/json'); }
    if (typeof body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    let response;
    try { response = await fetch(apiBase + path, { ...options, body, headers, signal: options.signal || controller.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' }); }
    catch (error) { throw new Error(error.name === 'AbortError' ? 'Hizmet zamanında yanıt vermedi. Lütfen yeniden deneyin.' : 'Merkezi hizmete ulaşılamıyor. İnternet bağlantısını ve hizmet adresini kontrol edin.'); }
    finally { clearTimeout(timer); }
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json().catch(() => null) : await response.text();
    if (!response.ok) {
      if ((response.status === 401 || response.status === 403) && current && !['/api/auth/login', '/api/admin/login'].includes(path)) {
        forget();
        if (page === 'protected') location.replace(loginUrl());
        if (page === 'admin') window.dispatchEvent(new Event('english:session-expired'));
      }
      const message = data && typeof data === 'object' && typeof data.error === 'string' ? data.error : data && typeof data === 'object' && typeof data.message === 'string' ? data.message : response.status === 429 ? 'Çok fazla deneme yapıldı. Biraz bekleyip yeniden deneyin.' : response.status === 401 || response.status === 403 ? 'Şifre doğrulanamadı veya oturumunuz sona erdi.' : 'İşlem tamamlanamadı. Lütfen yeniden deneyin.';
      throw new Error(message);
    }
    return data;
  }
  async function logout() {
    window.dispatchEvent(new Event('english:logout'));
    try { if (current) await request('/api/auth/logout', {method:'POST'}); } catch (_) {} finally { forget(); location.replace(new URL('login.html', root)); }
  }
  function formMessage(id, message, success = false) { const element = document.getElementById(id); if (element) {element.textContent = message; element.classList.toggle('is-success', success);} }
  function showAdminLogin(message = '') {
    document.getElementById('admin-signin').hidden = false;
    document.getElementById('admin-dashboard').hidden = true;
    if (message) formMessage('admin-login-error', message);
  }
  function addSessionChip() {
    const header = document.querySelector('.site-header');
    if (!header || !current || header.querySelector('.session-chip')) return;
    const chip = document.createElement('div'); chip.className = 'session-chip';
    const name = document.createElement('strong'); name.textContent = current.role === 'admin' ? 'Öğretmen oturumu' : current.student?.name || 'Öğrenci oturumu'; chip.append(name);
    if (current.role === 'admin') { const management = document.createElement('a'); management.href = new URL('admin.html', root); management.textContent = 'Yönetim'; chip.append(management); }
    const exit = document.createElement('button'); exit.type = 'button'; exit.className = 'text-button'; exit.textContent = 'Çıkış →'; exit.addEventListener('click', logout); chip.append(exit); header.append(chip);
  }
  function bindForms() {
    document.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => { const input = document.getElementById(button.dataset.passwordToggle); const open = input.type === 'password'; input.type = open ? 'text' : 'password'; button.textContent = open ? 'Gizle' : 'Göster'; button.setAttribute('aria-label', open ? 'Şifreyi gizle' : 'Şifreyi göster'); button.setAttribute('aria-pressed', String(open)); }));
    document.querySelectorAll('[data-access-logout]').forEach(button => button.addEventListener('click', logout));
    [['student-login', '/api/auth/login', 'student-password', 'login-error'], ['admin-login', '/api/admin/login', 'admin-password', 'admin-login-error']].forEach(([formId, endpoint, fieldId, errorId]) => {
      const form = document.getElementById(formId); if (!form) return;
      form.addEventListener('submit', async event => {
        event.preventDefault(); const field = document.getElementById(fieldId); const button = form.querySelector('[type=submit]');
        if (!field.value.trim()) { formMessage(errorId, 'Lütfen şifrenizi yazın.'); field.focus(); return; }
        button.disabled = true; formMessage(errorId, 'Giriş kontrol ediliyor…');
        try {
          const result = await request(endpoint, {method:'POST', body:{password: field.value}}); field.value = '';
          if (formId === 'admin-login' && result?.role !== 'admin') throw new Error('Yönetici yetkisi doğrulanamadı.');
          remember(result);
          if (result.role === 'admin') location.replace(new URL('admin.html', root));
          else location.replace(destination(new URLSearchParams(location.search).get('return'), 'index.html'));
        } catch (error) { field.value = ''; formMessage(errorId, error.message); field.focus(); }
        finally { button.disabled = false; }
      });
    });
    window.addEventListener('english:session-expired', () => showAdminLogin('Oturumunuz sona erdi. Yönetici şifrenizle yeniden giriş yapın.'));
  }
  async function initialize() {
    bindForms();
    if (configurationError) {
      if (page === 'login') formMessage('login-error', configurationError);
      else if (page === 'admin') formMessage('admin-login-error', configurationError);
      else { const status = document.querySelector('.access-status'); if (status) { const paragraph = status.querySelector('p'); if (paragraph) paragraph.textContent = configurationError; const link = document.createElement('a'); link.href = new URL('login.html', root); link.textContent = 'Giriş sayfasına dön'; status.append(link); } }
      return null;
    }
    if (!current) { if (page === 'protected') location.replace(loginUrl()); return null; }
    try {
      const identity = await request('/api/auth/me');
      if (!identity || !['student', 'admin'].includes(identity.role) || identity.role !== current?.role) { forget(); if(page === 'protected') location.replace(loginUrl()); throw new Error('Oturum doğrulanamadı.'); }
      current = {...current, role:identity.role, ...(identity.student ? {student:identity.student} : {})};
      if (page === 'protected') { document.body.classList.remove('access-locked'); const status = document.querySelector('.access-status'); if (status) status.remove(); addSessionChip(); }
      else if (page === 'admin') { if (current.role === 'admin') { document.getElementById('admin-signin').hidden = true; document.getElementById('admin-dashboard').hidden = false; } else showAdminLogin(); }
      else if (page === 'login') location.replace(current.role === 'admin' ? new URL('admin.html', root) : destination(new URLSearchParams(location.search).get('return'), 'index.html'));
      window.dispatchEvent(new CustomEvent('english:ready', {detail:{role:current.role}}));
      return {...current};
    } catch (error) {
      if (page === 'protected') { const status = document.querySelector('.access-status p'); if (status) status.textContent = error.message; }
      else formMessage(page === 'admin' ? 'admin-login-error' : 'login-error', error.message);
      return null;
    }
  }
  const client = {request, session:() => current ? {...current} : null, logout, apiBase, ready:null};
  window.EnglishAccess = client;
  client.ready = initialize();
})();
