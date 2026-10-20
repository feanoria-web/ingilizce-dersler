(() => {
  'use strict';
  let lessons = Array.isArray(window.LESSON_CATALOG) ? window.LESSON_CATALOG : [];
  const levelNames = { A1: 'İlk adımlar', A2: 'Bir adım ileri', B1: 'Sohbeti sürdür', YDS: 'Sınava hazırlık' };
  const buttons = [...document.querySelectorAll('[data-level]')];
  const section = document.getElementById('lessons-section');
  const list = document.getElementById('lesson-list');
  const search = document.getElementById('lesson-search');
  let selected = '';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize = value => String(value ?? '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
  function durationLabel(value) { return typeof value === 'number' ? `${value} dk` : value; }
  function dateLabel(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(date);
  }
  function updateCounts() {
    document.querySelectorAll('[data-count]').forEach(element => {
      const count = lessons.filter(lesson => lesson.level === element.dataset.count).length;
      element.textContent = count ? `${count} ders içeriği` : 'Dersler hazırlanıyor';
    });
  }
  updateCounts();
  function render() {
    const query = normalize(search.value.trim());
    const all = lessons.filter(lesson => lesson.level === selected);
    const matching = all.filter(lesson => normalize([lesson.title, lesson.description, ...(lesson.tags || [])].join(' ')).includes(query));
    list.innerHTML = matching.map(lesson => {
      const date = dateLabel(lesson.date);
      const metadata = [durationLabel(lesson.duration), date].filter(Boolean);
      const number = lesson.number == null ? '+' : String(lesson.number).padStart(2, '0');
      const url = String(lesson.url || '');
      if (!/^lessons\/(a1|a2|b1|yds)\//.test(url) || url.split('/').includes('..')) return '';
      return `<a class="lesson-row ${lesson.number == null ? 'lesson-extra' : ''}" href="${escape(url)}"><span class="lesson-number" aria-hidden="true">${escape(number)}</span><span class="lesson-info"><span class="lesson-kicker">${lesson.number == null ? 'EK ÇALIŞMA' : `DERS ${escape(lesson.number)}`}</span><h3>${escape(lesson.title)}</h3><p>${escape(lesson.description)}</p>${lesson.tags?.length ? `<span class="lesson-tags">${lesson.tags.slice(0, 3).map(tag => `<span>${escape(tag)}</span>`).join('')}</span>` : ''}</span><span class="lesson-end"><span class="lesson-meta">${metadata.map(item => `<span>${escape(item)}</span>`).join('')}</span><span class="lesson-open">Dersi aç <span aria-hidden="true">↗</span></span></span></a>`;
    }).join('');
    const empty = document.getElementById('empty-state');
    empty.hidden = matching.length > 0;
    document.getElementById('empty-title').textContent = all.length ? 'Aradığın ders bulunamadı.' : selected === 'YDS' ? 'YDS dersleri hazırlanıyor.' : 'Yeni dersler yolda.';
    document.getElementById('empty-description').textContent = all.length ? 'Başka bir kelimeyle aramayı dene.' : selected === 'YDS' ? 'YDS dersleri ve soru çalışmaları eklendiğinde burada görünecek.' : `${selected} dersleri eklendiğinde burada görünecek. Diğer seviyelerdeki dersleri de keşfedebilirsin.`;
    document.getElementById('results-status').textContent = `${selected} seviyesinde ${matching.length} ders içeriği gösteriliyor.`;
  }
  function select(level, scroll = false) {
    selected = Object.hasOwn(levelNames, level) ? level : '';
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.level === selected)));
    section.hidden = !selected;
    document.getElementById('welcome-note').hidden = Boolean(selected);
    if (!selected) return;
    search.value = '';
    document.getElementById('selected-label').textContent = `${selected} · ${levelNames[selected]}`;
    render();
    if (scroll) {
      document.getElementById('lessons-title').focus({ preventScroll: true });
      section.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }
  }
  buttons.forEach(button => button.addEventListener('click', () => {
    const level = button.dataset.level;
    if (location.hash !== `#${level}`) history.pushState(null, '', `#${level}`);
    select(level, true);
  }));
  search.addEventListener('input', render);
  window.addEventListener('hashchange', () => select(location.hash.slice(1).toUpperCase()));
  window.addEventListener('popstate', () => select(location.hash.slice(1).toUpperCase()));
  select(location.hash.slice(1).toUpperCase());

  // This runs only on the lesson menu. An open lesson is never interrupted.
  const catalogUrl = new URL('catalog.json', document.currentScript?.src || new URL('assets/app.js', location.href));
  let pendingRefresh = null;
  function validCatalog(value) {
    if (!Array.isArray(value) || value.length > 10000) return null;
    const ids = new Set(), urls = new Set(), clean = [];
    for (const lesson of value) {
      if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson)
        || !Object.hasOwn(levelNames, lesson.level)
        || typeof lesson.id !== 'string' || !lesson.id || lesson.id.length > 1000
        || typeof lesson.title !== 'string' || !lesson.title.trim() || lesson.title.length > 240
        || typeof lesson.description !== 'string' || lesson.description.length > 1200
        || !(lesson.number === null || Number.isInteger(lesson.number) && lesson.number > 0)
        || typeof lesson.order !== 'number' || !Number.isFinite(lesson.order) || lesson.order < 0
        || typeof lesson.duration !== 'string' || lesson.duration.length > 80
        || typeof lesson.date !== 'string' || lesson.date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(lesson.date)
        || !Array.isArray(lesson.tags) || lesson.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 80)
        || typeof lesson.url !== 'string' || lesson.url.length > 3000
        || !lesson.url.startsWith(`lessons/${lesson.level.toLowerCase()}/`) || !/\.html?$/i.test(lesson.url)) return null;
      let segments;
      try { segments = lesson.url.split('/').map(decodeURIComponent); } catch (_) { return null; }
      if (segments.some(segment => !segment || segment === '.' || segment === '..' || /[\\/?#\u0000-\u001f\u007f]/.test(segment))) return null;
      if (segments.slice(1).join('/').replace(/\.html?$/i, '') !== lesson.id || ids.has(lesson.id) || urls.has(lesson.url)) return null;
      if (lesson.date) {
        const date = new Date(`${lesson.date}T00:00:00Z`);
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== lesson.date) return null;
      }
      ids.add(lesson.id); urls.add(lesson.url);
      // Keep a stable field order so an unchanged response leaves the DOM alone.
      clean.push({id:lesson.id,level:lesson.level,title:lesson.title,description:lesson.description,
        number:lesson.number,order:lesson.order,date:lesson.date,duration:lesson.duration,tags:[...lesson.tags],url:lesson.url});
    }
    return clean;
  }
  let catalogFingerprint = JSON.stringify(validCatalog(lessons) || lessons);
  function refreshCatalog() {
    if (document.visibilityState !== 'visible' || pendingRefresh) return pendingRefresh;
    pendingRefresh = Promise.resolve().then(async () => {
      if (document.visibilityState !== 'visible') return;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(catalogUrl.href, {cache:'no-store',credentials:'omit',signal:controller.signal});
        if (!response.ok) return;
        const next = validCatalog(await response.json());
        if (!next) return;
        const fingerprint = JSON.stringify(next);
        if (fingerprint === catalogFingerprint) return;
        catalogFingerprint = fingerprint;
        lessons = next;
        updateCounts();
        if (selected) {
          const left = window.scrollX, top = window.scrollY;
          render();
          window.scrollTo({left,top,behavior:'instant'});
        }
      } finally { clearTimeout(timeout); }
    }).catch(() => { /* Keep the last working menu when offline or during deployment. */ })
      .finally(() => { pendingRefresh = null; });
    return pendingRefresh;
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refreshCatalog(); });
  window.addEventListener('online', () => { void refreshCatalog(); });
  setInterval(() => { void refreshCatalog(); }, 60000);
  void refreshCatalog();
})();
