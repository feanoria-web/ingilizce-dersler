import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

export const STUDY_LESSON = 'lessons/b1/day-05.html';
// Lessons that receive the detailed study guide at publication. Extra (game) screens
// are optional for lessons whose games need no separate grammar explanation.
export const STUDY_LESSONS = Object.freeze({
  [STUDY_LESSON]: Object.freeze({ dir: 'b1-study', label: 'B1', extras: true, searchHint: 'alone, lonely, on the one hand, fatura…' }),
  'lessons/a1/day-04.html': Object.freeze({ dir: 'a1-study', label: 'A1', extras: false, searchHint: 'half past, get up, always, kahvaltı…' }),
});
export const serializeStudy = data => JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export function readStudyLesson(html) {
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .find(match => /\bconst LESSON\s*=/.test(match[1]));
  if (!script) throw new Error('B1 ayrıntılı anlatım: ders verisi bulunamadı.');
  return JSON.parse(vm.runInNewContext(`${script[1]}\nJSON.stringify(LESSON)`, {}, { timeout: 1500 }));
}

export function studyWordCount(value) {
  if (typeof value === 'string') return value.trim().split(/\s+/u).filter(Boolean).length;
  if (Array.isArray(value)) return value.reduce((n, item) => n + studyWordCount(item), 0);
  if (value && typeof value === 'object') return Object.entries(value).reduce((n, [key, item]) => n + (/^(id|screenId|sourceTerms)$/.test(key) ? 0 : studyWordCount(item)), 0);
  return 0;
}

const lessonBlocks = lesson => [...new Set(lesson.screens.filter(screen => screen.block > 0).map(screen => screen.block))].sort((a, b) => a - b);

export function validateStudy(blocks, lesson, config = STUDY_LESSONS[STUDY_LESSON]) {
  const label = config.label;
  const count = lessonBlocks(lesson).length;
  if (blocks.length !== count || blocks.some((block, i) => block.version !== 1 || block.block !== i + 1)) throw new Error(`${label} ayrıntılı anlatım: ${count} sıralı içerik dosyası gerekli.`);
  const chapters = blocks.flatMap(block => block.chapters.map(chapter => ({ ...chapter, block: block.block })));
  const glossary = blocks.flatMap(block => block.glossary.map(word => ({ ...word, block: block.block })));
  const teaching = lesson.screens.filter(screen => screen.block > 0 && screen.type !== 'break');
  const expected = teaching.filter(screen => config.extras || !screen.extra).map(screen => screen.id);
  const allowed = new Set(teaching.map(screen => screen.id));
  const actual = chapters.map(chapter => chapter.screenId);
  if (new Set(actual).size !== actual.length || actual.some(id => !allowed.has(id)) || expected.some(id => !actual.includes(id))) throw new Error(`${label} ayrıntılı anlatım: bütün ders ekranları birer kez açıklanmalı.`);
  if (new Set(glossary.map(word => word.id)).size !== glossary.length) throw new Error(`${label} ayrıntılı anlatım: kelime kimlikleri benzersiz olmalı.`);
  for (const chapter of chapters) {
    if (!chapter.title || !chapter.intro?.length || !chapter.patterns?.length) throw new Error(`${label} ayrıntılı anlatım: eksik konu ${chapter.screenId}.`);
    for (const pattern of chapter.patterns) {
      if (!pattern.title || !pattern.meaning || !pattern.explanation?.length || !pattern.examples?.length) throw new Error(`${label} ayrıntılı anlatım: eksik kalıp ${chapter.screenId}/${pattern.id}.`);
      for (const example of pattern.examples) if (!example.en || !example.tr || !example.why?.length) throw new Error(`${label} ayrıntılı anlatım: açıklamasız örnek ${chapter.screenId}/${pattern.id}.`);
    }
  }
  const originalTerms = lesson.vocab.flatMap(group => group.items.map(item => item[0]));
  const covered = new Set(glossary.flatMap(word => word.sourceTerms || []));
  const missing = originalTerms.filter(term => !covered.has(term));
  if (missing.length) throw new Error(`${label} ayrıntılı anlatım: açıklaması eksik kelimeler: ${missing.join(', ')}.`);
  for (const word of glossary) if (!word.term || !word.meaning || !word.explanation?.length || word.examples?.length < 3 || word.examples.some(example => !example.en || !example.tr)) throw new Error(`${label} ayrıntılı anlatım: eksik kelime ${word.id}.`);
  return { version: 1, blocks: lessonBlocks(lesson), searchHint: config.searchHint, chapters, glossary, stats: { chapters: chapters.length, patterns: chapters.reduce((n, chapter) => n + chapter.patterns.length, 0), words: glossary.length, sourceTerms: originalTerms.length, wordCount: studyWordCount(blocks) } };
}

export async function loadStudy(root, lesson, config = STUDY_LESSONS[STUDY_LESSON]) {
  const blocks = await Promise.all(lessonBlocks(lesson).map(async n => JSON.parse(await fs.readFile(path.join(root, config.dir, `block-${n}.json`), 'utf8'))));
  const data = validateStudy(blocks, lesson, config);
  const concise = JSON.parse(await fs.readFile(path.join(root, config.dir, 'concise.json'), 'utf8'));
  return applyConciseStudy(data, concise, config.label);
}

export function applyConciseStudy(data, concise, label = 'B1') {
  const fail = message => { throw new Error(`${label} kısa anlatım: ${message}`); };
  if (concise.version !== 1 || concise.chapters?.length !== data.chapters.length) fail('bütün konu ekranları özetlenmeli.');
  const ids = concise.chapters.map(chapter => chapter.screenId);
  if (new Set(ids).size !== ids.length || ids.some(id => !data.chapters.some(chapter => chapter.screenId === id))) fail('konu kimlikleri eşleşmiyor.');
  return { ...data, chapters: data.chapters.map(chapter => {
    const short = concise.chapters.find(item => item.screenId === chapter.screenId);
    if (!short?.intro?.trim() || short.patterns?.length !== chapter.patterns.length) fail(`eksik özet: ${chapter.screenId}.`);
    const patternIds = short.patterns.map(item => item.id);
    if (new Set(patternIds).size !== patternIds.length || patternIds.some(id => !chapter.patterns.some(pattern => pattern.id === id))) fail(`kalıp kimlikleri eşleşmiyor: ${chapter.screenId}.`);
    return { ...chapter, shortIntro: short.intro, patterns: chapter.patterns.map(pattern => {
      const preview = short.patterns.find(item => item.id === pattern.id);
      if (!Array.isArray(preview.summary) || preview.summary.length < 3 || preview.summary.length > 4 || preview.summary.some(text => typeof text !== 'string' || !text.trim())) fail(`3–4 öğretici madde gerekli: ${pattern.id}.`);
      if (!Number.isInteger(preview.exampleIndex) || preview.exampleIndex < 0 || preview.exampleIndex >= pattern.examples.length) fail(`örnek seçimi geçersiz: ${pattern.id}.`);
      return { ...pattern, summary: preview.summary, exampleIndex: preview.exampleIndex };
    }) };
  }) };
}

function replaceLessonOnce(html, before, after, label = 'B1') {
  if (!html.includes(before) && html.includes(before.replace(/\n/g, '\r\n'))) {
    before = before.replace(/\n/g, '\r\n');
    after = after.replace(/\n/g, '\r\n');
  }
  if (html.split(before).length !== 2) throw new Error(`${label} ayrıntılı anlatım: ders bağlantısı değişmiş: ${before.slice(0, 75)}`);
  return html.replace(before, () => after);
}

export async function instrumentB1Study(html, relative, root) {
  const config = STUDY_LESSONS[relative];
  if (!config) return html;
  if (html.includes('id="english-b1-study-data"')) return html;
  const lesson = readStudyLesson(html);
  const data = await loadStudy(root, lesson, config);
  const replaceOnce = (source, before, after) => replaceLessonOnce(source, before, after, config.label);
  const safe = serializeStudy(data);
  const versions = await Promise.all(['b1-study.css', 'b1-study.js'].map(async file => createHash('sha256').update(await fs.readFile(path.join(root, 'assets', file))).digest('hex').slice(0, 12)));
  html = replaceOnce(html, '</head>', `<link rel="stylesheet" href="../../assets/b1-study.css?v=${versions[0]}">\n<script id="english-b1-study-data" type="application/json">${safe}</script>\n<script src="../../assets/b1-study.js?v=${versions[1]}"></script>\n</head>`);
  const bind = 'window.EnglishB1Study?.bind(m, s.id, { say: text => { if (synth) synth.cancel(); speak(text); }, go: id => go(idxOf(id)) });';
  html = replaceOnce(html, 'if (st.idx < 0) { m.innerHTML = renderHome(); bindHome(m); return; }', 'if (st.idx < 0) { m.innerHTML = renderHome() + (window.EnglishB1Study?.render("home") || ""); bindHome(m); window.EnglishB1Study?.bind(m, "home", { go: id => go(idxOf(id)) }); return; }');
  html = replaceOnce(html, 'if (s.type === "vocab") { m.innerHTML = header(s) + renderVocab(); bindVocab(m); return; }', `if (s.type === "vocab") { m.innerHTML = header(s) + (window.EnglishB1Study?.render("vocab") || "") + renderVocab(); bindVocab(m); ${bind} return; }`);
  html = replaceOnce(html, 'let html = header(s);', 'let html = header(s) + (window.EnglishB1Study?.render(s.id) || "");');
  html = replaceOnce(html, '    bindCommon(m);\n  }\n\n  function bindCommon(root)', `    bindCommon(m);\n    ${bind}\n  }\n\n  function bindCommon(root)`);
  return html;
}
