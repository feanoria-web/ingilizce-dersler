(() => {
  'use strict';
  const access = window.EnglishAccess;
  const $ = id => document.getElementById(id);
  const LETTERS = 'abcdef';
  const STATUS = {correct: 'Doğru', incorrect: 'Yanlış', blank: 'Boş', invalid: 'Geçersiz'};
  let adminData = null, filter = 'review', current = null;
  let pageActive = true, pageEpoch = 0;
  const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined && text !== null) node.textContent = String(text); if (className) node.className = className; return node; };
  function status(text, error = false) { $('exam-status').textContent = text; $('exam-status').classList.toggle('is-error', error); $('exam-status').hidden = !text; }
  function clear() { $('exam-root').replaceChildren(); current = null; }
  function lock() { pageActive = false; pageEpoch++; window.EnglishExamVisits?.stop(); adminData = null; clear(); $('exam-admin').hidden = true; status(''); }
  function sameSession(session) { const live=access?.session(); return live?.role===session.role&&live?.token===session.token&&(session.role!=='student'||live.student?.id===session.student?.id); }
  function dateLabel(value) {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('tr-TR', {day: 'numeric', month: 'long', year: 'numeric'}).format(date);
  }
  function outcome(question, mark) {
    if (mark === '-') return 'blank';
    if (mark === '*') return 'invalid';
    return LETTERS.indexOf(mark) === question.answer ? 'correct' : 'incorrect';
  }
  const optionLabel = (question, index) => `${LETTERS[index]}) ${question.options[index]}`;
  const filled = question => question.prompt.replace(/_{2,}/, question.options[question.answer]);

  function scoreCard(exam, score) {
    const card = element('section', undefined, 'exam-score');
    card.setAttribute('aria-label', 'Puan özeti');
    const head = element('div', undefined, 'exam-score-head');
    const total = element('p', undefined, 'exam-total');
    total.append(element('strong', score.total), element('span', `/ ${score.max}`));
    const meta = element('div');
    meta.append(element('p', dateLabel(exam.date), 'exam-date'), element('h2', exam.title));
    if (exam.description) meta.append(element('p', exam.description, 'exam-description'));
    head.append(total, meta);
    const counts = element('ul', undefined, 'exam-counts');
    for (const [key, label] of [['correct', 'doğru'], ['incorrect', 'yanlış'], ['blank', 'boş'], ['invalid', 'geçersiz']]) {
      if (key === 'invalid' && !score.invalid) continue;
      const item = element('li', undefined, `is-${key}`); item.append(element('strong', score[key]), element('span', label)); counts.append(item);
    }
    const sections = element('div', undefined, 'exam-sections');
    for (const section of score.sections) {
      const box = element('div', undefined, `exam-section${section.passed ? ' is-passed' : ''}`);
      const bar = element('span', undefined, 'exam-bar'); const fill = element('span'); fill.style.width = `${Math.round(section.correct / section.count * 100)}%`; bar.append(fill);
      box.append(element('strong', `${section.level} bölümü`), element('span', `${section.correct} / ${section.count} doğru · ${section.earned.toLocaleString('tr-TR')} puan`), bar,
        element('small', `Soru başına ${section.points.toLocaleString('tr-TR')} puan · geçme sınırı ${section.threshold} doğru ${section.passed ? '✓' : ''}`));
      sections.append(box);
    }
    card.append(head, counts, sections);
    if (score.level) card.append(element('p', `Seviye sonucu: ${score.level}`, 'exam-level'));
    return card;
  }

  function topicList(exam, answers) {
    const topics = new Map();
    exam.questions.forEach((question, index) => { if (outcome(question, answers[index]) !== 'correct') topics.set(question.topic, [...(topics.get(question.topic) || []), question.n]); });
    if (!topics.size) return null;
    const box = element('section', undefined, 'exam-topics');
    box.append(element('h2', 'Tekrar etmen gereken konular'), element('p', 'Konuya tıklayarak ilgili soruya gidebilirsin.', 'exam-hint'));
    const list = element('ul');
    for (const [topic, numbers] of topics) {
      const item = element('li'); const link = element('a', `${topic} · ${numbers.join(', ')}`); link.href = `#soru-${numbers[0]}`;
      link.addEventListener('click', () => { if (filter === 'correct') setFilter('all'); });
      item.append(link); list.append(item);
    }
    box.append(list);
    return box;
  }

  function questionCard(question, mark) {
    const state = outcome(question, mark), chosen = LETTERS.indexOf(mark);
    const card = element('article', undefined, `exam-question is-${state}`);
    card.id = `soru-${question.n}`; card.dataset.outcome = state;
    const head = element('header');
    head.append(element('span', question.n, 'exam-number'), element('span', question.topic, 'exam-topic'), element('span', STATUS[state], `exam-pill is-${state}`));
    const options = element('ul', undefined, 'exam-options');
    question.options.forEach((option, index) => {
      const item = element('li', optionLabel(question, index));
      if (index === question.answer) { item.classList.add('is-answer'); item.append(element('small', 'doğru cevap')); }
      if (index === chosen && index !== question.answer) { item.classList.add('is-chosen'); item.append(element('small', 'senin cevabın')); }
      if (index === chosen && index === question.answer) item.classList.add('is-chosen');
      options.append(item);
    });
    card.append(head, element('p', question.prompt, 'exam-prompt'), options);
    const why = element('div', undefined, 'exam-why');
    if (state === 'incorrect') why.append(element('p', `Neden ${optionLabel(question, chosen)} değil? ${question.why[chosen]}`, 'exam-mistake'));
    if (state === 'blank') why.append(element('p', 'Bu soruyu boş bırakmışsın.', 'exam-mistake'));
    if (state === 'invalid') why.append(element('p', 'Bu soruda birden fazla şık işaretlenmiş; cevap geçersiz sayıldı.', 'exam-mistake'));
    why.append(element('p', question.explanation), element('p', `Doğru cümle: ${filled(question)}`, 'exam-model'));
    if (state === 'correct') { const details = element('details'); details.append(element('summary', 'Açıklamayı göster'), why); card.append(details); }
    else card.append(why);
    return card;
  }

  function writingSection(set, writing) {
    const section = element('section', undefined, 'exam-writing');
    section.append(element('h2', set.title), element('p', 'Yazılı bölüm puana katılmadı; amacı hatalarını görmen ve doğrusunu öğrenmen.', 'exam-hint'));
    if (writing.empty) section.append(element('p', 'Yazılı bölüm boş bırakılmış.', 'exam-empty-note'));
    set.prompts.forEach((prompt, index) => {
      const part = writing.parts[index];
      if (!part) return;
      const card = element('article', undefined, 'exam-part');
      card.append(element('h3', `${index + 1}. ${prompt}`));
      const original = element('div', undefined, 'exam-text is-original'); original.append(element('span', 'Senin yazdığın', 'exam-label'), element('p', part.original || 'Bu soruyu boş bırakmışsın.'));
      const corrected = element('div', undefined, 'exam-text is-corrected'); corrected.append(element('span', part.original ? 'Düzeltilmiş hâli' : 'Örnek cevap', 'exam-label'), element('p', part.corrected));
      card.append(original, corrected);
      if (part.fixes.length) {
        const list = element('ol', undefined, 'exam-fixes');
        for (const fix of part.fixes) {
          const item = element('li'); const change = element('p', undefined, 'exam-change');
          change.append(element('del', fix.from), element('span', '→', 'exam-arrow'), element('ins', fix.to));
          item.append(change, element('p', fix.note)); list.append(item);
        }
        card.append(element('h4', 'Düzeltmeler'), list);
      }
      if (part.note) card.append(element('p', part.note, 'exam-part-note'));
      section.append(card);
    });
    const summary = element('div', undefined, 'exam-summary');
    if (writing.strengths) { const good = element('div', undefined, 'is-good'); good.append(element('h3', 'İyi yaptıkların'), element('p', writing.strengths)); summary.append(good); }
    if (writing.focus.length) { const next = element('div', undefined, 'is-next'); const list = element('ul'); for (const item of writing.focus) list.append(element('li', item)); next.append(element('h3', 'Bundan sonra dikkat et'), list); summary.append(next); }
    if (summary.childElementCount) section.append(summary);
    return section;
  }

  function setFilter(value) {
    filter = value;
    document.querySelectorAll('[data-exam-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.examFilter === value)));
    document.querySelectorAll('.exam-question').forEach(card => { const state = card.dataset.outcome; card.hidden = value === 'review' ? state === 'correct' : value === 'correct' ? state !== 'correct' : false; });
  }

  function questions(exam, answers) {
    const section = element('section', undefined, 'exam-questions');
    const head = element('div', undefined, 'exam-questions-head'); head.append(element('h2', 'Soru soru düzeltmeler'));
    const outcomes = exam.questions.map((question, index) => outcome(question, answers[index]));
    const filters = element('div', undefined, 'exam-filters'); filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', 'Soruları süz');
    for (const [value, label, count] of [['review', 'Yanlış ve boş', outcomes.filter(x => x !== 'correct').length], ['all', 'Tümü', outcomes.length], ['correct', 'Doğrular', outcomes.filter(x => x === 'correct').length]]) {
      const button = element('button', `${label} (${count})`, 'exam-filter'); button.type = 'button'; button.dataset.examFilter = value; button.addEventListener('click', () => setFilter(value)); filters.append(button);
    }
    head.append(filters); section.append(head);
    exam.questions.forEach((question, index) => section.append(questionCard(question, answers[index])));
    return section;
  }

  function render(exam, result, {admin = false} = {}) {
    const article = element('article', undefined, 'exam-result');
    if (admin) {
      const box = element('div', undefined, 'exam-checks');
      box.append(element('h2', `Kağıt no ${result.paper} · kağıttaki ad: ${result.nameOnPaper}`));
      if (result.checks?.length) { const list = element('ul'); for (const item of result.checks) list.append(element('li', item)); box.append(list); }
      else box.append(element('p', 'Kontrol notu yok.'));
      article.append(box);
    }
    article.append(scoreCard(exam, result.score));
    if (result.notes.length) { const notes = element('ul', undefined, 'exam-notes'); for (const note of result.notes) notes.append(element('li', note)); article.append(notes); }
    const topics = topicList(exam, result.answers); if (topics) article.append(topics);
    article.append(questions(exam, result.answers), writingSection(exam.writingSet, result.writing));
    article.append(element('p', 'Kağıdın fotoğraftan aktarıldı. Bir işaret ya da kelime yanlış okunmuşsa öğretmenine söyle. [?] fotoğrafta okunamayan kelimeleri gösterir.', 'exam-footnote'));
    return article;
  }

  function showStudent(data) {
    clear();
    if (!Array.isArray(data?.exams)) throw new Error('Sınav sonuçları doğrulanamadı.');
    if (!data.exams.length) { status(''); const empty = element('div', undefined, 'empty-state'); empty.append(element('span', '✎', 'empty-icon'), element('h3', 'Henüz bir sonucun yok.'), element('p', 'Sınav sonucun eklendiğinde burada görünecek.')); $('exam-root').append(empty); return; }
    status('');
    for (const exam of data.exams) $('exam-root').append(render(exam, exam.result));
    setFilter(filter);
  }

  function showAdminSelection() {
    const exam = adminData.exams.find(item => item.id === $('exam-admin-exam').value) || adminData.exams[0];
    const result = exam?.results.find(item => item.studentId === $('exam-admin-student').value) || exam?.results[0];
    clear();
    if (!exam || !result) { status('Bu sınav için sonuç yok.'); return; }
    status('');
    current = result.studentId;
    $('exam-root').append(render({...exam, writingSet: exam.writingSets[result.writing.set]}, result, {admin: true}));
    setFilter(filter);
  }

  function fillStudents() {
    const exam = adminData.exams.find(item => item.id === $('exam-admin-exam').value) || adminData.exams[0];
    const select = $('exam-admin-student'); select.replaceChildren();
    for (const result of exam?.results || []) { const option = element('option', `${result.studentName} · ${result.group} · ${result.score.total} puan`); option.value = result.studentId; select.append(option); }
    if (current && exam?.results.some(item => item.studentId === current)) select.value = current;
  }

  function showAdmin(data) {
    if (!Array.isArray(data?.exams)) throw new Error('Sınav sonuçları doğrulanamadı.');
    adminData = data;
    const exams = $('exam-admin-exam'); exams.replaceChildren();
    for (const exam of data.exams) { const option = element('option', `${exam.title} · ${dateLabel(exam.date)}${exam.published ? '' : ' (yayında değil)'}`); option.value = exam.id; exams.append(option); }
    $('exam-admin').hidden = false;
    if (!data.exams.length) { status('Henüz sınav eklenmedi.'); return; }
    fillStudents(); showAdminSelection();
  }

  $('exam-admin-exam').addEventListener('change', () => { fillStudents(); showAdminSelection(); });
  $('exam-admin-student').addEventListener('change', showAdminSelection);
  window.addEventListener('english:logout', lock);
  window.addEventListener('english:session-expired', lock);
  window.addEventListener('pagehide', lock);
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  const initialEpoch=pageEpoch;
  access?.ready.then(async session => {
    if (!session || !pageActive || initialEpoch!==pageEpoch || !sameSession(session)) return;
    try {
      const data=await access.request(session.role==='admin'?'/api/admin/exam-results':'/api/exam-results');
      if(!pageActive||initialEpoch!==pageEpoch||!sameSession(session))return;
      if(session.role==='admin')showAdmin(data);
      else {showStudent(data);window.EnglishExamVisits?.rendered();}
    } catch (error) { if(pageActive&&initialEpoch===pageEpoch){clear();status(error.message,true);} }
  });
})();
