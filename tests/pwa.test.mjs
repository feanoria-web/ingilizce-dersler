import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildPwa } from '../scripts/build-pwa.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCOPE = 'https://feanoria-web.github.io/ingilizce-dersler/';
const OFFLINE = `${SCOPE}offline.html`;
const workerSource = await fs.readFile(path.join(ROOT, 'service-worker.js'), 'utf8');
const registerSource = await fs.readFile(path.join(ROOT, 'assets/pwa-register.js'), 'utf8');

function worker(network = async () => new Response('network', { headers: { 'Content-Type': 'text/html' } })) {
  const handlers = new Map();
  const stores = new Map();
  const calls = [];
  let claims = 0;
  const context = {
    URL,
    self: {
      registration: { scope: SCOPE },
      addEventListener: (name, listener) => handlers.set(name, listener),
      clients: { claim: async () => { claims++; } },
    },
    fetch: async (request, options) => {
      calls.push({ request, options });
      return network(request, options);
    },
    caches: {
      keys: async () => [...stores.keys()],
      delete: async name => stores.delete(name),
      open: async name => {
        if (!stores.has(name)) stores.set(name, new Map());
        const store = stores.get(name);
        return {
          put: async (url, response) => store.set(url, response.clone()),
          match: async url => store.get(url)?.clone(),
        };
      },
    },
  };
  vm.runInNewContext(workerSource, context);
  return {
    calls, stores,
    get claims() { return claims; },
    async lifecycle(name) {
      let operation;
      handlers.get(name)({ waitUntil: value => { operation = value; } });
      await operation;
    },
    request(url, options = {}) {
      let operation;
      handlers.get('fetch')({
        request: { url, method: 'GET', mode: 'cors', ...options },
        respondWith: value => { operation = value; },
      });
      return operation;
    },
  };
}

test('manifest identifies the existing project path and ordinary/maskable icons', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.id, '/ingilizce-dersler/');
  assert.equal(manifest.scope, '/ingilizce-dersler/');
  assert.equal(new URL(manifest.start_url, SCOPE).href, `${SCOPE}index.html`);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name, 'Hüdavendigar English');
  assert.deepEqual(manifest.icons.map(icon => [icon.sizes, icon.purpose]), [
    ['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable'],
  ]);
});

test('installation caches only the neutral offline page from a fresh network response', async () => {
  const runtime = worker();
  await runtime.lifecycle('install');
  assert.equal(runtime.calls.length, 1);
  assert.equal(runtime.calls[0].request, OFFLINE);
  assert.equal(runtime.calls[0].options.cache, 'no-store');
  assert.equal(runtime.stores.size, 1);
  assert.deepEqual([...runtime.stores.values()].map(store => [...store.keys()]), [[OFFLINE]]);
});

test('a failed or non-HTML offline installation never caches the server error response', async () => {
  for (const response of [new Response('missing', { status: 404 }), new Response('{}', { headers: { 'Content-Type': 'application/json' } })]) {
    const runtime = worker(async () => response);
    await assert.rejects(runtime.lifecycle('install'), /could not be installed/);
    assert.equal(runtime.stores.size, 0);
  }
});

test('activation removes only this feature’s obsolete caches', async () => {
  const runtime = worker();
  await runtime.lifecycle('install');
  const current = [...runtime.stores.keys()][0];
  runtime.stores.set('hudavendigar-english-offline-previous', new Map());
  runtime.stores.set('unrelated-site-assets', new Map());
  await runtime.lifecycle('activate');
  assert.deepEqual([...runtime.stores.keys()].sort(), [current, 'unrelated-site-assets'].sort());
  assert.equal(runtime.claims, 1);
});

test('all scoped GET content is fetched afresh without putting lessons, credentials or JSON in caches', async () => {
  const runtime = worker();
  await runtime.lifecycle('install');
  for (const relative of ['index.html', 'login.html', 'lessons/a1/day-01.html', 'assets/catalog.js?v=next', 'word-lookup/common.json']) {
    const response = await runtime.request(`${SCOPE}${relative}`);
    assert.equal(await response.text(), 'network');
    assert.equal(runtime.calls.at(-1).options.cache, 'no-store');
  }
  assert.deepEqual([...runtime.stores.values()].map(store => [...store.keys()]), [[OFFLINE]]);
});

test('cross-origin, neighboring projects, API requests and non-GET methods are untouched', () => {
  const runtime = worker();
  for (const [url, options] of [
    ['https://english-student-access.gurkangr698.workers.dev/api/auth/me'],
    ['https://api.dictionaryapi.dev/api/v2/entries/en/example'],
    ['https://feanoria-web.github.io/another-project/index.html', { mode: 'navigate' }],
    ['https://feanoria-web.github.io/ingilizce-dersler-extra/index.html'],
    [`${SCOPE}api/auth/me`],
    [`${SCOPE}api`],
    [`${SCOPE}lessons/a1/day-01.html`, { method: 'POST' }],
    [`${SCOPE}index.html`, { method: 'HEAD' }],
  ]) assert.equal(runtime.request(url, options), undefined, url);
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.stores.size, 0);
});

test('only a failed in-scope navigation can receive the offline page', async () => {
  let disconnected = false;
  const failure = new Error('disconnected');
  const runtime = worker(async () => {
    if (disconnected) throw failure;
    return new Response('offline message', { headers: { 'Content-Type': 'text/html' } });
  });
  await runtime.lifecycle('install');
  disconnected = true;
  const response = await runtime.request(`${SCOPE}lessons/a2/day-04.html#practice`, { mode: 'navigate' });
  assert.equal(await response.text(), 'offline message');
  await assert.rejects(runtime.request(`${SCOPE}assets/catalog.js`), error => error === failure);
  assert.equal(runtime.request('https://feanoria-web.github.io/other/', { mode: 'navigate' }), undefined);
});

test('successful HTTP errors stay intact and are never replaced with an offline success page', async () => {
  for (const status of [401, 403, 404, 500]) {
    const runtime = worker(async () => new Response('actual server error', { status }));
    const response = await runtime.request(`${SCOPE}login.html`, { mode: 'navigate' });
    assert.equal(response.status, status);
    assert.equal(await response.text(), 'actual server error');
    assert.equal(runtime.stores.size, 0);
  }
});

test('registration waits until load, bypasses the update cache and never reloads the current lesson', async () => {
  const listeners = new Map();
  const registrations = [];
  vm.runInNewContext(registerSource, {
    URL,
    navigator: { serviceWorker: { register: (...args) => { registrations.push(args); return Promise.resolve(); } } },
    document: { currentScript: { src: `${SCOPE}assets/pwa-register.js?v=new` }, readyState: 'interactive' },
    window: { isSecureContext: true, addEventListener: (name, callback) => listeners.set(name, callback) },
    location: { reload: () => { throw new Error('An active lesson must not reload'); } },
  });
  assert.equal(registrations.length, 0);
  assert.deepEqual([...listeners.keys()], ['load']);
  listeners.get('load')();
  assert.equal(registrations[0][0], `${SCOPE}service-worker.js`);
  assert.equal(registrations[0][1].scope, '/ingilizce-dersler/');
  assert.equal(registrations[0][1].updateViaCache, 'none');
});

test('offline retry reloads the requested address only after a click', async () => {
  const html = await fs.readFile(path.join(ROOT, 'offline.html'), 'utf8');
  assert.doesNotMatch(html, /auth-client|activity-tracker|pwa-register|https?:\/\/|<link\b[^>]*href|<script\b[^>]*src/i);
  assert.match(html, /İnternet bağlantısı gerekiyor/);
  let retry;
  let reloads = 0;
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    document: { getElementById: id => { assert.equal(id, 'retry'); return { addEventListener: (event, callback) => { assert.equal(event, 'click'); retry = callback; } }; } },
    location: { reload: () => { reloads++; } },
  });
  assert.equal(reloads, 0);
  retry();
  assert.equal(reloads, 1);
});

test('final build adds relative links without touching source lessons or instrumenting the offline page', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'english-pwa-'));
  try {
    await fs.mkdir(path.join(root, 'assets'), { recursive: true });
    await fs.mkdir(path.join(root, '_site/lessons/a1'), { recursive: true });
    for (const file of ['manifest.webmanifest', 'offline.html', 'service-worker.js', 'assets/pwa-register.js']) {
      await fs.copyFile(path.join(ROOT, file), path.join(root, file));
    }
    const original = '<html><head><title>Lesson</title>\n</head><body><script src="auth-client.js"></script>Current lesson</body></html>';
    await fs.writeFile(path.join(root, '_site/index.html'), original);
    const privacy = '<html><head><title>Privacy</title></head><body>Public privacy information</body></html>';
    await fs.writeFile(path.join(root, 'privacy.html'), privacy);
    const lesson = path.join(root, '_site/lessons/a1/day-01.html');
    await fs.writeFile(lesson, original);
    const result = await buildPwa(root);
    assert.equal(result.pages, 3);
    const built = await fs.readFile(lesson, 'utf8');
    assert.match(built, /href="\.\.\/\.\.\/manifest.webmanifest"/);
    assert.match(built, /src="\.\.\/\.\.\/assets\/pwa-register.js\?v=[a-f0-9]{16}"/);
    assert.match(built, /<script src="auth-client.js"><\/script>Current lesson/);
    assert.equal(await fs.readFile(path.join(root, '_site/offline.html'), 'utf8'), await fs.readFile(path.join(root, 'offline.html'), 'utf8'));
    assert.doesNotMatch(await fs.readFile(path.join(root, '_site/service-worker.js'), 'utf8'), /__PWA_OFFLINE_REVISION__/);
    const publicPrivacy = await fs.readFile(path.join(root, '_site/privacy.html'), 'utf8');
    assert.match(publicPrivacy, /Public privacy information/);
    assert.doesNotMatch(publicPrivacy, /auth-client|activity-tracker/);
    await buildPwa(root);
    assert.equal(await fs.readFile(lesson, 'utf8'), built);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('english-pwa-'));
    await fs.rm(root, { recursive: true, force: true });
  }
});
