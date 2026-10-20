import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { loadContent } from '../scripts/build-yds.mjs';

const content = await loadContent();
const source = await fs.readFile(new URL('../yds-src/app.js', import.meta.url), 'utf8');
const application = new vm.Script(source, { filename: 'yds-src/app.js' });
const words = content.units.flatMap(unit => unit.vocabulary.map((word, index) => ({ ...word, id: `${unit.id}-v${index + 1}`, unitId: unit.id })));

// Exercise the complete source app with observable DOM writes and a controlled
// clock. Real viewport, scrolling and native keyboard behavior need browser QA.
function fixture(hash = '#vocab') {
  const nodes = new Map();
  const dynamic = new Set();
  const events = new Map();
  const windowEvents = new Map();
  const timers = new Map();
  const stored = new Map();
  let time = 0;
  let nextTimer = 0;
  let writes = 0;
  let document;
  const on = (map, type, callback) => map.set(type, [...(map.get(type) || []), callback]);
  const emit = (map, type, event = {}) => (map.get(type) || []).forEach(callback => callback(event));

  function element(id = '', dataset = {}, initialClasses = '') {
    let html = '';
    const classes = new Set(initialClasses.split(/\s+/).filter(Boolean));
    const attributes = new Map();
    return {
      id, dataset, value: '', textContent: '', selectionStart: 0,
      classList: {
        contains: name => classes.has(name),
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        toggle(name, force = !classes.has(name)) { force ? classes.add(name) : classes.delete(name); return force; },
      },
      setAttribute: (name, value) => attributes.set(name, String(value)),
      removeAttribute: name => attributes.delete(name),
      closest(selector) { return selector === '[data-action]' && this.dataset.action ? this : null; },
      focus() { document.activeElement = this; },
      setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
      scrollIntoView() {},
      querySelector(selector) {
        const action = selector.match(/data-action="(\w+)"/)?.[1];
        const button = action && html.match(new RegExp(`<button[^>]*data-action="${action}"[^>]*data-word="([^"]+)"`));
        return button ? element('', { action, word: button[1] }) : null;
      },
      get innerHTML() { return html; },
      set innerHTML(value) {
        html = String(value);
        if (id !== 'workspace') return;
        writes++;
        for (const childId of dynamic) nodes.delete(childId);
        dynamic.clear();
        for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
          const child = element(match[1], {}, match[0].match(/class="([^"]*)"/)?.[1] || '');
          child.value = match[0].match(/value="([^"]*)"/)?.[1] || '';
          nodes.set(child.id, child);
          dynamic.add(child.id);
        }
        for (const match of html.matchAll(/<article[^>]*id="(vocab-[^"]+)"[^>]*>([\s\S]*?)<\/article>/g)) nodes.get(match[1]).innerHTML = match[2];
        const learned = html.match(/id="vocab-known-count">([^<]*)/);
        if (learned) nodes.get('vocab-known-count').textContent = learned[1];
      },
    };
  }

  for (const id of ['workspace', 'study-data', 'save-indicator', 'toast', 'menu-button', 'font-button', 'mistake-badge', 'unit-nav']) nodes.set(id, element(id));
  nodes.get('study-data').textContent = JSON.stringify(content);
  document = {
    body: element('body'), activeElement: null,
    getElementById: id => nodes.get(id) || null,
    querySelector: selector => nodes.get(selector.slice(1)) || null,
    querySelectorAll: () => [],
    addEventListener: (type, callback) => on(events, type, callback),
  };
  const location = { hash };
  application.runInNewContext({
    document, location,
    localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    window: { addEventListener: (type, callback) => on(windowEvents, type, callback), scrollTo() {}, print() {} },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    setInterval() {}, clearInterval() {},
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, due: time + delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  return {
    get writes() { return writes; },
    get html() { return nodes.get('workspace').innerHTML; },
    node: id => nodes.get(id),
    state: () => JSON.parse(stored.get('hudavendigar-yds-grammar-studio-v1')),
    advance(milliseconds) {
      time += milliseconds;
      for (const [id, timer] of [...timers]) if (timer.due <= time && timers.delete(id)) timer.callback();
    },
    search(kind, value, { composing = false, end = false } = {}) {
      const input = nodes.get(kind === 'word' ? 'word-search' : 'bank-search');
      input.dataset.search = kind;
      input.value = value;
      input.selectionStart = value.length;
      input.focus();
      emit(events, end ? 'compositionend' : 'input', { target: input, isComposing: composing });
    },
    click(action, word) { emit(events, 'click', { target: element('', { action, word }) }); },
    change(kind, value) { const input = element('', { change: kind }); input.value = value; emit(events, 'change', { target: input }); },
    navigate(nextHash) { location.hash = nextHash; emit(windowEvents, 'hashchange'); },
    active: () => document.activeElement,
  };
}

test('typing a vocabulary query coalesces redraws and keeps the latest query, focus and caret', () => {
  const app = fixture();
  const baseline = app.writes;
  const word = words[0];
  assert.equal((app.html.match(/class="vocab-card/g) || []).length, words.length);
  for (let length = 1; length <= word.word.length; length++) {
    app.search('word', word.word.slice(0, length));
    app.advance(40);
  }
  assert.equal(app.writes, baseline, 'Intermediate keystrokes must not rebuild the card list');
  app.advance(150);
  assert.equal(app.writes, baseline + 1);
  assert.ok(app.node(`vocab-${word.id}`));
  assert.equal(app.node('word-search').value, word.word);
  assert.equal(app.active().id, 'word-search');
  assert.equal(app.active().selectionStart, word.word.length);
});

test('filter changes apply the newest pending query immediately and cancel its extra redraw', () => {
  const app = fixture();
  const word = words.find(item => item.unitId === content.units[1].id);
  app.search('word', word.word);
  app.change('word-unit', word.unitId);
  const baseline = app.writes;
  assert.ok(app.node(`vocab-${word.id}`));
  assert.equal(app.node('word-search').value, word.word);
  app.advance(500);
  assert.equal(app.writes, baseline);
});

test('a pending search cannot redraw another route and remains available on returning', () => {
  const app = fixture();
  app.search('word', words[0].word);
  app.navigate('#plan');
  const baseline = app.writes;
  app.advance(500);
  assert.equal(app.writes, baseline);
  assert.ok(app.html.includes('Altı haftalık konu rotası'));
  app.navigate('#vocab');
  assert.equal(app.node('word-search').value, words[0].word);
});

test('Android input composition finishes before the list redraws', () => {
  const app = fixture();
  const baseline = app.writes;
  app.search('word', 'ö', { composing: true });
  app.advance(500);
  assert.equal(app.writes, baseline);
  app.search('word', 'öğren', { end: true });
  app.advance(149);
  assert.equal(app.writes, baseline);
  app.advance(1);
  assert.equal(app.writes, baseline + 1);
  assert.equal(app.node('word-search').value, 'öğren');
});

test('flipping and marking cards changes only that card while retaining the remaining 143 cards', () => {
  const app = fixture();
  const [word, untouched] = words;
  const baseline = app.writes;
  const otherCard = app.node(`vocab-${untouched.id}`);
  const card = app.node(`vocab-${word.id}`);
  app.click('flip', word.id);
  assert.equal(app.writes, baseline, 'A card flip must not recreate the workspace');
  assert.equal(app.node(`vocab-${untouched.id}`), otherCard);
  assert.equal(app.node(`vocab-${word.id}`), card);
  assert.ok(card.innerHTML.includes(word.meaning));
  assert.ok(card.innerHTML.includes(word.example));
  assert.equal(app.active().dataset.action, 'flip');
  app.click('known', word.id);
  assert.equal(app.writes, baseline);
  assert.equal(app.state().words[word.id], true);
  assert.equal(card.classList.contains('known'), true);
  assert.equal(app.node('vocab-known-count').textContent, `1 / ${words.length} öğrenildi`);
  assert.equal(app.active().dataset.action, 'known');
  app.click('flip', word.id);
  assert.ok(!card.innerHTML.includes('class="meaning"'));
  assert.equal(app.writes, baseline);
});

test('known and learning membership filters still remove cards immediately', () => {
  const app = fixture();
  const word = words[0];
  app.change('word-mode', 'learning');
  app.click('known', word.id);
  assert.equal(app.node(`vocab-${word.id}`), undefined);
  app.change('word-mode', 'known');
  assert.ok(app.node(`vocab-${word.id}`));
  app.click('known', word.id);
  assert.equal(app.node(`vocab-${word.id}`), undefined);
  assert.ok(app.html.includes('Bu filtrede kart yok.'));
});

test('question bank search redraws once after a rapid burst and uses the final phrase', () => {
  const app = fixture('#bank');
  const baseline = app.writes;
  const question = content.units[0].questions[0];
  const phrase = question.prompt.slice(0, 25);
  for (let length = 1; length <= phrase.length; length++) app.search('bank', phrase.slice(0, length));
  assert.equal(app.writes, baseline);
  app.advance(150);
  assert.equal(app.writes, baseline + 1);
  assert.ok(app.node(`question-${question.id}`));
  assert.equal(app.node('bank-search').value, phrase);
});
