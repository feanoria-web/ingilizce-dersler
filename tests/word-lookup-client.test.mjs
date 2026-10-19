import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const script = await fs.readFile(new URL('../assets/word-lookup.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

class Element {
  constructor(tag, owner) {
    this.tagName = tag.toUpperCase(); this.nodeType = 1; this.owner = owner;
    this.children = []; this.attributes = {}; this.listeners = new Map(); this.style = {};
    this.hidden = false; this.textContent = ''; this.value = ''; this.isConnected = true;
  }
  append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  get lastElementChild() { return this.children.at(-1); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.listeners.set(name, [...(this.listeners.get(name) || []), callback]); }
  emit(name, event = {}) { (this.listeners.get(name) || []).forEach(callback => callback({ target: this, preventDefault() {}, ...event })); }
  contains(node) { return this === node || this.children.some(child => child.contains?.(node)); }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector.startsWith('.') && (child.className || '').split(' ').includes(selector.slice(1))) return child;
      const found = child.querySelector?.(selector); if (found) return found;
    }
    return null;
  }
  closest(selector) {
    const matches = selector.split(',').some(part => {
      if (part === '[data-english-word-lookup]') return this.attributes['data-english-word-lookup'] !== undefined;
      if (part === '[data-no-word-lookup]') return this.attributes['data-no-word-lookup'] !== undefined;
      if (part.startsWith('[contenteditable]')) return this.attributes.contenteditable !== undefined && this.attributes.contenteditable !== 'false';
      if (part.startsWith('#')) return this.id === part.slice(1);
      return this.tagName.toLowerCase() === part;
    });
    return matches ? this : this.parentElement?.closest(selector) || null;
  }
  getBoundingClientRect() { return { left: 20, top: 100, bottom: 120, width: 370, height: 420 }; }
  focus() { this.owner.activeElement = this; }
}

function harness({ data = {}, fetch: mockFetch } = {}) {
  const listeners = new Map(); const timers = new Map(); const requests = []; let timerId = 0;
  const learning=[];
  const document = {
    addEventListener(name, callback) { listeners.set(name, [...(listeners.get(name) || []), callback]); },
    emit(name, event = {}) { (listeners.get(name) || []).forEach(callback => callback(event)); },
    createElement(tag) { return new Element(tag, document); },
    getElementById(id) {
      if (id === 'english-word-lookup-data') return { textContent: JSON.stringify(data) };
      return find(document.body, element => element.id === id);
    },
  };
  document.body = document.createElement('body'); document.activeElement = document.body;
  const window = {
    innerWidth: 1200, innerHeight: 900, getSelection: () => window.selection,
    addEventListener() {},
    dispatchEvent(event) { if(event.type==='english:learning-event')learning.push(event.detail); },
  };
  const fetch = async (url, options) => {
    requests.push({ url, options });
    return mockFetch ? mockFetch(url, options) : { ok: true, json: async () => url.includes('mymemory')
      ? { responseStatus: 200, responseData: { translatedText: 'çeviri' } }
      : [{ meanings: [{ definitions: [{ example: 'A natural English example.' }] }] }] };
  };
  vm.runInNewContext(script, {
    window, document, fetch, AbortController,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},
    setTimeout(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const runTimers = ms => {
    for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.callback(); }
  };
  function selection(text, { container, sentence = text } = {}) {
    const main = container || document.createElement('main'); if (!container) document.body.append(main);
    const node = { nodeType: 3, parentElement: main, textContent: sentence };
    const range = { commonAncestorContainer: node, getBoundingClientRect: () => ({ left: 50, top: 100, bottom: 120 }), cloneRange() { return this; } };
    const start = sentence.indexOf(text);
    window.selection = { isCollapsed: false, rangeCount: 1, anchorNode: node, focusNode: node,
      anchorOffset: Math.max(0, start), focusOffset: Math.max(0, start) + text.length,
      getRangeAt: () => range, toString: () => text };
    document.emit('selectionchange'); runTimers(180);
  }
  return { window, document, api: window.EnglishWordLookup, requests, selection, runTimers, timers,learning };
}
function find(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children || []) { const match = find(child, predicate); if (match) return match; }
  return null;
}
const textOf = element => [element.textContent, ...(element.children || []).map(textOf)].join(' ');

test('local dictionary resolves case, common morphology, supplied aliases and English phrases without network', async () => {
  const h = harness({ data: {
    study: { meaning: 'çalışmak', example: 'We study together.' },
    run: { meaning: 'koşmak', example: 'I run every day.' },
    went: { headword: 'go', meaning: 'gitmek', example: 'She went home.' },
    'look after': { meaning: 'bakmak', example: 'I look after my cat.' },
  } });
  assert.equal((await h.api.lookup('Studied')).meaning, 'çalışmak');
  assert.equal((await h.api.lookup('studies')).headword, 'study');
  assert.equal((await h.api.lookup('running')).meaning, 'koşmak');
  assert.equal((await h.api.lookup('went')).headword, 'go');
  assert.equal((await h.api.lookup('LOOK   AFTER')).meaning, 'bakmak');
  assert.equal(h.requests.length, 0);
});

test('selection reveals a local answer and Escape dismisses without changing other navigation keys', async () => {
  const h = harness({ data: { book: { meaning: 'kitap', example: 'This is my book.' } } });
  h.selection('book'); await flush();
  const panel = h.document.getElementById('english-word-lookup');
  assert.equal(panel.hidden, false); assert.match(textOf(panel), /kitap/);
  let intercepted = false;
  h.document.emit('keydown', { key: 'ArrowRight', preventDefault() { intercepted = true; } });
  assert.equal(intercepted, false); assert.equal(panel.hidden, false);
  h.document.emit('keydown', { key: 'Escape' }); assert.equal(panel.hidden, true);
  h.document.emit('selectionchange'); h.runTimers(180); assert.equal(panel.hidden, true);
  h.document.emit('keydown', { key: 'ArrowRight', shiftKey: true });
  h.selection('book'); await flush(); assert.equal(panel.hidden, false);
});

test('dictionary learning records explicit selected or searched words without the surrounding sentence',async()=>{
  const h=harness({data:{book:{meaning:'kitap',example:'This is a book.'}}});
  h.selection('book',{sentence:'A PRIVATE sentence about a book.'});await flush();
  assert.equal(h.learning.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.learning[0])),{type:'dictionary_lookup',learning:{kind:'dictionary',term:'book',mode:'selection',outcome:'found',source:'local'}});
  h.api.open('book');await flush();
  assert.equal(h.learning.at(-1).learning.mode,'manual');
  assert.ok(!JSON.stringify(h.learning).includes('PRIVATE'));
  h.api.close();await h.api.lookup('book');assert.equal(h.learning.length,2,'background API lookup is not a learner search');
});

test('failed explicit dictionary search has a bounded error record, invalid text has none',async()=>{
  const h=harness({fetch:async()=>{throw new Error('offline')}});
  h.api.open('discover');await flush();
  assert.equal(h.learning[0].learning.outcome,'error');assert.equal(h.learning[0].learning.source,'none');
  h.api.open('PRIVATE 123 password');await flush();assert.equal(h.learning.length,1);
});

test('text entry, editable notes and text outside lesson regions never trigger lookup', async () => {
  const h = harness();
  for (const tag of ['input', 'textarea', 'button', 'select']) {
    const main = h.document.createElement('main'); const control = h.document.createElement(tag); main.append(control);
    h.selection('password', { container: control });
  }
  const main = h.document.createElement('main'); const editable = h.document.createElement('div');
  editable.setAttribute('contenteditable', 'true'); main.append(editable);
  h.selection('private', { container: editable });
  h.selection('private', { container: h.document.body });
  h.selection('this phrase contains more than five words');
  h.selection('Türkçe');
  await flush(); assert.equal(h.requests.length, 0);
  assert.equal(h.document.getElementById('english-word-lookup').hidden, true);
});

test('online lookup sends only the selected word and preserves source context locally when no example exists', async () => {
  const h = harness({ fetch: async url => ({ ok: true, json: async () => url.includes('mymemory')
    ? { responseStatus: 200, responseData: { translatedText: 'keşfetmek' } }
    : [{ meanings: [{ definitions: [{ definition: 'to find' }] }] }] }) });
  h.selection('discover', { sentence: 'We discover a secret island in the story.' }); await flush();
  assert.equal(h.requests.length, 2);
  const request = h.requests.find(item => item.url.includes('mymemory'));
  assert.equal(new URL(request.url).searchParams.get('q'), 'discover');
  assert.equal(request.options.credentials, 'omit'); assert.equal(request.options.referrerPolicy, 'no-referrer');
  const content = textOf(h.document.getElementById('english-word-lookup'));
  assert.match(content, /Dersten örnek/); assert.match(content, /We discover a secret island/);
});

test('late responses from an aborted selection cannot overwrite the current word', async () => {
  const pending = [];
  const h = harness({ fetch: (url, options) => new Promise(resolve => pending.push({ url, options, resolve })) });
  h.api.open('first'); await flush();
  h.api.open('second'); await flush();
  const complete = (term, translation) => {
    for (const request of pending.filter(item => item.url.includes(term))) request.resolve({ ok: true,
      json: async () => request.url.includes('mymemory')
        ? { responseStatus: 200, responseData: { translatedText: translation } }
        : [{ meanings: [{ definitions: [{ example: `An example for ${term}.` }] }] }] });
  };
  complete('second', 'ikinci'); await flush();
  complete('first', 'birinci'); await flush();
  assert.match(textOf(h.document.getElementById('english-word-lookup')), /ikinci/);
  assert.doesNotMatch(textOf(h.document.getElementById('english-word-lookup')), /birinci/);
  assert.equal(pending[0].options.signal.aborted, true);
});

test('same-as-input, service quotas and offline failures show honest retry states; deadline aborts requests', async () => {
  for (const response of [
    { responseStatus: 200, responseData: { translatedText: 'house' } },
    { responseStatus: 200, quotaFinished: true, responseData: { translatedText: 'ev' } },
    { responseStatus: 429, responseData: { translatedText: 'limit' } },
  ]) {
    const h = harness({ fetch: async url => ({ ok: true, json: async () => url.includes('mymemory') ? response : [] }) });
    h.api.open('house'); await flush();
    const panel = h.document.getElementById('english-word-lookup');
    assert.equal(panel.querySelector('.ewl-retry').hidden, false);
    assert.doesNotMatch(textOf(panel.querySelector('.ewl-result')), /Türkçe karşılığı/);
  }
  const offline = harness({ fetch: async () => { throw new Error('Network unavailable'); } });
  offline.api.open('house'); await flush();
  assert.equal(offline.document.getElementById('english-word-lookup').querySelector('.ewl-retry').hidden, false);
  const slow = harness({ fetch: (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) });
  slow.api.open('house'); slow.runTimers(9000); await flush();
  assert.match(textOf(slow.document.getElementById('english-word-lookup')), /İstek tamamlanamadı/);
});

test('manual form is usable without selection and does not fabricate missing English examples', async () => {
  const h = harness({ fetch: async url => ({ ok: true, json: async () => url.includes('mymemory')
    ? { responseStatus: 200, responseData: { translatedText: 'ev' } } : [] }) });
  const launcher = h.document.body.querySelector('.ewl-launcher'); launcher.emit('click');
  const input = h.document.getElementById('ewl-query'); assert.equal(h.document.activeElement, input);
  input.value = 'house'; h.document.body.querySelector('.ewl-form').emit('submit'); await flush();
  const panel = h.document.getElementById('english-word-lookup');
  assert.match(textOf(panel), /ev/); assert.match(textOf(panel), /örnek cümle bulunamadı/);
  h.document.emit('keydown', { key: 'Escape' }); assert.equal(panel.hidden, true);
});

test('an optional example timeout preserves a valid Turkish translation and aborts its separate request', async () => {
  let exampleSignal;
  const h = harness({ fetch: async (url, options) => {
    if (url.includes('mymemory')) return { ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'tesadüf' } }) };
    exampleSignal = options.signal;
    // Deliberately simulate a provider that never settles, even after cancellation.
    return new Promise(() => {});
  } });
  h.api.open('serendipity'); await flush();
  h.runTimers(3500); await flush();
  const panel = h.document.getElementById('english-word-lookup');
  assert.equal(panel.hidden, false);
  assert.match(textOf(panel), /tesadüf/);
  assert.match(textOf(panel), /örnek cümle bulunamadı/);
  assert.equal(exampleSignal.aborted, true);
  assert.equal(panel.querySelector('.ewl-retry').hidden, true);
});

test('remote text is rendered only as text, cached, and never inserted as markup', async () => {
  const h = harness({ fetch: async url => ({ ok: true, json: async () => url.includes('mymemory')
    ? { responseStatus: 200, responseData: { translatedText: '<img src=x onerror=bad()>' } }
    : [{ meanings: [{ definitions: [{ example: '<script>bad()</script>' }] }] }] }) });
  h.api.open('house'); await flush(); await h.api.lookup('house');
  assert.equal(h.requests.length, 2);
  const panel = h.document.getElementById('english-word-lookup');
  assert.match(textOf(panel), /<img src=x/); assert.equal(find(panel, element => element.tagName === 'IMG'), null);
  assert.equal(find(panel, element => element.tagName === 'SCRIPT'), null);
});
