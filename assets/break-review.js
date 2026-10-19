/* A teacher chooses the pages; their short summaries rotate during the break. */
(() => {
  'use strict';
  if (window.EnglishBreakReview) return;

  const make = (tag, cls, value) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (value !== undefined) el.textContent = value;
    return el;
  };
  const text = value => typeof value === 'string' ? value.trim() : '';
  const format = ms => {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  };
  let instance;

  function register(config) {
    if (!config || !Array.isArray(config.pages)) return;
    if (instance) instance.destroy();
    const seen = new Set();
    const pages = config.pages.filter(page => page && Number.isFinite(Number(page.index))).map(page => ({
      id: String(page.id ?? page.index), index: Number(page.index),
      title: text(page.title) || 'Ders özeti',
      summary: (Array.isArray(page.summary) ? page.summary : []).map(text).filter(Boolean).slice(0, 6),
      examples: (Array.isArray(page.examples) ? page.examples : []).filter(Boolean).map(example => ({ en: text(example.en), tr: text(example.tr) })).filter(example => example.en || example.tr).slice(0, 3)
    })).filter(page => {
      if (seen.has(page.id)) return false;
      seen.add(page.id); return true;
    }).sort((a, b) => a.index - b.index);
    if (!pages.length) return;

    const storageKey = `english-break-review:v1:${location.pathname}`;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (_) { /* Storage is optional. */ }
    let eligible = [], chosen = new Set(), slides = [], slideIndex = 0;
    let intervalMs = 15000, remaining = 600000, deadline = 0, nextSlideAt = 0, pausedSlideMs = 15000;
    let running = false, paused = false, opened = false, editing = false;
    let clock = null, previousFocus = null, previousOverflow = '', inlineFrame = null;
    let lastTimerLabel = '';
    let breakSession = null;
    const newId=()=>window.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return (c==='x'?n:(n&3)|8).toString(16);});
    function recordBreak(type,endReason=null) {
      if(!breakSession)return;
      const now=Date.now();
      const left=running&&!paused?Math.max(0,deadline-now):remaining;
      const pausedMs=breakSession.pausedMs+(breakSession.pausedAt===null?0:Math.max(0,now-breakSession.pausedAt));
      const learning={kind:'break',breakId:breakSession.id,durationMinutes:breakSession.durationMinutes,intervalSeconds:intervalMs/1000,
        selectedPages:slides.slice(0,500).map(page=>({id:page.id.slice(0,160),title:page.title.slice(0,180)})),selectedCount:Math.min(2000,slides.length),
        elapsedSeconds:Math.min(breakSession.durationMinutes*60,Math.max(0,Math.floor((breakSession.durationMinutes*60000-left)/1000))),
        pausedSeconds:Math.min(86400,Math.floor(pausedMs/1000)),endReason};
      try {window.dispatchEvent(new CustomEvent('english:learning-event',{detail:{type,learning}}));}catch(_){}
    }

    const root = make('div', 'ebr-root');
    root.dataset.breakReviewRoot = '';
    const dialog = make('dialog', 'ebr-dialog');
    dialog.setAttribute('aria-labelledby', 'ebr-title');
    const shell = make('div', 'ebr-shell');
    const header = make('header', 'ebr-header');
    const titleBlock = make('div');
    const kicker = make('p', 'ebr-kicker', 'DERS ARASI');
    const title = make('h2', 'ebr-title', 'Mola özeti');
    title.id = 'ebr-title';
    titleBlock.append(kicker, title);
    const close = make('button', 'ebr-icon-button', '×');
    close.type = 'button'; close.setAttribute('aria-label', 'Molayı kapat ve derse dön');
    header.append(titleBlock, close);
    const body = make('div', 'ebr-body');
    shell.append(header, body); dialog.append(shell); root.append(dialog);
    document.body.append(root);

    function syncTimer(method, value) {
      try {
        if (config.timer && typeof config.timer[method] === 'function') config.timer[method](value);
      } catch (_) { /* The break remains usable if a lesson has a different timer. */ }
    }
    function stopClock() {
      if (clock !== null) clearInterval(clock);
      clock = null;
    }
    function persist() {
      saved = { selected: [...chosen], known: eligible.map(page => page.id) };
      try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch (_) { /* Private browsing may block storage. */ }
    }
    function selection() {
      const index = typeof config.getIndex === 'function' ? Number(config.getIndex()) : -1;
      eligible = pages.filter(page => !Number.isFinite(index) || index < 0 || page.index <= index);
      const known = new Set(Array.isArray(saved?.known) ? saved.known : []);
      const selected = new Set(Array.isArray(saved?.selected) ? saved.selected : []);
      chosen = new Set(eligible.filter(page => !known.has(page.id) || selected.has(page.id)).map(page => page.id));
      return index;
    }
    function focusFirst() {
      requestAnimationFrame(() => { body.querySelector('select, input, button')?.focus({preventScroll:true}); dialog.scrollTop=0; });
    }
    function show() {
      if (opened || !breakTarget()) return;
      selection(); editing = false;
      previousFocus = document.activeElement; previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden'; opened = true;
      renderSetup();
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else { dialog.setAttribute('open', ''); dialog.setAttribute('aria-modal', 'true'); }
      focusFirst();
    }
    function hide(reason='closed') {
      if(breakSession){recordBreak('break_end',reason==='navigation'?'navigation':'closed');breakSession=null;}
      stopClock(); syncTimer('stop'); running = false; paused = false; opened = false; editing = false;
      if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
    }
    function addButton(parent, label, fn, cls = 'ebr-button') {
      const button = make('button', cls, label); button.type = 'button';
      button.addEventListener('click', fn); parent.append(button); return button;
    }

    function renderSetup() {
      title.textContent = editing ? 'Özet sayfalarını değiştir' : 'Molayı hazırlayın';
      body.replaceChildren();
      const intro = make('p', 'ebr-intro', 'İşlediğiniz sayfaları seçin. Seçtiğiniz konular mola boyunca sırayla döner; ders sayfanız aynı yerde kalır.');
      body.append(intro);
      const options = make('div', 'ebr-options');
      const durationLabel = make('label', 'ebr-field', 'Mola süresi');
      const duration = make('select'); duration.setAttribute('aria-label', 'Mola süresi');
      for (const minutes of [10, 15]) {
        const option = make('option', '', `${minutes} dakika`); option.value = String(minutes); duration.append(option);
      }
      duration.value = remaining > 600000 ? '15' : '10'; duration.disabled = editing;
      durationLabel.append(duration);
      const intervalLabel = make('label', 'ebr-field', 'Özet değiştirme sıklığı');
      const interval = make('select'); interval.setAttribute('aria-label', 'Özet değiştirme sıklığı');
      for (const seconds of [10, 15, 20, 30]) {
        const option = make('option', '', `${seconds} saniyede bir`); option.value = String(seconds); interval.append(option);
      }
      interval.value = String(intervalMs / 1000); intervalLabel.append(interval);
      options.append(durationLabel, intervalLabel); body.append(options);
      if (editing) body.append(make('p', 'ebr-note', `Mola duraklatıldı. Kalan süre: ${format(remaining)}. Seçimi uyguladığınızda devam eder.`));
      const tools = make('div', 'ebr-selection-tools');
      const count = make('strong', 'ebr-selection-count');
      const list = make('div', 'ebr-page-list'); list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Özetlenecek ders sayfaları');
      const update = () => {
        count.textContent = `${chosen.size} / ${eligible.length} sayfa seçili`;
        start.disabled = chosen.size === 0;
        for (const checkbox of list.querySelectorAll('input')) checkbox.checked = chosen.has(checkbox.value);
      };
      tools.append(count);
      addButton(tools, 'Tümünü seç', () => { chosen = new Set(eligible.map(page => page.id)); update(); }, 'ebr-link-button');
      addButton(tools, 'Seçimi temizle', () => { chosen.clear(); update(); }, 'ebr-link-button');
      body.append(tools);
      const current = typeof config.getIndex === 'function' ? Number(config.getIndex()) : -1;
      body.append(make('p', 'ebr-note', current < 0 ? 'Genel görünüm: özetlenecek sayfaları siz seçin.' : 'Yalnızca bu sayfaya kadar olan ders konuları gösteriliyor.'));
      for (const page of eligible) {
        const label = make('label', 'ebr-page-option');
        const checkbox = make('input'); checkbox.type = 'checkbox'; checkbox.value = page.id; checkbox.checked = chosen.has(page.id);
        checkbox.addEventListener('change', () => { checkbox.checked ? chosen.add(page.id) : chosen.delete(page.id); update(); });
        const caption = make('span'); caption.append(make('small', '', `SAYFA ${page.index + 1}`), make('span', '', page.title));
        label.append(checkbox, caption); list.append(label);
      }
      if (!eligible.length) list.append(make('p', 'ebr-note', 'Bu noktaya kadar özetlenecek konu bulunmuyor. Ders içinde ilerledikten sonra yeniden açabilirsiniz.'));
      body.append(list);
      const footer = make('div', 'ebr-actions');
      const start = addButton(footer, editing ? 'Seçimi uygula ve devam et' : 'Özetli molayı başlat', () => {
        if (!chosen.size) return;
        const continuing=editing&&Boolean(breakSession);
        intervalMs = Number(interval.value) * 1000;
        if (!editing) remaining = Number(duration.value) * 60000;
        persist(); slides = eligible.filter(page => chosen.has(page.id)); slideIndex = 0;
        editing = false; running = true; paused = false; pausedSlideMs = intervalMs;
        deadline = Date.now() + remaining; nextSlideAt = Date.now() + intervalMs;
        if(!continuing)breakSession={id:newId(),durationMinutes:Number(duration.value),pausedMs:0,pausedAt:null};
        else if(breakSession.pausedAt!==null){breakSession.pausedMs+=Math.max(0,Date.now()-breakSession.pausedAt);breakSession.pausedAt=null;}
        recordBreak(continuing?'break_resume':'break_start');
        syncTimer('stop'); syncTimer('set', Math.ceil(remaining / 1000)); syncTimer('start');
        renderPlayer(); stopClock(); clock = setInterval(tick, 250); focusFirst();
      }, 'ebr-button ebr-primary');
      addButton(footer, 'Derse dön', hide, 'ebr-button ebr-secondary'); body.append(footer); update();
    }

    let countdown, cardHost, progress, counter, pauseButton;
    function renderPlayer() {
      title.textContent = 'Mola zamanı · küçük bir tekrar'; body.replaceChildren();
      const top = make('div', 'ebr-player-top');
      const timerWrap = make('div'); timerWrap.append(make('span', 'ebr-timer-caption', 'KALAN MOLA SÜRESİ'));
      countdown = make('strong', 'ebr-countdown', format(remaining)); countdown.setAttribute('aria-label', 'Kalan mola süresi'); timerWrap.append(countdown);
      const status = make('p', 'ebr-player-note', 'Seçtiğiniz özetler sırayla döner. Keyifli molalar ☕'); top.append(timerWrap, status);
      cardHost = make('div', 'ebr-card-host');
      const nav = make('div', 'ebr-slide-nav');
      addButton(nav, '← Önceki', () => advance(-1), 'ebr-button ebr-secondary');
      counter = make('span', 'ebr-slide-counter'); counter.setAttribute('aria-live', 'polite'); nav.append(counter);
      addButton(nav, 'Sonraki →', () => advance(1), 'ebr-button ebr-secondary');
      progress = make('div', 'ebr-progress'); progress.setAttribute('aria-hidden', 'true'); progress.append(make('span'));
      const controls = make('div', 'ebr-actions');
      pauseButton = addButton(controls, 'Duraklat', togglePause, 'ebr-button ebr-primary');
      addButton(controls, 'Sayfaları değiştir', () => {
        if (!paused) togglePause(); editing = true; stopClock(); renderSetup(); focusFirst();
      }, 'ebr-button ebr-secondary');
      addButton(controls, 'Molayı bitir', finish, 'ebr-button ebr-secondary');
      body.append(top, cardHost, nav, progress, controls); renderSlide(); lastTimerLabel = ''; tick();
    }
    function renderSlide() {
      const page = slides[slideIndex]; if (!page) return;
      const article = make('article', 'ebr-summary-card');
      article.setAttribute('aria-labelledby', 'ebr-card-title');
      const heading = make('h3', '', page.title); heading.id = 'ebr-card-title';
      article.append(make('p', 'ebr-card-kicker', `SAYFA ${page.index + 1} · MİNİ ÖZET`), heading);
      const points = page.summary.length ? page.summary.slice(0,2) : ['Bu bölümde öğrendiklerinizi hatırlayın. Konuyla ilgili bir İngilizce cümle kurmayı deneyin.'];
      const ul = make('ul', 'ebr-summary-points'); for (const point of points) ul.append(make('li', '', point)); article.append(ul);
      if (page.examples.length) {
        const examples = make('div', 'ebr-examples');
        for (const example of page.examples.slice(0,1)) {
          const block = make('div', 'ebr-example');
          if (example.en) { const english = make('p', 'ebr-english', example.en); english.lang = 'en'; block.append(english); }
          if (example.tr) { const turkish = make('p', 'ebr-turkish', example.tr); turkish.lang = 'tr'; block.append(turkish); }
          examples.append(block);
        }
        article.append(examples);
      }
      cardHost.replaceChildren(article); counter.textContent = `${slideIndex + 1} / ${slides.length} özet`;
    }
    function advance(step) {
      if (!slides.length) return;
      slideIndex = (slideIndex + step + slides.length) % slides.length;
      nextSlideAt = Date.now() + intervalMs; pausedSlideMs = intervalMs; renderSlide();
    }
    function togglePause() {
      if (!running) return;
      const now = Date.now();
      if (!paused) {
        remaining = Math.max(0, deadline - now); pausedSlideMs = Math.max(0, nextSlideAt - now); paused = true; syncTimer('stop');
        if(breakSession)breakSession.pausedAt=now;
        recordBreak('break_pause');
      } else {
        deadline = now + remaining; nextSlideAt = now + pausedSlideMs; paused = false;
        syncTimer('set', Math.ceil(remaining / 1000)); syncTimer('start');
        if(breakSession&&breakSession.pausedAt!==null){breakSession.pausedMs+=Math.max(0,now-breakSession.pausedAt);breakSession.pausedAt=null;}
        recordBreak('break_resume');
      }
      pauseButton.textContent = paused ? 'Devam et' : 'Duraklat';
      pauseButton.setAttribute('aria-pressed', String(paused));
      countdown.classList.toggle('ebr-paused', paused); tick();
    }
    function tick() {
      if (!running || editing) return;
      const now = Date.now();
      if (!paused) remaining = Math.max(0, deadline - now);
      const label = format(remaining);
      if (label !== lastTimerLabel) { countdown.textContent = label; lastTimerLabel = label; }
      if (remaining <= 0) { finish(); return; }
      if (!paused && now >= nextSlideAt) {
        const steps = Math.floor((now - nextSlideAt) / intervalMs) + 1;
        slideIndex = (slideIndex + steps) % slides.length; nextSlideAt += steps * intervalMs; renderSlide();
      }
      const left = paused ? pausedSlideMs : Math.max(0, nextSlideAt - now);
      progress.firstElementChild.style.width = `${Math.max(0, Math.min(100, (1 - left / intervalMs) * 100))}%`;
    }
    function finish() {
      const completed = remaining <= 0;
      if(breakSession){recordBreak('break_end',completed?'elapsed':'early');breakSession=null;}
      stopClock(); syncTimer('stop'); running = false; paused = false; editing = false;
      if (completed) syncTimer('set', 0);
      title.textContent = completed ? 'Mola bitti' : 'Mola tamamlandı'; body.replaceChildren();
      const done = make('div', 'ebr-done'); done.setAttribute('role', 'status');
      done.append(make('div', 'ebr-done-icon', '☕'), make('h3', '', completed ? 'Derse dönme zamanı!' : 'Hazırsanız derse devam edelim.'), make('p', '', 'Özet gösterimi durdu. Dersiniz kaldığınız sayfada sizi bekliyor.'));
      const controls = make('div', 'ebr-actions'); addButton(controls, 'Derse dön', hide, 'ebr-button ebr-primary');
      addButton(controls, 'Yeni mola hazırla', () => { selection(); remaining = 600000; renderSetup(); focusFirst(); }, 'ebr-button ebr-secondary');
      done.append(controls); body.append(done); focusFirst();
    }

    function keyHandler(event) {
      if (!opened) return;
      // Lesson shortcuts must not change the underlying lesson while this dialog is open.
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { event.preventDefault(); hide(); }
    }
    document.addEventListener('keydown', keyHandler, true);
    const onPageLeave=()=>{if(opened)hide('navigation');};
    window.addEventListener?.('pagehide',onPageLeave);
    dialog.addEventListener('cancel', event => { event.preventDefault(); hide(); });
    close.addEventListener('click', hide);
    let inlineButton = null, inlineTarget = null;
    function usableTarget(target) {
      return target && target !== document.body && target.isConnected &&
        typeof target.append === 'function' && !target.closest('[data-break-review-root]') &&
        !target.closest('[hidden], [aria-hidden="true"]') && target.getClientRects().length > 0;
    }
    function breakTarget() {
      // A lesson adapter knows whether its current screen is genuinely a break.
      // An explicit null must not fall back to a hidden break elsewhere in the lesson.
      if (typeof config.getBreakTarget === 'function') {
        try { const target = config.getBreakTarget(); return usableTarget(target) ? target : null; }
        catch (_) { return null; }
      }
      for (const marker of document.querySelectorAll('.break-text, [data-break-time], .break')) {
        const target = marker.matches('[data-break-time]') ? marker.parentElement : marker;
        if (usableTarget(target)) return target;
      }
      return null;
    }
    function ensureInline() {
      inlineFrame = null;
      const target = breakTarget();
      if (target !== inlineTarget || !inlineButton?.isConnected) {
        if (opened) hide('navigation');
        inlineButton?.remove(); inlineButton = null; inlineTarget = null;
      }
      if (!target || inlineButton) return;
      const button = make('button', 'ebr-inline-button', '☕ Bu molada seçtiğim sayfaların özetini göster');
      button.type = 'button'; button.dataset.breakReviewInline = ''; button.setAttribute('aria-haspopup', 'dialog'); button.addEventListener('click', show);
      target.append(button); inlineButton = button; inlineTarget = target;
    }
    const observer = new MutationObserver(records => {
      if (records.every(record => root.contains(record.target) || record.target === inlineButton)) return;
      if (inlineFrame === null) inlineFrame = requestAnimationFrame(ensureInline);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] }); ensureInline();
    instance = { destroy() {
      if (opened) hide(); stopClock(); observer.disconnect(); if (inlineFrame !== null) cancelAnimationFrame(inlineFrame);
      document.removeEventListener('keydown', keyHandler, true); inlineButton?.remove(); root.remove();
      window.removeEventListener?.('pagehide',onPageLeave);
    } };
    return instance;
  }
  window.EnglishBreakReview = { register };
})();
