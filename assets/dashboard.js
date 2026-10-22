(() => {
  'use strict';
  const access = window.EnglishAccess;
  if (!access || document.body.dataset.accessPage !== 'admin') return;
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const format = new Intl.NumberFormat('tr-TR');
  const number = value => Number.isFinite(Number(value)) && value !== null && value !== '' ? format.format(Number(value)) : '—';
  const datetime = value => {
    if (!value) return '—';
    const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('tr-TR', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Europe/Istanbul'}).format(date);
  };
  const duration = value => {
    if (!Number.isFinite(Number(value)) || value == null) return '—';
    const seconds = Math.max(0, Math.floor(Number(value))); const minutes = Math.floor(seconds / 60);
    return minutes >= 60 ? `${Math.floor(minutes/60)} sa ${minutes%60} dk` : minutes ? `${minutes} dk` : `${seconds} sn`;
  };
  const eventNames = {login:'Giriş yaptı',logout:'Çıkış yaptı',site_enter:'Ders panelini açtı',page_view:'Sayfayı açtı',lesson_open:'Dersi açtı',lesson_view:'Dersi açtı',activity_open:'Etkinliği açtı',activity_view:'Etkinliği görüntüledi',activity_complete:'Etkinliği tamamladı',activity:'Etkinlikle çalıştı',answer_submit:'Yanıtını gönderdi',answer_check:'Yanıtlarını kontrol etti',answer_reveal:'Yanıtı görüntüledi',quiz_check:'Yanıtlarını kontrol etti',audio_play:'Dinleme sesini başlattı',audio_pause:'Dinlemeyi duraklattı',audio_end:'Dinlemeyi tamamladı',heartbeat:'Aktif çalışma kaydı',level_select:'Seviye seçti',vocab_reveal:'Kelime anlamını açtı',vocabulary_reveal:'Kelime anlamını açtı',navigate:'Ders içinde ilerledi'};
  eventNames.question_result = 'Soru sonucu'; eventNames.audio_complete = 'Dinlemeyi tamamladı'; eventNames.exam_results_view = 'Sınav sonuçları sayfasını açtı';
  Object.assign(eventNames,{tab_visible:'Sekme ön plana geldi',tab_hidden:'Sekme arka plana geçti',window_focus:'Ders penceresi odak aldı',window_blur:'Pencere odağı değişti',idle_start:'Etkileşim durakladı',abandoned:'Açık bırakılmış olabilir',resumed:'Etkileşime geri döndü',page_leave:'Sayfadan ayrıldı'});
  Object.assign(eventNames,{question_open:'Soruyu açtı',help_used:'Yardım açtı',page_summary:'Sayfa çalışma süresi',lesson_progress:'İlerleme kaydı',break_start:'Molayı başlattı',break_pause:'Molayı duraklattı',break_resume:'Molaya devam etti',break_end:'Mola sona erdi',dictionary_lookup:'Sözlükte kelime aradı'});
  const labelOf = value => value && typeof value === 'object' ? value.title || value.path || value.id || '' : value || '';
  const stateNames = {working:'Aktif etkileşim',reading:'Ön planda · etkileşim yok',background:'Arka sekmede',unfocused:'Pencere odağı başka yerde',left_open:'Açık bırakılmış olabilir',leaving:'Sayfadan ayrıldı',unknown:'Sinyal alınmıyor',stale:'Sinyal alınmıyor',legacy:'Önceki sürüm · ayrıntı sınırlı'};
  const interactionNames = {pointer:'İşaretçi etkileşimi',pointerdown:'Dokunma / tıklama',click:'Tıklama',keydown:'Klavye kullanımı',keyboard:'Klavye kullanımı',scroll:'Kaydırma',input:'Yanıt girişi',change:'Seçim değişikliği',touch:'Dokunma',touchstart:'Dokunma',mousemove:'İşaretçi hareketi',pointermove:'İşaretçi hareketi',navigation:'Ders içi gezinme',none:'Henüz etkileşim yok'};
  function stateBadge(status) { return `<span class="engagement-pill engagement-${Object.hasOwn(stateNames,status) ? status : 'unknown'}">${escape(stateNames[status] || stateNames.unknown)}</span>`; }
  function preciseDuration(value) { const seconds = Number(value); if (value == null || value === '' || !Number.isFinite(seconds) || seconds < 0) return '—'; const whole = Math.floor(seconds); return whole >= 60 ? `${Math.floor(whole / 60)} dk ${whole % 60} sn` : `${whole} sn`; }
  function safePage(path) {
    if (typeof path !== 'string' || !path.trim()) return null;
    try {
      const base = new URL('./',window.location.href), url = new URL(path,base);
      if (url.origin !== base.origin || url.username || url.password || !url.pathname.startsWith(base.pathname) || (url.pathname !== base.pathname && !/\.html$/.test(url.pathname))) return null;
      return {href:url.pathname + url.hash,path:url.pathname + url.hash};
    } catch { return null; }
  }
  function pageDetails(context) {
    if (!context.pagePath) return '';
    const page = safePage(context.pagePath);
    return page ? `<a class="context-path" href="${escape(page.href)}" target="_blank" rel="noopener noreferrer">${escape(page.path)} ↗</a>` : '<span class="context-path">Sayfa yolu doğrulanamadı</span>';
  }
  function contextDetails(event,showStatus = true) {
    const c = event.context;
    if (!c || typeof c !== 'object' || !Object.keys(c).length) return '';
    const status = event.stale ? 'unknown' : event.status || c.status;
    const screen = c.screenTitle, section = labelOf(c.section);
    const fields = [
      c.pageTitle ? ['Sayfa',c.pageTitle] : null,
      screen ? ['Ders içi ekran',screen] : null,
      c.screenId ? ['Ekran kimliği',c.screenId] : null,
      section && section !== screen ? ['Alt bölüm',section] : null,
      c.visibility ? ['Tarayıcı sekmesi',c.visibility === 'visible' ? 'Ön planda' : c.visibility === 'hidden' ? 'Arka planda' : 'Bilinmiyor'] : null,
      typeof c.focused === 'boolean' ? ['Pencere odağı',c.focused ? 'Ders penceresinde' : 'Başka yerde'] : null,
      Number.isFinite(Number(c.idleSeconds)) && c.idleSeconds != null ? [event.stale ? 'Son sinyalde etkileşimsiz' : 'Etkileşimsiz süre',preciseDuration(c.idleSeconds)] : null,
      c.lastInteractionAt ? ['Son etkileşim',datetime(c.lastInteractionAt)] : null,
      c.interaction ? ['Son etkileşim türü',interactionNames[c.interaction] || 'Sayfa etkileşimi'] : null,
      c.tabId ? ['Sekme kimliği',c.tabId] : null,
      event.stale && stateNames[event.lastStatus] ? ['Son bilinen durum',stateNames[event.lastStatus]] : null
    ].filter(Boolean);
    return `<div class="context-detail">${showStatus && status ? stateBadge(status) : ''}${pageDetails(c)}${fields.length ? `<dl>${fields.map(([key,value]) => `<dt>${escape(key)}</dt><dd>${escape(value)}</dd>`).join('')}</dl>` : ''}</div>`;
  }
  const studentIdOf = student => String(student.studentId || student.id || '');
  const lessonLabel = event => event.type === 'exam_results_view' ? 'Sınav sonuçlarım' : (event.lesson && typeof event.lesson === 'object' && event.lesson.title) || event.context?.pageTitle || labelOf(event.lesson) || 'Ders paneli';
  const activityLabel = event => event.type === 'exam_results_view' ? 'Sonuç sayfası' : labelOf(event.activity);
  const outcomeNames = {correct:'Doğru',incorrect:'Yanlış',blank:'Boş bırakıldı',ungraded:'Puanlanmadı'};
  const answerText = value => Array.isArray(value) ? value.join(' · ') : value == null || value === '' ? '—' : String(value);
  function outcomeBadge(details) { const value = details?.outcome; return value && outcomeNames[value] ? `<span class="result-pill result-${value}">${outcomeNames[value]}</span>` : '—'; }
  function questionDetails(event) {
    const d = event.details; if (!d || !d.outcome) return '';
    return `<div class="question-detail"><p>${escape(d.prompt || d.questionId || 'Soru')}</p><dl><dt>Verilen yanıt</dt><dd>${escape(answerText(d.selectedAnswer))}</dd><dt>Doğru yanıt</dt><dd>${escape(answerText(d.correctAnswer))}</dd></dl>${outcomeBadge(d)}${d.attempt ? `<small>Deneme ${escape(number(d.attempt))}</small>` : ''}</div>`;
  }
  const helpNames = {translation:'Türkçe açıklama',hint:'İpucu',answer:'Doğru yanıt',audio:'Dinleme'};
  const breakEndNames = {elapsed:'Süresi doldu',early:'Erken bitirildi',closed:'Mola kapatıldı',navigation:'Başka bölüme geçildi'};
  const knownBoolean = value => value === true ? 'Evet' : value === false ? 'Hayır' : 'Bilinmiyor';
  const pageNumber = value => value != null && Number(value) >= 0 ? number(Number(value) + 1) : '—';
  const learningOf = event => event.learning && typeof event.learning === 'object' ? event.learning : null;
  function learningDetails(event) {
    const l = learningOf(event); if (!l) return '';
    let fields = [];
    if (l.kind === 'question') fields = [['Konu',l.topicTitle || l.topicId],['Yanıt süresi',preciseDuration(l.wallSeconds)],['Aktif süre',preciseDuration(l.activeSeconds)],['Ölçüm',l.timingScope === 'question' ? 'Soru açılışından itibaren' : l.timingScope === 'screen' ? 'Ekran açılışından itibaren' : 'Süre bilinmiyor'],['Yardım kullandı',knownBoolean(l.helpUsed)],['İpucu açtı',knownBoolean(l.hintUsed)],['Yanıtı gördü',knownBoolean(l.answerRevealed)]];
    if (l.kind === 'help') fields = [['Yardım',helpNames[l.helpType] || 'Yardım'],['Soru',l.questionId],['Yardımdan önce denedi',knownBoolean(l.attemptedBeforeHelp)],['Konu',l.topicTitle || l.topicId]];
    if (l.kind === 'page') fields = [['Sayfa sırası',`${pageNumber(l.pageIndex)} / ${number(l.totalPages)}`],['Görüntüleme',preciseDuration(l.viewSeconds)],['Aktif süre',preciseDuration(l.activeSeconds)],['Takip kaydı',l.visitId]];
    if (l.kind === 'progress') fields = [['Ulaşılan sayfa',`${pageNumber(l.pageIndex)} / ${number(l.totalPages)}`],['Bu ekranda yanıtlanan',number(l.answeredQuestionCount)],['Bu ekrandaki toplam soru',number(l.questionCount)],['Bu ekran tamamlandı',knownBoolean(l.completed)]];
    if (l.kind === 'break') fields = [['Seçilen mola',`${number(l.durationMinutes)} dk`],['Özet geçişi',`${number(l.intervalSeconds)} sn`],['Seçilen sayfalar',Array.isArray(l.selectedPages) ? l.selectedPages.map(p => p.title || p.id).join(' · ') : number(l.selectedCount)],['Geçen süre',preciseDuration(l.elapsedSeconds)],['Duraklatılan süre',preciseDuration(l.pausedSeconds)],['Bitiş',breakEndNames[l.endReason] || 'Henüz bitiş kaydı yok']];
    if (l.kind === 'dictionary') fields = [['Kelime',l.term],['Arama',l.mode === 'selection' ? 'Kelime seçerek' : 'Elle yazarak'],['Sonuç',l.outcome === 'found' ? 'Bulundu' : l.outcome === 'not_found' ? 'Bulunamadı' : 'Bağlantı / arama hatası'],['Kaynak',({local:'Ders sözlüğü',online:'Çevrimiçi sözlük',context:'Ders içeriği',none:'—'})[l.source] || 'Bilinmiyor']];
    fields = fields.filter(([,value]) => value !== undefined && value !== null && value !== '');
    return fields.length ? `<dl class="learning-event">${fields.map(([key,value]) => `<dt>${escape(key)}</dt><dd>${escape(value)}</dd>`).join('')}</dl>` : '';
  }
  let selectedTab = 'overview';
  let sequence = 0;
  let detailSequence = 0;
  let records = [];
  let ready = false;
  let debounce;
  let presenceTimer, presenceBusy = false, presenceSequence = 0;
  let logsSequence = 0, logsBusy = false, logPage = 0, logCursors = [''], nextCursor = null;
  let learningSequence = 0, detailStudent = '';
  let examViewsSequence = 0, examViewsData = null;
  function message(value) { $('dashboard-status').textContent = value; }
  function filters() {
    const from = $('filter-from').value, to = $('filter-to').value;
    if (from && to && from > to) throw new Error('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
    const params = new URLSearchParams();
    [['q',$('filter-search').value.trim()],['group',$('filter-group').value],['visit',$('filter-visit').value],['from',from],['to',to]].forEach(([key,value]) => {if(value) params.set(key,value);});
    return `?${params.toString()}`;
  }
  function selectTab(tab) {
    if (!['overview','students','learning','logs','settings','exam-views'].includes(tab)) return;
    const previousTab = selectedTab;
    selectedTab = tab;
    document.querySelectorAll('[data-admin-tab]').forEach(button => {if(button.dataset.adminTab === tab) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');});
    document.querySelectorAll('[data-admin-panel]').forEach(panel => panel.hidden = panel.dataset.adminPanel !== tab);
    $('shared-filters').hidden = tab === 'settings' || tab === 'exam-views';
    $('refresh-data').hidden = tab === 'settings';
    $('live-presence').hidden = tab === 'settings' || tab === 'learning' || tab === 'exam-views';
    if ($('filter-visit').parentElement) $('filter-visit').parentElement.hidden = tab === 'logs' || tab === 'learning';
    const titles = {overview:['Genel bakış','Kim katıldı, hangi dersler çalışıldı?'],students:['Öğrenciler','Girişleri, çalışmaları ve son etkinlikleri takip edin.'],learning:['Öğrenme analizi','Nerede zorlanıyor, nasıl ilerliyor, hangi desteği kullanıyor?'],logs:['Ayrıntılı kayıtlar','Yanıtlar, sonuçlar ve tekrar denemeleri.'],settings:['Ayarlar','Yönetici hesabınızı güvenle yönetin.'],'exam-views':['Sonuçlara erişim','Sınav sonuçları sayfasını açan ve henüz açmayan öğrenciler.']};
    $('dashboard-title').textContent = titles[tab][0]; $('dashboard-subtitle').textContent = titles[tab][1];
    if (tab === 'logs') loadLogs(true);
    else if (tab === 'learning') loadLearning();
    else if (tab === 'exam-views') loadExamViews();
    else if (tab !== previousTab && tab !== 'settings') load();
    schedulePresence();
  }
  function renderStats(stats) {
    const cards = [
      ['Toplam öğrenci',number(stats.total),'Seçili öğrenci listesi'],
      ['Giriş yapan',number(stats.visited),'Seçili dönem içinde'],
      ['Hiç giriş yapmayan',number(stats.never),'Tüm kayıt geçmişinde'],
      ['Bugün aktif',number(stats.activeToday),'İstanbul saatine göre'],
      ['Toplam giriş',number(stats.loginCount),'Seçili dönem içinde'],
      ['Aktif çalışma',duration(stats.activeSeconds),'Yaklaşık toplam süre'],
      ['Doğru yanıt',number(stats.correctCount),'Seçili dönemin soru kayıtları'],
      ['Yanlış yanıt',number(stats.incorrectCount),'Tekrar denemeleri dahil'],
      ['Boş yanıt',number(stats.blankCount),'Puanlanmayan yanıtlar hariç']
    ];
    $('stat-cards').innerHTML = cards.map(([label,value,note]) => `<article class="stat-card"><span class="stat-label">${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(note)}</small></article>`).join('');
  }
  function renderLessons(lessons) {
    $('lesson-table').innerHTML = lessons.length ? lessons.map(lesson => `<tr><td><strong>${escape(lesson.title || lesson.path || 'Ders')}</strong>${lesson.title && lesson.path ? `<small>${escape(lesson.path)}</small>` : ''}</td><td>${escape(number(lesson.visitors))}</td><td>${escape(number(lesson.eventCount))}</td><td>${escape(duration(lesson.activeSeconds))}</td></tr>`).join('') : '<tr><td colspan="4" class="table-empty">Bu filtrelerde henüz ders etkinliği bulunmuyor.</td></tr>';
  }
  function renderStudents(students) {
    records = students;
    renderLearningStudents(students);
    $('student-count').textContent = `${number(students.length)} öğrenci · ayrıntılar için “İncele”yi seçin.`;
    $('student-table').innerHTML = students.length ? students.map(student => {
      const visited = Boolean(student.everVisited); const disabled = student.enabled === false;
      const label = !visited ? 'Hiç giriş yapmadı' : student.periodVisited === false ? 'Dönemde giriş yok' : 'Giriş yaptı';
      return `<tr><td><strong>${escape(student.name)}</strong><small>${escape(student.group || 'Grupsuz')}${disabled ? ' · Erişim kapalı' : ''}</small></td><td>${student.online ? '<span class="state-pill online">● Aktif etkileşim</span><br>' : ''}<span class="state-pill ${!visited || student.periodVisited === false ? 'never' : ''}">${escape(label)}</span></td><td>${escape(datetime(student.firstLogin))}</td><td>${escape(datetime(student.lastLogin))}</td><td>${escape(number(student.loginCount))}</td><td>${escape(duration(student.activeSeconds))}</td><td>${escape(number(student.lessonCount))}</td><td><div class="row-actions"><button type="button" data-student-detail="${escape(student.id)}">İncele ↗</button><button type="button" data-student-toggle="${escape(student.id)}" aria-label="${escape(student.name)} için ${disabled ? 'erişimi aç' : 'erişimi kapat'}">${disabled ? 'Erişimi aç' : 'Erişimi kapat'}</button></div></td></tr>`;
    }).join('') : '<tr><td colspan="8" class="table-empty">Bu filtrelerle eşleşen öğrenci bulunmuyor.</td></tr>';
  }
  function renderGroups(groups) {
    const old = $('filter-group').value;
    $('filter-group').innerHTML = '<option value="">Tüm gruplar</option>' + groups.map(group => `<option value="${escape(group)}">${escape(group)}</option>`).join('');
    if (groups.includes(old)) $('filter-group').value = old;
  }
  const authorized = () => ready && access.session()?.role === 'admin';
  const learningStudents = new Map();
  function renderLearningStudents(students) {
    const selected = $('learning-student').value;
    for (const student of students) if (student.id) learningStudents.set(String(student.id),student);
    $('learning-student').innerHTML = '<option value="">Tüm öğrenciler</option>' + [...learningStudents.values()].sort((a,b) => String(a.name).localeCompare(String(b.name),'tr')).map(student => `<option value="${escape(student.id)}">${escape(student.name)}${student.group ? ` · ${escape(student.group)}` : ''}</option>`).join('');
    if (selected && !learningStudents.has(selected)) $('learning-student').innerHTML += `<option value="${escape(selected)}">Seçili öğrenci</option>`;
    $('learning-student').value = selected;
  }
  function schedulePresence() {
    clearTimeout(presenceTimer);
    if (authorized() && !document.hidden && selectedTab !== 'settings' && selectedTab !== 'exam-views') presenceTimer = setTimeout(async () => { await loadPresence(); schedulePresence(); },30000);
  }
  async function loadPresence() {
    if (!authorized() || document.hidden || selectedTab === 'settings' || selectedTab === 'exam-views' || presenceBusy) return;
    presenceBusy = true; const seq = ++presenceSequence;
    try {
      const data = await access.request('/api/admin/presence');
      if (seq !== presenceSequence || !authorized()) return;
      if (!Array.isArray(data?.online)) throw new Error('Aktif öğrenci yanıtı doğrulanamadı.');
      const sessions = [...(Array.isArray(data.sessions) ? data.sessions : Array.isArray(data.tabs) ? data.tabs : [])];
      const included = new Set(sessions.map(studentIdOf));
      for (const student of data.online) {
        const id = studentIdOf(student);
        if (!included.has(id)) { sessions.push({...student,legacy:true,status:'legacy'}); included.add(id); }
      }
      const activeIds = new Set(data.online.filter(student => !student.stale && (student.status || student.context?.status) === 'working').map(studentIdOf));
      $('online-count').textContent = number(activeIds.size);
      const tabCounts = new Map(), tabPositions = new Map();
      sessions.forEach(student => { const id = studentIdOf(student); tabCounts.set(id,(tabCounts.get(id) || 0) + 1); });
      const counts = {};
      $('presence-list').innerHTML = sessions.length ? sessions.map(student => {
        const id = studentIdOf(student), position = (tabPositions.get(id) || 0) + 1; tabPositions.set(id,position);
        const context = {...student,...student.context};
        const status = student.stale ? 'unknown' : student.status || context.status || 'unknown'; counts[status] = (counts[status] || 0) + 1;
        const screen = context.screenTitle || context.screenId || labelOf(student.activity), section = labelOf(context.section);
        const note = student.legacy ? 'Önceki takip sürümünden yakın zamanda sinyal alındı. Sekme, pencere odağı ve etkileşim ayrıntıları bilinmiyor.' : status === 'unknown' || status === 'stale' ? 'Son durum güncel olmayabilir. Bağlantı kesilmiş veya sekme kapanmış olabilir.' : status === 'left_open' ? '5 dk 30 sn boyunca etkileşim alınmadı. Okuma veya dinleme sürüyor olabilir.' : '';
        return `<article class="presence-card presence-${escape(status)}"><div class="presence-person"><strong>${escape(student.name)}</strong><small>${escape(student.group || 'Öğrenci')} · Takip kaydı ${number(position)}/${number(tabCounts.get(id))}</small></div>${stateBadge(status)}<p class="presence-lesson">${escape(lessonLabel({...student,context}))}</p>${screen ? `<p class="presence-screen">${escape(screen)}${section && section !== screen ? `<small>Alt bölüm: ${escape(section)}</small>` : ''}</p>` : ''}${contextDetails({...student,status,context:{...context,pageTitle:'',screenTitle:'',section:''}},false)}<small class="presence-signal">Son sinyal · ${escape(datetime(student.lastSeen))}</small>${note ? `<p class="presence-inference">${escape(note)}</p>` : ''}</article>`;
      }).join('') : '<p class="presence-empty">Henüz açık veya yakın zamanda sinyal alınan öğrenci sekmesi yok.</p>';
      const summary = [['working','Aktif'],['reading','Ön planda, etkileşim yok'],['background','Arka sekme'],['unfocused','Odak başka yerde'],['left_open','Açık bırakılmış olabilir'],['unknown','Sinyal yok'],['stale','Sinyal yok'],['leaving','Ayrıldı'],['legacy','Ayrıntı sınırlı']].filter(([key]) => counts[key]).map(([key,label]) => `<span>${escape(label)} <strong>${escape(number(counts[key]))}</strong></span>`).join('');
      $('presence-summary').innerHTML = `<span><strong>${escape(number(tabCounts.size))}</strong> öğrenci · <strong>${escape(number(sessions.length))}</strong> sayfa / sekme kaydı</span>${summary}`;
      $('presence-updated').textContent = 'Son kontrol · ' + datetime(data.asOf || new Date().toISOString());
      $('presence-status').textContent = '';
      if (records.length) renderStudents(records.map(student => ({...student,online:activeIds.has(String(student.id))})));
    } catch(error) { if (seq === presenceSequence && authorized()) { $('presence-status').textContent = 'Canlı takip güncellenemedi: ' + error.message; $('online-count').textContent = '—'; $('presence-list').replaceChildren(); $('presence-summary').replaceChildren(); } }
    finally { presenceBusy = false; }
  }
  function logFilters(includeCursor = true) {
    const params = new URLSearchParams(filters().slice(1)); params.delete('visit');
    [['eventType',$('filter-event-type').value],['outcome',$('filter-outcome').value]].forEach(([key,value]) => {if (value) params.set(key,value);});
    if (includeCursor) { params.set('limit','50'); if(logCursors[logPage]) params.set('cursor',logCursors[logPage]); }
    return '?' + params.toString();
  }
  function updateLogNavigation() {
    $('logs-previous').disabled = logsBusy || logPage === 0; $('logs-next').disabled = logsBusy || !nextCursor;
    $('logs-page').textContent = 'Sayfa ' + number(logPage + 1) + ' · sayfada en fazla 50 kayıt';
  }
  async function loadLogs(reset = false) {
    if (!authorized()) return;
    if (reset) {logPage = 0; logCursors = ['']; nextCursor = null;}
    const seq = ++logsSequence; let query;
    try {query = logFilters();} catch(error) {message(error.message); return;}
    logsBusy = true; updateLogNavigation(); message('Ayrıntılı kayıtlar yükleniyor…');
    try {
      const data = await access.request('/api/admin/logs' + query);
      if (seq !== logsSequence || !authorized()) return;
      if (!Array.isArray(data?.events)) throw new Error('Ayrıntılı kayıt yanıtı doğrulanamadı.');
      nextCursor = data.nextCursor == null ? null : String(data.nextCursor);
      $('log-table').innerHTML = data.events.length ? data.events.map(event => {
        const d = event.details || {};
        const offline = event.occurredAt && Math.abs(new Date(event.createdAt) - new Date(event.occurredAt)) > 120000;
        return `<tr><td><time>${escape(datetime(event.createdAt))}</time>${offline ? `<small>Cihaz: ${escape(datetime(event.occurredAt))}</small>` : ''}</td><td><strong>${escape(event.studentName)}</strong><small>${escape(event.group || '')}</small></td><td>${escape(lessonLabel(event))}<small>${escape(activityLabel(event))}</small>${contextDetails(event)}</td><td><strong>${escape(eventNames[event.type] || event.type)}</strong>${escape(d.prompt || d.questionId || '')}${learningDetails(event)}</td><td>${escape(answerText(d.selectedAnswer))}</td><td>${escape(answerText(d.correctAnswer))}</td><td>${outcomeBadge(d)}</td><td>${d.attempt ? escape(number(d.attempt)) : '—'}</td></tr>`;
      }).join('') : '<tr><td colspan="8" class="table-empty">Bu filtrelerle eşleşen etkinlik kaydı bulunmuyor.</td></tr>';
      message('');
    } catch(error) { if (seq === logsSequence && authorized()) {nextCursor = null; $('log-table').replaceChildren(); message(error.message);} }
    finally {if(seq === logsSequence) {logsBusy = false; updateLogNavigation();}}
  }
  const textCell = value => escape(value == null || value === '' ? '—' : value);
  const personCell = row => `<strong>${textCell(row.studentName)}</strong>${row.group ? `<small>${escape(row.group)}</small>` : ''}`;
  const pageCell = row => `${textCell(row.screenTitle || row.pageTitle || row.lessonTitle || row.lesson)}${row.screenId ? `<small>${escape(row.screenId)}</small>` : ''}${row.lesson ? pageDetails({pagePath:row.lesson}) : ''}`;
  function supportText(value) {
    if (!value || [value.helpUsed,value.hintUsed,value.answerRevealed].every(v => v == null)) return 'Yardım bilgisi yok';
    if (value.answerRevealed === true) return 'Yanıtı gördükten sonra';
    if (value.hintUsed === true) return 'İpucu kullanarak';
    return value.helpUsed === true ? 'Yardım kullanarak' : value.helpUsed === false ? 'Yardım kaydı yok' : 'Yardım bilgisi kısmi';
  }
  function reportTable(title,rows,headings,cells,note = '',open = false) {
    const entries = Array.isArray(rows) ? rows : [], cap = 200;
    return `<details class="learning-section"${open ? ' open' : ''}><summary><span>${escape(title)}</span><small>${escape(number(entries.length))} kayıt</small></summary>${note ? `<p class="learning-section-note">${escape(note)}</p>` : ''}${entries.length ? `<div class="table-scroll"><table><caption class="sr-only">${escape(title)}</caption><thead><tr>${headings.map(h => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${entries.slice(0,cap).map(row => `<tr>${cells(row).map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${entries.length > cap ? `<p class="learning-section-note">İlk ${cap} kayıt gösteriliyor. Öğrenci ve tarih filtreleriyle daraltabilirsiniz.</p>` : ''}` : '<p class="learning-empty">Seçili dönemde bu ayrıntıya ait kayıt yok.</p>'}</details>`;
  }
  function renderLearning(data) {
    const summary = data.summary || {}, firstGraded = Number(summary.firstAttemptGraded), firstCorrect = Number(summary.firstAttemptCorrect);
    const cards = [
      ['İlk denemede doğru',firstGraded > 0 ? `%${number(Math.round(firstCorrect / firstGraded * 100))}` : '—',`${number(summary.firstAttemptCorrect)} doğru / ${number(summary.firstAttemptGraded)} puanlanan ilk deneme`],
      ['Sonradan doğruya ulaştı',number(summary.improvedCount),'İlk yanlış / boş yanıttan doğruya'],
      ['Yardım kaydı olmadan doğru',number(summary.independentCorrect),'Bu sayfa açılışında gözlenen kayıtlarda'],
      ['Yardım sonrası doğru',number(summary.assistedCorrect),'İpucu, açıklama veya yanıt açılmış'],
      ['Soru / deneme',`${number(summary.questionCount)} / ${number(summary.attemptCount)}`,'Aynı sorunun tekrarları ayrı deneme'],
      ['Aktif çalışma',duration(summary.activeSeconds),'Ön plandaki yaklaşık çalışma']
    ];
    $('learning-summary').innerHTML = cards.map(([label,value,note]) => `<article class="stat-card"><span class="stat-label">${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(note)}</small></article>`).join('');
    if (Array.isArray(data.students)) renderLearningStudents(data.students);
    const sections = [
      reportTable('Sorular · ilk deneme, tekrar ve süre',data.questions,['Öğrenci','Soru / konu','İlk deneme','Son deneme','Süre / aktif süre','Destek ve gelişim'],row => {
        const first = row.firstAttempt, latest = row.latestAttempt;
        return [personCell(row),`<strong>${textCell(row.prompt || row.questionId)}</strong><small>${textCell(row.topicTitle || row.topicId)}</small>${row.lesson ? pageDetails({pagePath:row.lesson}) : ''}`,first ? `${outcomeBadge(first)}<small>${escape(supportText(first))}</small>` : '<span class="subtle">İlk deneme bilinmiyor</span>',latest ? `${outcomeBadge(latest)}<small>${escape(number(row.attemptCount))} deneme · ${escape(datetime(latest.occurredAt))}</small>` : '—',latest ? `${escape(preciseDuration(latest.wallSeconds))} / ${escape(preciseDuration(latest.activeSeconds))}<small>${latest.timingScope === 'question' ? 'Soru açılışından' : latest.timingScope === 'screen' ? 'Ekran açılışından' : 'Süre bilinmiyor'}</small>` : '—',`${escape(supportText(latest))}${row.improved === true ? '<small class="learning-positive">Yanlış / boş yanıttan doğruya geçti</small>' : ''}`];
      },'Süre son denemeye aittir. Ekran süresi, tek bir sorunun çözüm süresi değildir. Yardım açmamak öğrencinin başka bir kaynaktan yardım almadığını kanıtlamaz.',true),
      reportTable('Tekrarlanan yanlışlar · konuya göre',data.repeatedErrors,['Öğrenci','Konu','Yanlış / farklı soru','Yanlış yapılan sorular'],row => [personCell(row),textCell(row.topicTitle || row.topicId),`${escape(number(row.wrongCount))} yanlış · ${escape(number(row.questionCount))} soru`,Array.isArray(row.questions) ? row.questions.map(q => `<p>${textCell(q.prompt || q.questionId)} <small>${escape(number(q.count))} yanlış</small></p>`).join('') : '—'],'Aynı konu etiketindeki en az iki yanlış kaydı gruplanır. Bu, hata nedeninin otomatik teşhisi değildir.'),
      reportTable('Sayfalar · süre ve geri dönüşler',data.pages,['Öğrenci','Ders / ekran','Görüntüleme / aktif','Ziyaret / geri dönüş','İlk / son çalışma'],row => [personCell(row),pageCell(row),`${escape(preciseDuration(row.viewSeconds))} / ${escape(preciseDuration(row.activeSeconds))}`,`${escape(number(row.visitCount))} ziyaret · ${escape(number(row.returnCount ?? (row.visitCount == null ? null : Math.max(0,Number(row.visitCount) - 1))))} dönüş`,`${escape(datetime(row.firstSeen))}<small>${escape(datetime(row.lastSeen))}</small>`],'Görüntüleme süresi sayfanın ön planda kaldığı ölçülen süreyi, aktif süre etkileşim sinyallerini gösterir. Aynı ekrana yeni ziyaretler geri dönüş olarak sayılır.'),
      reportTable('Çalışma zaman çizelgesi',data.timeline,['Zaman','Öğrenci','İşlem','Ders / ekran ve ayrıntı'],row => [escape(datetime(row.occurredAt || row.createdAt)),personCell(row),`<strong>${textCell(eventNames[row.type] || row.type)}</strong>${row.details?.outcome ? outcomeBadge(row.details) : ''}`,`${escape(lessonLabel(row))}${row.context?.screenTitle ? `<small>${escape(row.context.screenTitle)}</small>` : ''}${row.context?.section ? `<small>${escape(row.context.section)}</small>` : ''}${learningDetails(row)}`],'Zaman çizelgesi cihazda gerçekleşme zamanına göre sıralanır. Çevrimdışı kayıtlar sunucuya daha sonra ulaşabilir.'),
      reportTable('Molalar · seçilen özetler ve gerçek süre',data.breaks,['Öğrenci','Ders','Plan / geçen süre','Seçilen özetler','Bitiş'],row => [personCell(row),pageCell(row),`${escape(number(row.durationMinutes))} dk / ${escape(preciseDuration(row.elapsedSeconds))}<small>${escape(preciseDuration(row.pausedSeconds))} duraklatıldı · ${escape(number(row.pauses))} duraklatma</small><small>Özet geçişi ${escape(number(row.intervalSeconds))} sn</small>`,Array.isArray(row.selectedPages) ? row.selectedPages.map(p => textCell(p.title || p.id)).join('<br>') : `${escape(number(row.selectedCount))} sayfa`,`${textCell(breakEndNames[row.endReason] || ({running:'Son kayıtta sürüyor',paused:'Son kayıtta duraklatılmış'})[row.status] || 'Bitiş kaydı yok')}<small>${escape(datetime(row.startedAt))}</small>`],'Bitiş kaydı yoksa molanın tamamlandığı varsayılmaz.'),
      reportTable('Sözlük · aranan ve tekrar bakılan kelimeler',data.dictionary,['Öğrenci','Kelime','Arama / sonuç','Son arama','Tekrar'],row => [personCell(row),`<strong>${textCell(row.term)}</strong>`,`${escape(number(row.count))} arama<small>${escape(number(row.outcomes?.found))} bulundu · ${escape(number(row.outcomes?.not_found))} bulunamadı · ${escape(number(row.outcomes?.error))} hata</small>`,escape(datetime(row.lastSeen)),`${escape(number(row.repeatDays))} farklı gün${Number(row.count) > 1 ? '<small>Tekrar arandı</small>' : ''}`],'Kelime aramaları gösterilir; bir kelimeye bakılması o kelimenin bilinmediğini kesinleştirmez.'),
      reportTable('Yardım · önce kendi başına denedi mi?',data.help,['Öğrenci','Yardım / konu','Toplam','Denemeden önce açtı','Denedikten sonra açtı','Bilinmiyor'],row => [personCell(row),`${textCell(helpNames[row.helpType] || row.helpType)}<small>${textCell(row.topicTitle || row.topicId)}</small><small>${textCell(row.questionId)}</small>`,escape(number(row.count)),escape(number(row.beforeAttempt)),escape(number(row.afterAttempt)),escape(number(row.unknownAttempt))],'“Bilinmiyor”, yardımın belirli bir soruyla ilişkilendirilemediğini veya eski kayıtta bu bilginin olmadığını belirtir.'),
      reportTable('Kaldığı yer · açılan, yanıtlanan, tamamlandı işaretlenen',data.progress,['Öğrenci','Ders / son ekran','Son sayfa','Açılan sayfa','Yanıtı puanlanan sayfa','Tamamlandı işaretlenen sayfa','Son ekranda yanıtlanan soru','Son ekran / tüm ders tamamlandı','Son ilerleme'],row => [personCell(row),pageCell({...row,screenTitle:row.lastScreenTitle,screenId:row.lastScreenId}),`${escape(pageNumber(row.lastPageIndex))} / ${escape(number(row.totalPages))}`,escape(number(row.viewedPages)),escape(number(row.answeredPages)),escape(number(row.completedPages)),`${escape(number(row.answeredQuestionCount))} / ${escape(number(row.questionCount))}`,`${escape(knownBoolean(row.currentPageCompleted))} / ${escape(knownBoolean(row.completed))}`,escape(datetime(row.lastSeen))],'Son sayfa, en son çalışılan ekrandır; tamamlanma oranı değildir. Açılan ve tamamlandı işaretlenen sayfalar ayrı sayılır. Yanıtı puanlanan sayfa, en az bir soruda doğru veya yanlış sonucu olan sayfadır; boş ve puanlanmamış yanıtlar bu sayıya katılmaz. Mola ve kaynak sayfaları bu sayılara katılmaz. Yanıtlanan soru sayıları son ekrana aittir.')
    ];
    $('learning-report').innerHTML = sections.join('');
    $('learning-coverage').textContent = [data.truncated?.events === true ? 'Rapor kayıt sınırına ulaştı. Tarih aralığını veya öğrenciyi daraltın.' : 'Seçili dönemin kayıtları.',data.truncated?.firstAttempts === true ? 'İlk deneme taraması kayıt sınırına ulaştı; bulunamayan ilk denemeler bilinmiyor olarak gösterilir.' : '',data.truncated?.timeline === true ? 'Zaman çizelgesinde son 300 etkinlik yer alır.' : '',Number(summary.unknownAssistanceCorrect) > 0 ? `${number(summary.unknownAssistanceCorrect)} doğru soruda yardım bilgisi bilinmiyor.` : '', 'Yardım sınıfları bu sayfa açılışında gözlenen kayıtlara dayanır. Geçmişte açılmış veya yerel kayıttan geri yüklenmiş yanıtlar her zaman saptanamaz; yardım kaydı olmaması bağımsız çözümün kanıtı değildir. Aynı soru farklı denemelerde iki doğru grubuna da girebilir. Ayrıntılar için bir başlığı açın.'].filter(Boolean).join(' ');
    $('learning-updated').textContent = 'Son analiz · ' + datetime(data.asOf || new Date().toISOString());
  }
  function renderExamViews() {
    if (!examViewsData || !authorized()) return;
    const query = $('exam-views-search').value.trim().toLocaleLowerCase('tr-TR');
    const group = $('exam-views-group').value, status = $('exam-views-filter').value;
    const students = examViewsData.students.filter(student => (!query || String(student.name).toLocaleLowerCase('tr-TR').includes(query)) && (!group || student.group === group) && (status === 'viewed' ? student.hasViewed : status === 'not-viewed' ? !student.hasViewed : true));
    const stats = examViewsData.stats;
    const cards = [['Toplam öğrenci',stats.total],['Baktı · sayfayı açtı',stats.viewed],['Henüz bakmadı',stats.notViewed]];
    $('exam-views-summary').innerHTML = cards.map(([label,value]) => `<article class="stat-card"><span class="stat-label">${escape(label)}</span><strong>${escape(number(value))}</strong><small>Tüm aktif öğrenciler</small></article>`).join('');
    $('exam-views-count').textContent = `${number(students.length)} / ${number(stats.total)} öğrenci gösteriliyor.`;
    $('exam-views-table').innerHTML = students.length ? students.map(student => `<tr><td><strong>${escape(student.name)}</strong></td><td>${escape(student.group || 'Grupsuz')}</td><td><span class="state-pill ${student.hasViewed ? '' : 'never'}">${student.hasViewed ? 'Baktı · sayfayı açtı' : 'Henüz bakmadı'}</span></td><td>${escape(datetime(student.firstViewedAt))}</td><td>${escape(datetime(student.lastViewedAt))}</td><td>${escape(number(student.viewCount))}</td></tr>`).join('') : `<tr><td colspan="6" class="table-empty">${stats.total ? 'Bu filtrelerle eşleşen öğrenci bulunmuyor.' : 'Henüz aktif öğrenci bulunmuyor.'}</td></tr>`;
  }
  async function loadExamViews() {
    if (!authorized() || selectedTab !== 'exam-views') return;
    const seq = ++examViewsSequence;
    examViewsData = null;
    $('exam-views-summary').replaceChildren(); $('exam-views-count').textContent = ''; $('exam-views-updated').textContent = '';
    $('exam-views-table').innerHTML = '<tr><td colspan="6" class="table-empty">Açılış kayıtları yükleniyor…</td></tr>';
    $('exam-views-status').textContent = 'Açılış kayıtları yükleniyor…'; $('refresh-data').disabled = true; message('');
    try {
      const data = await access.request('/api/admin/exam-result-views');
      if (seq !== examViewsSequence || !authorized() || selectedTab !== 'exam-views') return;
      if (!Array.isArray(data?.students) || !data?.stats || !data.students.every(student => student && typeof student.hasViewed === 'boolean' && Number.isInteger(student.viewCount) && student.viewCount >= 0) || data.stats.total !== data.students.length || data.stats.viewed !== data.students.filter(student => student.hasViewed).length || data.stats.notViewed !== data.stats.total - data.stats.viewed) throw new Error('Sınav sonuçları açılış yanıtı doğrulanamadı.');
      examViewsData = data;
      const selectedGroup = $('exam-views-group').value;
      const groups = [...new Set(data.students.map(student => student.group).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b),'tr'));
      $('exam-views-group').innerHTML = '<option value="">Tüm gruplar</option>' + groups.map(group => `<option value="${escape(group)}">${escape(group)}</option>`).join('');
      $('exam-views-group').value = groups.includes(selectedGroup) ? selectedGroup : '';
      renderExamViews(); $('exam-views-status').textContent = '';
      $('exam-views-updated').textContent = 'Güncellendi · ' + datetime(new Date().toISOString());
    } catch (error) {
      if (seq === examViewsSequence && authorized() && selectedTab === 'exam-views') {
        $('exam-views-table').replaceChildren();
        $('exam-views-status').textContent = error.message + ' Yenile düğmesiyle tekrar deneyebilirsiniz.';
      }
    } finally { if (seq === examViewsSequence) $('refresh-data').disabled = false; }
  }
  async function loadLearning() {
    if (!authorized()) return;
    const seq = ++learningSequence;
    $('learning-summary').replaceChildren(); $('learning-report').replaceChildren(); $('learning-coverage').textContent = ''; $('learning-updated').textContent = '';
    $('learning-status').textContent = 'Öğrenme kayıtları inceleniyor…';
    try {
      const params = new URLSearchParams(filters().slice(1)); params.delete('visit');
      if ($('learning-student').value) params.set('student',$('learning-student').value);
      const data = await access.request('/api/admin/learning?' + params.toString());
      if (seq !== learningSequence || !authorized()) return;
      if (!data?.summary || !Array.isArray(data.questions) || !Array.isArray(data.pages)) throw new Error('Öğrenme analizi yanıtı doğrulanamadı.');
      renderLearning(data); $('learning-status').textContent = ''; message('');
    } catch (error) { if (seq === learningSequence && authorized()) $('learning-status').textContent = error.message; }
  }
  async function refreshAll() { if (selectedTab === 'exam-views') return loadExamViews(); await Promise.all([load(),loadPresence(),selectedTab === 'logs' ? loadLogs(true) : selectedTab === 'learning' ? loadLearning() : Promise.resolve()]); schedulePresence(); }
  function filtersChanged() { if (selectedTab === 'exam-views') return; if (selectedTab === 'logs') return loadLogs(true); if (selectedTab === 'learning') return loadLearning(); return load(); }
  async function load() {
    if (!ready) return;
    const seq = ++sequence;
    let query;
    try { query = filters(); } catch (error) {$('refresh-data').disabled=false; message(error.message); return;}
    $('refresh-data').disabled = true; message('Kayıtlar yükleniyor…');
    try {
      const data = await access.request('/api/admin/overview' + query);
      if (seq !== sequence || !authorized()) return;
      if (!data || !data.stats || !Array.isArray(data.students) || !Array.isArray(data.lessons)) throw new Error('Kayıt yanıtı doğrulanamadı. Lütfen hizmet kurulumunu kontrol edin.');
      renderStats(data.stats); renderLessons(data.lessons); renderStudents(data.students); renderGroups(Array.isArray(data.groups) ? data.groups : []);
      $('updated-at').textContent = 'Güncellendi · ' + new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(new Date());
      message('');
    } catch (error) { if(seq === sequence && authorized()) message(error.message + (records.length ? ' Son alınan kayıtlar gösteriliyor.' : '')); }
    finally { if(seq === sequence) $('refresh-data').disabled = false; }
  }
  async function showDetail(id) {
    const student = records.find(value => String(value.id) === id);
    if (!student) return;
    detailStudent = id;
    const seq = ++detailSequence;
    $('detail-title').textContent = student.name; $('detail-group').textContent = student.group || 'Öğrenci'; $('detail-summary').textContent = ''; $('detail-events').replaceChildren(); $('detail-status').textContent = 'Etkinlik kayıtları yükleniyor…';
    if (!$('student-detail').open) $('student-detail').showModal();
    try {
      const data = await access.request(`/api/admin/students/${encodeURIComponent(id)}` + filters());
      if (seq !== detailSequence || !$('student-detail').open || !authorized()) return;
      if(!data || !Array.isArray(data.events)) throw new Error('Etkinlik yanıtı doğrulanamadı.');
      const metrics = data.metrics || {};
      $('detail-summary').textContent = [metrics.loginCount != null ? `${number(metrics.loginCount)} giriş` : '',metrics.lessonCount != null ? `${number(metrics.lessonCount)} ders` : '',metrics.activeSeconds != null ? `${duration(metrics.activeSeconds)} aktif çalışma` : '',metrics.correctCount != null ? `${number(metrics.correctCount)} doğru` : '',metrics.incorrectCount != null ? `${number(metrics.incorrectCount)} yanlış` : '',metrics.blankCount != null ? `${number(metrics.blankCount)} boş` : '', 'Seçili dönem · Son 200 etkinlik'].filter(Boolean).join(' · ');
      $('detail-status').textContent = '';
      $('detail-events').innerHTML = data.events.length ? `<ol class="event-list">${data.events.map(event => {
        const lesson = lessonLabel(event);
        const activity = activityLabel(event);
        return `<li><time>${escape(datetime(event.createdAt))}</time><div><strong>${escape(eventNames[event.type] || event.type || 'Etkinlik')}</strong>${lesson ? `<small>${escape(lesson)}</small>` : ''}${activity ? `<small>Etkinlik: ${escape(activity)}</small>` : ''}${Number(event.activeSeconds) > 0 ? `<small>${escape(duration(event.activeSeconds))} aktif çalışma</small>` : ''}${contextDetails(event)}${questionDetails(event)}${learningDetails(event)}</div></li>`;
      }).join('')}</ol>` : '<div class="empty-state">Seçili dönemde bu öğrenci için etkinlik kaydı bulunmuyor.</div>';
    } catch(error) {if(seq === detailSequence) $('detail-status').textContent = error.message;}
  }
  document.querySelectorAll('[data-admin-tab]').forEach(button => button.addEventListener('click',() => selectTab(button.dataset.adminTab)));
  $('refresh-data').addEventListener('click',refreshAll);
  ['filter-group','filter-visit','filter-from','filter-to'].forEach(id => $(id).addEventListener('change',filtersChanged));
  ['filter-event-type','filter-outcome'].forEach(id => $(id).addEventListener('change',() => loadLogs(true)));
  $('filter-search').addEventListener('input',() => {clearTimeout(debounce); debounce = setTimeout(filtersChanged,300);});
  $('clear-filters').addEventListener('click',() => {['filter-search','filter-group','filter-from','filter-to','filter-event-type','filter-outcome','learning-student'].forEach(id => $(id).value=''); $('filter-visit').value='all'; filtersChanged();});
  $('learning-student').addEventListener('change',loadLearning);
  $('exam-views-search').addEventListener('input',renderExamViews);
  ['exam-views-group','exam-views-filter'].forEach(id => $(id).addEventListener('change',renderExamViews));
  $('exam-views-clear').addEventListener('click',() => {$('exam-views-search').value=''; $('exam-views-group').value=''; $('exam-views-filter').value='all'; renderExamViews();});
  $('logs-next').addEventListener('click',() => { if (logsBusy || !nextCursor) return; logCursors[++logPage] = nextCursor; loadLogs(); });
  $('logs-previous').addEventListener('click',() => { if (logsBusy || logPage < 1) return; --logPage; loadLogs(); });
  document.addEventListener('visibilitychange',() => {clearTimeout(presenceTimer); if (!document.hidden && authorized()) {loadPresence(); schedulePresence();}});
  $('student-table').addEventListener('click',async event => {
    const detail = event.target.closest('[data-student-detail]'); if(detail) {showDetail(detail.dataset.studentDetail); return;}
    const button = event.target.closest('[data-student-toggle]'); if(!button) return;
    const student = records.find(value => String(value.id) === button.dataset.studentToggle); if(!student) return;
    button.disabled = true;
    try {await access.request(`/api/admin/students/${encodeURIComponent(student.id)}`,{method:'POST',body:{enabled:student.enabled === false}}); await load();}
    catch(error) {message(error.message); button.disabled=false;}
  });
  $('close-detail').addEventListener('click',() => {++detailSequence; $('student-detail').close();});
  $('student-detail').addEventListener('close',() => {++detailSequence;});
  $('detail-learning').addEventListener('click',() => {if (!authorized() || !detailStudent) return; $('learning-student').value=detailStudent; ++detailSequence; $('student-detail').close(); selectTab('learning');});
  async function exportCsv(buttonId, endpoint, filename, query) {
    const button = $(buttonId); if (!authorized()) return; button.disabled=true;
    try {
      const csv = await access.request(endpoint + query());
      if (!authorized()) return;
      if(typeof csv !== 'string') throw new Error('CSV dosyası oluşturulamadı.');
      const blob = new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
    } catch(error) {if(authorized()) message(error.message);} finally {button.disabled=false;}
  }
  $('export-csv').addEventListener('click',() => exportCsv('export-csv','/api/admin/export.csv','english-ogrenci-katilimi.csv',filters));
  $('export-logs-csv').addEventListener('click',() => exportCsv('export-logs-csv','/api/admin/logs.csv','english-ayrintili-kayitlar.csv',() => logFilters(false)));
  $('change-password').addEventListener('submit',async event => {
    event.preventDefault(); const current = $('current-password'), next = $('new-password'), repeat = $('repeat-password'), status = $('password-status'); status.classList.remove('is-success');
    if(!current.value) {status.textContent='Mevcut şifrenizi yazın.'; current.focus(); return;}
    if(next.value.length < 12) {status.textContent='Yeni şifreniz en az 12 karakter olmalıdır.'; next.focus(); return;}
    if(next.value !== repeat.value) {status.textContent='Yeni şifreler birbiriyle aynı değil.'; repeat.focus(); return;}
    if(next.value === current.value) {status.textContent='Mevcut şifrenizden farklı bir şifre seçin.'; next.focus(); return;}
    const button = event.target.querySelector('[type=submit]'); button.disabled=true; status.textContent='Şifre güncelleniyor…';
    try {await access.request('/api/admin/password',{method:'POST',body:{currentPassword:current.value,newPassword:next.value}}); event.target.reset(); status.classList.add('is-success'); status.textContent='Yönetici şifreniz güncellendi.';}
    catch(error) {status.textContent=error.message; current.value=''; next.value=''; repeat.value='';}
    finally {button.disabled=false;}
  });
  function clearPrivateData() {
    ready=false; ++sequence; ++detailSequence; ++presenceSequence; ++logsSequence; ++learningSequence; ++examViewsSequence; records=[]; examViewsData=null; detailStudent=''; learningStudents.clear(); clearTimeout(presenceTimer); clearTimeout(debounce); logsBusy=false; logPage=0; logCursors=['']; nextCursor=null;
    ['student-table','lesson-table','stat-cards','detail-events','presence-list','presence-summary','log-table','learning-summary','learning-report','learning-student','exam-views-summary','exam-views-table','exam-views-group'].forEach(id => $(id).replaceChildren());
    ['detail-title','detail-group','detail-summary','detail-status','student-count','online-count','presence-updated','presence-status','updated-at','dashboard-status','logs-page','learning-status','learning-updated','learning-coverage','exam-views-count','exam-views-status','exam-views-updated'].forEach(id => $(id).textContent='');
    $('exam-views-search').value=''; $('exam-views-group').value=''; $('exam-views-filter').value='all'; $('refresh-data').disabled=false;
    $('filter-search').value=''; $('logs-next').disabled=true; $('logs-previous').disabled=true;
    if($('student-detail').open) $('student-detail').close();
  }
  window.addEventListener('english:session-expired',clearPrivateData);
  window.addEventListener('english:logout',clearPrivateData);
  access.ready.then(session => {if(session?.role !== 'admin') return; ready=true; selectTab('overview'); refreshAll();});
})();
