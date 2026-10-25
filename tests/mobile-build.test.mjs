import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildMobile, externalizeMedia } from '../scripts/build-mobile.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS = ['mobile-common.css', 'mobile-lessons.css', 'mobile-board.css', 'mobile-yds.css'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const uri = (mime, bytes) => `data:${mime};base64,${bytes.toString('base64')}`;
const bytesFor = prefix => Buffer.concat([
  Buffer.from(prefix),
  Buffer.from(Array.from({ length: 7200 }, (_, index) => (index * 97 + 31) % 256)),
]);
const page = (body = '<p>New class work</p>', head = '', attributes = '') =>
  `<!doctype html><html><head><title>Future lesson</title>${head}</head><body${attributes}>${body}</body></html>`;

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'english-mobile-build-'));
  t.after(async () => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('english-mobile-build-'));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  await fs.mkdir(path.join(root, 'assets'), { recursive: true });
  await fs.mkdir(path.join(root, '_site/assets'), { recursive: true });
  for (const file of CSS) await fs.writeFile(path.join(root, 'assets', file), `/* ${file} */\nbody { color: #164e45; }\n`);
  await fs.writeFile(path.join(root,'assets/mobile-tools.js'),'(() => {})();\n');
  const write = async (name, html, source = false) => {
    for (const base of source ? [root, path.join(root, '_site')] : [path.join(root, '_site')]) {
      const target = path.join(base, name);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, html);
    }
  };
  await write('index.html', page());
  return { root, write, read: name => fs.readFile(path.join(root, '_site', name), 'utf8') };
}

test('large images, audio, PDF and Word resources retain their exact bytes and content hashes', async () => {
  const resources = [
    ['image/png', 'png', bytesFor([137, 80, 78, 71, 13, 10, 26, 10])],
    ['image/jpeg', 'jpg', bytesFor([255, 216, 255, 224])],
    ['audio/wav', 'wav', bytesFor('RIFF\0\0\0\0WAVE')],
    ['audio/mpeg', 'mp3', bytesFor('ID3')],
    ['application/pdf', 'pdf', bytesFor('%PDF-1.7\n')],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx', bytesFor('PK\x03\x04')],
  ];
  const original = resources.map(([mime, , bytes], index) => `<a download="lesson-${index}" href="${uri(mime, bytes)}">File ${index}</a>`).join('\n');
  const written = new Map();
  const result = await externalizeMedia(original, 'lessons/a2/future/topic.html', async (name, bytes) => {
    assert.ok(!written.has(name));
    written.set(name, bytes);
  });
  assert.equal(result.files, resources.length);
  assert.equal(written.size, resources.length);
  assert.equal(result.removed, Buffer.byteLength(original) - Buffer.byteLength(result.html));
  for (const [mime, extension, bytes] of resources) {
    const name = `${digest(bytes)}.${extension}`;
    assert.deepEqual(written.get(name), bytes, mime);
    assert.ok(result.html.includes(`href="../../../assets/media/${name}"`), mime);
    assert.ok(!result.html.includes(uri(mime, bytes)), mime);
  }
  assert.match(result.html, /download="lesson-5"/);
});

test('repeated references in image attributes, inline CSS and JavaScript share one external resource', async () => {
  const bytes = bytesFor('PNG repeat');
  const embedded = uri('image/png', bytes);
  const original = `<img src="${embedded}" alt="Class photo"><style>.photo{background-image:url('${embedded}')}</style><script>const photo="${embedded}";</script>`;
  let writes = 0;
  const result = await externalizeMedia(original, 'lessons\\b1\\day-01.html', async (name, actual) => {
    writes++;
    assert.equal(name, `${digest(bytes)}.png`);
    assert.deepEqual(actual, bytes);
  });
  const url = `../../assets/media/${digest(bytes)}.png`;
  assert.equal(writes, 1);
  assert.equal(result.files, 1);
  assert.equal(result.html, original.replaceAll(embedded, url));
});

test('unknown types, small resources and malformed base64 remain untouched', async () => {
  const valid = bytesFor('unchanged').toString('base64');
  const examples = [
    uri('application/octet-stream', bytesFor('unknown')),
    uri('image/png', Buffer.from('small image')),
    `data:image/png;base64,${valid.slice(0, 8400)}!${valid.slice(8400)}`,
    `data:audio/wav;base64,${valid.slice(0, 8400)}%${valid.slice(8400)}`,
    `data:application/pdf;base64,${valid}===`,
    `data:image/png;base64,${'A'.repeat(9001)}`,
    `data:image/png;base64,${'A'.repeat(9000)}B`,
  ];
  const original = examples.map(value => `<a href="${value}">Unchanged</a>`).join('\n');
  const result = await externalizeMedia(original, 'lessons/a2/new.html', async () => assert.fail('Invalid resource was externalized'));
  assert.equal(result.html, original);
  assert.equal(result.files, 0);
  assert.equal(result.removed, 0);
});

test('media extraction refuses paths outside the site before writing any resource', async () => {
  const html = `<img src="${uri('image/png', bytesFor('path'))}">`;
  for (const name of ['/outside.html', '../outside.html', 'lessons/../../outside.html', '..\\outside.html']) {
    await assert.rejects(externalizeMedia(html, name, async () => assert.fail('Unsafe path wrote a resource')), /inside the site/);
  }
});

test('future lessons get the appropriate family CSS, current versions and a complete viewport', async t => {
  const f = await fixture(t);
  const cases = [
    ['lessons/a2/new-topic.html', 'lesson', page('<p>Vocabulary</p>', '', ' class="existing theme"')],
    ['lessons/b1/new-board.html', 'board', page('<p>Conversation</p>', '<meta content="width=device-width, initial-scale=1" name="viewport">', ' class=board-shell')],
    ['lessons/a1/new-root.html', 'board', page('<div id="board-root"></div>', "<meta name='viewport' content='width=device-width,initial-scale=1'>")],
    ['lessons/b1/new-legacy.html', 'board', page('<script>const DATA={lesson:[]};</script>', '<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">')],
    ['lessons/yds/new-topic.html', 'yds', page('<p>YDS practice</p>', '<meta name="viewport">')],
  ];
  for (const [name, , source] of cases) await f.write(name, source, true);
  const report = await buildMobile(f.root);
  assert.equal(report.length, cases.length);
  for (const [name, family, source] of cases) {
    const html = await f.read(name);
    const body = html.match(/<body\b([^>]*)>/i)[1];
    assert.equal((body.match(/\bclass\s*=/gi) || []).length, 1, name);
    assert.match(body, new RegExp(`\\bmobile-${family}\\b`), name);
    if (source.includes('existing theme')) assert.match(body, /existing theme/);
    const viewport = html.match(/<meta\b[^>]*name\s*=\s*(?:"viewport"|'viewport'|viewport)[^>]*>/i)
      || html.match(/<meta\b[^>]*content=[^>]*name="viewport"[^>]*>/i);
    assert.ok(viewport, name);
    assert.match(viewport[0], /width=device-width/);
    assert.equal((viewport[0].match(/viewport-fit=cover/g) || []).length, 1, name);
    const familyCss = `mobile-${family === 'lesson' ? 'lessons' : family}.css`;
    for (const asset of ['mobile-common.css', familyCss]) {
      const expected = digest(await fs.readFile(path.join(f.root, 'assets', asset))).slice(0, 12);
      assert.ok(html.includes(`../../assets/${asset}?v=${expected}`), name + ' ' + asset);
    }
    assert.equal(report.find(row => row.lesson === name).family, family);
    assert.match(html,/src="\.\.\/\.\.\/assets\/mobile-tools\.js\?v=[a-f0-9]{12}"/);
    assert.equal(await fs.readFile(path.join(f.root, name), 'utf8'), source);
  }
  const home = await f.read('index.html');
  assert.match(home, /class="mobile-portal"/);
  assert.match(home, /href="assets\/mobile-common\.css\?v=[a-f0-9]{12}"/);
  assert.doesNotMatch(home, /mobile-(?:lessons|board|yds)\.css/);
  assert.doesNotMatch(home,/mobile-tools\.js/);
});

test('the complete build deduplicates media across lessons and is byte-stable on a second run', async t => {
  const f = await fixture(t);
  const bytes = bytesFor('shared audio');
  const source = page(`<audio controls src="${uri('audio/wav', bytes)}"></audio>`);
  const names = ['lessons/a2/one.html', 'lessons/b1/two.html'];
  for (const name of names) await f.write(name, source, true);
  await f.write('privacy.html', '<html>Public privacy</html>');
  await f.write('offline.html', '<html>Offline retry</html>');
  await f.write('404.html', '<html>Page missing</html>');
  await buildMobile(f.root);
  assert.deepEqual(await fs.readdir(path.join(f.root, '_site/assets/media')), [`${digest(bytes)}.wav`]);
  assert.deepEqual(await fs.readFile(path.join(f.root, '_site/assets/media', `${digest(bytes)}.wav`)), bytes);
  const first = new Map(await Promise.all(['index.html', ...names].map(async name => [name, await f.read(name)])));
  await buildMobile(f.root);
  for (const [name, html] of first) assert.equal(await f.read(name), html, name);
  for (const name of names) assert.equal(await fs.readFile(path.join(f.root, name), 'utf8'), source);
  for (const [name, content] of [['privacy.html', 'Public privacy'], ['offline.html', 'Offline retry'], ['404.html', 'Page missing']]) {
    assert.equal(await f.read(name), `<html>${content}</html>`);
  }
  for (const asset of CSS) assert.deepEqual(await fs.readFile(path.join(f.root, '_site/assets', asset)), await fs.readFile(path.join(f.root, 'assets', asset)));
  await fs.writeFile(path.join(f.root, 'assets/mobile-common.css'), '/* updated phone controls */');
  await buildMobile(f.root);
  const updated = await f.read(names[0]);
  assert.notEqual(updated, first.get(names[0]));
  assert.equal((updated.match(/english-mobile:start/g) || []).length, 1);
  assert.equal((updated.match(/mobile-common\.css\?v=/g) || []).length, 1);
});

test('all 18 existing lessons keep their source files and receive the expected mobile family', async t => {
  const f = await fixture(t);
  const families = {
    'a1/day-01': 'lesson', 'a1/day-02': 'lesson', 'a1/day-03': 'lesson', 'a1/day-04': 'lesson',
    'a2/a1-review': 'lesson', 'a2/day-01': 'board', 'a2/day-02': 'lesson',
    'a2/day-04': 'lesson', 'a2/day-05': 'lesson', 'a2/practice': 'board',
    'b1/day-01': 'board', 'b1/day-02': 'lesson', 'b1/day-03': 'lesson',
    'b1/day-04': 'lesson', 'b1/day-05': 'lesson', 'b1/day-06': 'lesson', 'b1/practice': 'board',
    'yds/grammar-studio': 'yds',
  };
  const sourceHashes = new Map();
  for (const name of Object.keys(families)) {
    const file = `lessons/${name}.html`;
    const source = await fs.readFile(path.join(ROOT, file));
    sourceHashes.set(file, digest(source));
    await f.write(file, source, true);
  }
  const report = await buildMobile(f.root);
  assert.equal(report.length, 18);
  for (const [name, family] of Object.entries(families)) {
    const file = `lessons/${name}.html`;
    assert.equal(report.find(row => row.lesson === file).family, family, file);
    const html = await f.read(file);
    assert.match(html.match(/<body\b[^>]*>/i)[0], new RegExp(`\\bmobile-${family}\\b`), file);
    assert.equal(digest(await fs.readFile(path.join(f.root, file))), sourceHashes.get(file), file);
    assert.equal(digest(await fs.readFile(path.join(ROOT, file))), sourceHashes.get(file), file);
  }
});
