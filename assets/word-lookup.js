/* A small, read-only English–Turkish dictionary for lesson text. */
(() => {
  'use strict';
  if (window.EnglishWordLookup) return;
  const dataElement = document.getElementById('english-word-lookup-data');
  let source = {};
  try { source = JSON.parse(dataElement?.textContent || '{}'); } catch { /* Online lookup still works. */ }
  if (!source || typeof source !== 'object' || Array.isArray(source)) source = {};
  const dictionary = new Map();
  const cache = new Map();
  const MAX_CACHE = 120;
  const TIMEOUT = 9000;
  const EXAMPLE_TIMEOUT = 3500;
  const normalize = value => String(value ?? '').trim().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').toLowerCase();
  const valid = term => term.length <= 80 && /^[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*){0,4}$/.test(term);
  for (const [key, entry] of Object.entries(source)) {
    const term = normalize(key);
    if (valid(term) && entry && typeof entry.meaning === 'string' && entry.meaning.trim()) {
      dictionary.set(term, { term, headword: String(entry.headword || term), meaning: entry.meaning,
        example: typeof entry.example === 'string' ? entry.example : '',
        exampleTr: typeof entry.exampleTr === 'string' ? entry.exampleTr : '', source: 'local' });
    }
  }
  source = null;

  function variants(term) {
    const terms = [term];
    if (term.includes(' ')) return terms;
    if (term.endsWith("'s")) terms.push(term.slice(0, -2));
    if (term.endsWith('ies')) terms.push(`${term.slice(0, -3)}y`);
    if (term.endsWith('ied')) terms.push(`${term.slice(0, -3)}y`);
    if (term.endsWith('es')) terms.push(term.slice(0, -2));
    if (term.endsWith('s') && !term.endsWith('ss')) terms.push(term.slice(0, -1));
    for (const suffix of ['ing', 'ed']) if (term.endsWith(suffix)) {
      const stem = term.slice(0, -suffix.length);
      terms.push(stem, `${stem}e`);
      if (/([b-df-hj-np-tv-z])\1$/.test(stem)) terms.push(stem.slice(0, -1));
    }
    return [...new Set(terms.filter(Boolean))];
  }
  function localLookup(term) {
    for (const candidate of variants(term)) if (dictionary.has(candidate)) return { ...dictionary.get(candidate), term };
    return null;
  }
  function clean(value, max = 700) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  }
  async function getJSON(url, signal) {
    const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Sözlük hizmetine ulaşılamadı.');
    return response.json();
  }
  async function onlineExample(term, signal) {
    if (term.includes(' ')) return '';
    const controller = new AbortController();
    const relay = () => controller.abort();
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', relay, { once: true });
    let timeout;
    const deadline = new Promise(resolve => {
      timeout = setTimeout(() => { controller.abort(); resolve(''); }, EXAMPLE_TIMEOUT);
    });
    const request = getJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`, controller.signal)
      .then(entries => {
        if (!Array.isArray(entries)) return '';
        for (const entry of entries) for (const meaning of entry.meanings || []) {
          for (const definition of meaning.definitions || []) if (clean(definition.example)) return clean(definition.example);
        }
        return '';
      }).catch(() => '');
    try {
      // An optional example must never discard a valid Turkish translation.
      return await Promise.race([request, deadline]);
    } finally {
      clearTimeout(timeout);
      controller.abort();
      signal.removeEventListener('abort', relay);
    }
  }
  async function onlineLookup(term, signal) {
    const translationPromise = getJSON(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(term)}&langpair=en%7Ctr`, signal)
      .then(result => {
        if (Number(result.responseStatus) !== 200 || result.quotaFinished) throw new Error('Türkçe karşılık şu anda alınamadı.');
        const meaning = clean(result.responseData?.translatedText);
        if (!meaning || normalize(meaning) === term) throw new Error('Bu sözcük için Türkçe karşılık bulunamadı.');
        return meaning;
      });
    const examplePromise = onlineExample(term, signal);
    const [meaning, example] = await Promise.all([translationPromise, examplePromise]);
    return { term, headword: term, meaning, example, exampleTr: '', source: 'online' };
  }
  async function lookup(value, options = {}) {
    const term = normalize(value);
    if (!valid(term)) throw new Error('Bir İngilizce sözcük veya en fazla beş sözcüklük kısa bir ifade yazın.');
    const local = localLookup(term);
    if (local) return local;
    if (cache.has(term)) return { ...cache.get(term) };
    const controller = new AbortController();
    const relay = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener('abort', relay, { once: true });
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const result = await onlineLookup(term, controller.signal);
      if (controller.signal.aborted) throw new Error('İstek tamamlanamadı. Yeniden deneyebilirsiniz.');
      cache.delete(term);
      cache.set(term, result);
      if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
      return { ...result };
    } catch (error) {
      if (controller.signal.aborted) throw new Error('İstek tamamlanamadı. Yeniden deneyebilirsiniz.');
      if (/^(Sözlük|Türkçe|Bu sözcük)/.test(error.message || '')) throw error;
      throw new Error('Sözlüğe ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.');
    } finally {
      clearTimeout(timeout);
      controller.abort();
      options.signal?.removeEventListener('abort', relay);
    }
  }

  const create = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const launcher = create('button', 'ewl-launcher', 'Aa Sözlük');
  launcher.type = 'button';
  launcher.setAttribute('aria-controls', 'english-word-lookup');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-label', 'İngilizce Türkçe sözlüğü aç');
  const panel = create('section', 'ewl-panel');
  panel.id = 'english-word-lookup';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'ewl-title');
  const header = create('div', 'ewl-header');
  const title = create('h2', '', 'İngilizce → Türkçe');
  title.id = 'ewl-title';
  const closeButton = create('button', 'ewl-close', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Sözlüğü kapat');
  header.append(title, closeButton);
  const form = create('form', 'ewl-form');
  form.setAttribute('role', 'search');
  const label = create('label', 'ewl-label', 'İngilizce sözcük veya kısa ifade');
  label.htmlFor = 'ewl-query';
  const fields = create('div', 'ewl-fields');
  const input = create('input', 'ewl-input');
  input.id = 'ewl-query';
  input.type = 'search';
  input.maxLength = 80;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('lang', 'en');
  input.setAttribute('placeholder', 'Örn. discover');
  const submit = create('button', 'ewl-submit', 'Ara');
  submit.type = 'submit';
  fields.append(input, submit);
  form.append(label, fields);
  const hint = create('p', 'ewl-hint', 'Ders metninde bir İngilizce sözcüğü seçin veya buradan arayın.');
  const status = create('p', 'ewl-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  const resultArea = create('div', 'ewl-result');
  const retry = create('button', 'ewl-retry', 'Yeniden dene');
  retry.type = 'button';
  retry.hidden = true;
  panel.append(header, form, hint, status, resultArea, retry);
  document.body.append(launcher, panel);
  let requestId = 0;
  let activeController;
  let activeTerm = '';
  let selectedRange;
  let activeContext = '';
  let activeMode = 'manual';
  function recordLookup(outcome,source='none') {
    if(!valid(activeTerm))return;
    try {window.dispatchEvent(new CustomEvent('english:learning-event',{detail:{type:'dictionary_lookup',learning:{kind:'dictionary',term:activeTerm,mode:activeMode,outcome,source}}}));}catch(_){}
  }
  let returnFocus;
  let anchorRect;
  let lastSelection = '';
  let selectionDismissed = false;
  let selectionTimer;
  let pointerDown = false;

  function position() {
    if (panel.hidden) return;
    const margin = 12;
    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const viewportTop = window.visualViewport?.offsetTop || 0;
    const viewportLeft = window.visualViewport?.offsetLeft || 0;
    const width = Math.min(370, viewportWidth - margin * 2);
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.max(120, viewportHeight - margin * 2)}px`;
    const height = Math.min(panel.getBoundingClientRect().height, viewportHeight - margin * 2);
    let left = anchorRect ? anchorRect.left : viewportWidth - width - margin;
    let top = anchorRect ? anchorRect.bottom + 10 : viewportHeight - height - 76;
    if (anchorRect && top + height > viewportTop + viewportHeight - margin) top = anchorRect.top - height - 10;
    left = Math.max(viewportLeft + margin, Math.min(left, viewportLeft + viewportWidth - width - margin));
    top = Math.max(viewportTop + margin, Math.min(top, viewportTop + viewportHeight - height - margin));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }
  function show() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    position();
  }
  function close(restoreFocus = false) {
    ++requestId;
    activeController?.abort();
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    selectedRange = null;
    anchorRect = null;
    activeContext = '';
    lastSelection = '';
    selectionDismissed = true;
    clearTimeout(selectionTimer);
  }
  function appendText(labelText, value, className = '') {
    const section = create('div', `ewl-detail ${className}`.trim());
    section.append(create('p', 'ewl-caption', labelText), create('p', 'ewl-copy', value));
    resultArea.append(section);
  }
  function renderResult(result) {
    resultArea.replaceChildren();
    const word = create('p', 'ewl-word', result.term);
    word.lang = 'en';
    resultArea.append(word);
    if (normalize(result.headword) !== result.term) resultArea.append(create('p', 'ewl-base', `Temel biçim: ${result.headword}`));
    appendText('Türkçe karşılığı', result.meaning);
    if (result.example) {
      appendText('İngilizce örnek', result.example, 'ewl-example');
      resultArea.lastElementChild.querySelector('.ewl-copy').lang = 'en';
      if (result.exampleTr) appendText('Örneğin Türkçesi', result.exampleTr);
    } else if (activeContext) {
      appendText('Dersten örnek', activeContext, 'ewl-example');
      resultArea.lastElementChild.querySelector('.ewl-copy').lang = 'en';
      resultArea.append(create('p', 'ewl-note', 'Sözlükte ayrıca bir örnek bulunamadı; seçtiğiniz ders cümlesi gösteriliyor.'));
    } else resultArea.append(create('p', 'ewl-note', 'Bu sözcük için sözlükte örnek cümle bulunamadı.'));
    status.textContent = result.source === 'local' ? 'Ders sözlüğünden.' : 'Çevrim içi sözlük · MyMemory / Free Dictionary.';
    position();
  }
  async function search(term, context = '', mode = 'manual') {
    const id = ++requestId;
    activeController?.abort();
    activeController = new AbortController();
    activeTerm = normalize(term);
    activeMode = mode==='selection'?'selection':'manual';
    activeContext = context;
    input.value = term;
    resultArea.replaceChildren();
    retry.hidden = true;
    show();
    status.textContent = localLookup(activeTerm) ? 'Sözlük açılıyor…' : 'Çevrim içi aranıyor… Yalnızca seçtiğiniz veya yazdığınız ifade sözlük hizmetine gönderilir.';
    try {
      const result = await lookup(term, { signal: activeController.signal });
      if (id !== requestId || panel.hidden) return;
      renderResult(result);
      recordLookup('found',result.source==='local'?'local':'online');
    } catch (error) {
      if (id !== requestId || panel.hidden) return;
      status.textContent = error.message || 'Sözlüğe ulaşılamadı. Yeniden deneyebilirsiniz.';
      retry.hidden = !valid(activeTerm);
      recordLookup(/^Bu sözcük/.test(error.message||'')?'not_found':'error');
      position();
    }
  }
  function open(term = '') {
    returnFocus = document.activeElement;
    selectedRange = null;
    anchorRect = null;
    activeContext = '';
    show();
    if (term) search(term);
    else { status.textContent = ''; resultArea.replaceChildren(); retry.hidden = true; }
    input.focus({ preventScroll: true });
  }
  function allowedNode(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return element && element.closest('main,article,[data-english-word-lookup]')
      && !element.closest('input,textarea,select,button,[contenteditable]:not([contenteditable="false"]),[data-no-word-lookup],#english-word-lookup');
  }
  function sourceSentence(selection, term) {
    // The surrounding sentence stays in this browser; only the selected term is sent to a dictionary.
    if (selection.anchorNode !== selection.focusNode || selection.anchorNode?.nodeType !== 3) return '';
    const text = selection.anchorNode.textContent || '';
    const start = Math.min(selection.anchorOffset, selection.focusOffset);
    const end = Math.max(selection.anchorOffset, selection.focusOffset);
    const before = text.slice(0, start).search(/[^.!?]*$/);
    const afterMatch = text.slice(end).match(/^[^.!?]*[.!?]?/);
    const sentence = clean(text.slice(before, end + (afterMatch?.[0].length || 0)), 250);
    return sentence.length > term.length + 3 && sentence.length < 250 && !/[çğıöşüÇĞİÖŞÜ]/.test(sentence)
      && /[a-z]{2}/i.test(sentence) ? sentence : '';
  }
  function readSelection() {
    if (pointerDown || selectionDismissed || panel.contains(document.activeElement)) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) { lastSelection = ''; return; }
    if (!allowedNode(selection.anchorNode) || !allowedNode(selection.focusNode)) return;
    const range = selection.getRangeAt(0);
    if (!allowedNode(range.commonAncestorContainer)) return;
    const raw = selection.toString().trim();
    const term = normalize(raw);
    if (!valid(term)) return;
    const rect = range.getBoundingClientRect();
    const signature = `${term}|${rect.left}|${rect.top}`;
    if (signature === lastSelection) return;
    lastSelection = signature;
    selectedRange = range.cloneRange();
    anchorRect = { left: rect.left, top: rect.top, bottom: rect.bottom };
    returnFocus = null;
    search(raw, sourceSentence(selection, term), 'selection');
  }
  const queueSelection = () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(readSelection, 180);
  };
  launcher.addEventListener('click', () => panel.hidden ? open() : close(true));
  closeButton.addEventListener('click', () => close(true));
  form.addEventListener('submit', event => { event.preventDefault(); selectedRange = null; anchorRect = null; search(input.value); });
  retry.addEventListener('click', () => search(activeTerm, activeContext, activeMode));
  // Keep the lesson highlight while using popup buttons. Text input remains editable normally.
  panel.addEventListener('pointerdown', event => {
    if (selectedRange && event.target.closest('button') && event.pointerType !== 'touch') event.preventDefault();
  });
  document.addEventListener('pointerdown', event => {
    pointerDown = true;
    if (!panel.hidden && !panel.contains(event.target) && !launcher.contains(event.target)) close();
    if (allowedNode(event.target)) { selectionDismissed = false; lastSelection = ''; }
  });
  document.addEventListener('pointerup', () => { pointerDown = false; queueSelection(); });
  document.addEventListener('pointercancel', () => { pointerDown = false; });
  document.addEventListener('selectionchange', queueSelection);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { close(panel.contains(document.activeElement)); }
    else if (event.shiftKey && /^(Arrow(?:Left|Right|Up|Down)|Home|End|PageUp|PageDown)$/.test(event.key)) {
      selectionDismissed = false;
      lastSelection = '';
    }
  });
  window.addEventListener('resize', position, { passive: true });
  window.addEventListener('scroll', () => { if (!panel.hidden && anchorRect) close(); }, { passive: true });
  window.visualViewport?.addEventListener('resize', position, { passive: true });
  window.EnglishWordLookup = Object.freeze({ lookup, open, close });
})();
