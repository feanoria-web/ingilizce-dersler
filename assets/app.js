(() => {
  'use strict';
  const lessons = Array.isArray(window.LESSON_CATALOG) ? window.LESSON_CATALOG : [];
  const levelNames = { A1: 'İlk adımlar', A2: 'Bir adım ileri', B1: 'Sohbeti sürdür' };
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
  document.querySelectorAll('[data-count]').forEach(element => {
    const count = lessons.filter(lesson => lesson.level === element.dataset.count).length;
    element.textContent = count ? `${count} ders içeriği` : 'Dersler hazırlanıyor';
  });
  function render() {
    const query = normalize(search.value.trim());
    const all = lessons.filter(lesson => lesson.level === selected);
    const matching = all.filter(lesson => normalize([lesson.title, lesson.description, ...(lesson.tags || [])].join(' ')).includes(query));
    list.innerHTML = matching.map(lesson => {
      const date = dateLabel(lesson.date);
      const metadata = [durationLabel(lesson.duration), date].filter(Boolean);
      const number = lesson.number == null ? '+' : String(lesson.number).padStart(2, '0');
      const url = String(lesson.url || '');
      if (!/^lessons\/(a1|a2|b1)\//.test(url) || url.split('/').includes('..')) return '';
      return `<a class="lesson-row ${lesson.number == null ? 'lesson-extra' : ''}" href="${escape(url)}"><span class="lesson-number" aria-hidden="true">${escape(number)}</span><span class="lesson-info"><span class="lesson-kicker">${lesson.number == null ? 'EK ÇALIŞMA' : `DERS ${escape(lesson.number)}`}</span><h3>${escape(lesson.title)}</h3><p>${escape(lesson.description)}</p>${lesson.tags?.length ? `<span class="lesson-tags">${lesson.tags.slice(0, 3).map(tag => `<span>${escape(tag)}</span>`).join('')}</span>` : ''}</span><span class="lesson-end"><span class="lesson-meta">${metadata.map(item => `<span>${escape(item)}</span>`).join('')}</span><span class="lesson-open">Dersi aç <span aria-hidden="true">↗</span></span></span></a>`;
    }).join('');
    const empty = document.getElementById('empty-state');
    empty.hidden = matching.length > 0;
    document.getElementById('empty-title').textContent = all.length ? 'Aradığın ders bulunamadı.' : 'Yeni dersler yolda.';
    document.getElementById('empty-description').textContent = all.length ? 'Başka bir kelimeyle aramayı dene.' : `${selected} dersleri eklendiğinde burada görünecek. Diğer seviyelerdeki dersleri de keşfedebilirsin.`;
    const add = document.getElementById('empty-add');
    add.hidden = all.length > 0;
    add.href = `admin.html?level=${encodeURIComponent(selected)}`;
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
})();
