/* Lesson activity metadata and explicit assessment results. Never record typed notes, raw keys or pointer coordinates. */
(() => {
  'use strict';
  if (window.__englishActivityTracker) return;
  window.__englishActivityTracker = true;

  const MAX_QUEUE = 300;
  const BATCH_SIZE = 10;
  const IDLE_AFTER_MS = 60_000;
  const LEFT_OPEN_AFTER_MS = 330_000;
  const SEND_EVERY_MS = 30_000;
  const EVENT_TYPES = new Set(['page_view','lesson_open','activity_view','answer_check','answer_reveal','activity_complete','vocabulary_reveal','heartbeat','question_result','audio_play','audio_complete','tab_visible','tab_hidden','window_focus','window_blur','idle_start','abandoned','resumed','page_leave','question_open','help_used','page_summary','lesson_progress','break_start','break_pause','break_resume','break_end','dictionary_lookup']);
  const INTERACTIONS = new Set(['pointer','keyboard','scroll','touch','navigation','none']);
  const STATUSES = new Set(['working','reading','background','unfocused','left_open','leaving']);
  const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
  let userId = null, queueKey = '', queue = [];
  let running = false, sending = false, stopped = false, leaving = false;
  let lastInput = performance.now(), lastTick = lastInput, lastInteractionAt = null, lastInteraction = 'none';
  let lastGesture = -Infinity, lastMotion = -Infinity, activeMilliseconds = 0, lastWorkingSample = null;
  let idleAnnounced = false, abandonedAnnounced = false;
  let visible = document.visibilityState === 'visible', focused = hasFocus();
  let lastActivity = '', lastScreen = null;
  let sampleTimer, sendTimer, navigationTimer;
  let presenceSending = false, presencePending = false, lastPresence = -Infinity, lastPresenceState = '', presenceSequence = 0;
  let totalActiveMilliseconds = 0, learningStateKey = '', learned = Object.create(null), pageVisit = null;
  const openQuestions = new Map(), questionTopics = new Map(), helpDedup = new Map();
  const listeners = [];

  function hasFocus() { try { return typeof document.hasFocus === 'function' ? document.hasFocus() : true; } catch (_) { return false; } }
  function query(selector) { try { return document.querySelector(selector); } catch (_) { return null; } }
  function all(selector) { try { return Array.from(document.querySelectorAll?.(selector) || []); } catch (_) { return []; } }
  function cleanLabel(value, max = 180) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
  function staticText(node) {
    if (!node || /^(INPUT|TEXTAREA)$/.test(node.tagName || '') || node.isContentEditable) return '';
    return cleanLabel(node.textContent || '');
  }
  function safePagePath(value) {
    if (typeof value !== 'string' || value.includes('..') || /[?#%]/.test(value)) return null;
    const match = value.match(/(?:^|\/)(lessons\/(?:a1|a2|b1|yds)\/[a-zA-Z0-9_./~-]+\.html?)$/);
    if (match) return match[1].slice(0, 240);
    return /(?:^|\/)(?:index\.html)?$/.test(value) || value === 'panel' ? 'index.html' : null;
  }
  const pagePath = safePagePath(location.pathname) || 'panel';
  const lesson = pagePath.startsWith('lessons/') ? pagePath : 'panel';
  // Capture only the document's static title, never student inputs or a whole rendered page.
  const pageTitle = cleanLabel(document.title || (lesson === 'panel' ? 'Ders paneli' : 'İngilizce dersi'));

  function selectedOption(select) {
    if (!select) return null;
    return Array.from(select.options || select.selectedOptions || []).find(option => String(option.value) === String(select.value)) || null;
  }
  function screenContext() {
    const sectionTab = query('[role="tab"][aria-selected="true"],.tab-btn.active[data-tab],.tab.active[data-tab]');
    const internalTab = staticText(sectionTab);
    const heading = query('#main .screen-head h1,#main .b-title-row h1,#main .activity-head h1,#workspace .page-head h1,#workspace h1,#main h1');
    const jump = document.getElementById('screen-select') || document.getElementById('board-jump');
    const option = selectedOption(jump);
    if (jump && /^-?\d{1,5}$/.test(String(jump.value)) && Number(jump.value) >= -1 && option) {
      const screenId = `${jump.id === 'board-jump' ? 'board' : 'screen'}-${jump.value}`;
      const nav = query('#lesson-nav .nav-btn.active[data-i],#lesson-nav .nav-item.active[data-go]');
      const group = nav?.getAttribute('data-go');
      const prefix = group && /^[a-zA-Z0-9_-]{1,40}$/.test(group) ? `${group}:` : '';
      return { screenId: `${prefix}${screenId}`, screenTitle: staticText(heading) || staticText(option), section: internalTab || staticText(option) };
    }
    if (lesson.startsWith('lessons/yds/')) {
      // Only the studio's fixed routes and rendered unit/section controls may identify a view.
      const parts = location.hash.slice(1).split('/');
      const route = /^(home|unit|bank|reading|vocab|mistakes|plan|source|test|breakreview)$/.test(parts[0]) ? parts[0] : 'home';
      const unit = /^u(?:0[1-9]|1[0-2])$/.test(parts[1] || '') && all('#unit-nav a').some(link => link.getAttribute('data-unit') === parts[1]) ? parts[1] : '';
      const sectionSelect = document.getElementById('section-select');
      const sectionOption = selectedOption(sectionSelect);
      const topic = sectionOption && /^u\d{2}-s\d{2}$/.test(String(sectionSelect.value)) ? sectionSelect.value : '';
      const nav = query('#sidebar [data-nav].active');
      return { screenId: [route,unit,topic].filter(Boolean).join(':'), screenTitle: staticText(heading) || staticText(nav) || 'YDS', section: internalTab || staticText(sectionOption) || staticText(nav) || route };
    }
    const nav = query('#lesson-nav .nav-item.active[data-go],#lesson-nav [aria-current="page"],#lesson-nav .nav-btn.active[data-i]');
    const navId = nav?.getAttribute('data-go') || nav?.getAttribute('data-i');
    if (navId && /^[a-zA-Z0-9_-]{1,96}$/.test(navId)) return { screenId: navId, screenTitle: staticText(heading) || staticText(nav), section: internalTab || staticText(nav) };
    const level = lesson === 'panel' && /^#(?:A1|A2|B1|YDS)$/.test(location.hash) ? location.hash.slice(1) : '';
    return { screenId: level ? `level-${level}` : 'home', screenTitle: staticText(heading) || pageTitle, section: internalTab || level || 'home' };
  }
  function activityAnchor() { return screenContext().screenId; }
  function eventId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  const tabId = eventId(); // A fresh page instance, not a browser/device identifier.
  function idleMilliseconds() { return Math.max(0, performance.now() - lastInput); }
  function status() {
    if (leaving) return 'leaving';
    if (idleMilliseconds() >= LEFT_OPEN_AFTER_MS) return 'left_open';
    if (!visible) return 'background';
    if (!focused) return 'unfocused';
    return idleMilliseconds() >= IDLE_AFTER_MS ? 'reading' : 'working';
  }
  function trackingContext(screen = screenContext(), interaction = lastInteraction) {
    return { tabId, pagePath, pageTitle, screenId: screen.screenId, screenTitle: screen.screenTitle, section: screen.section,
      visibility: visible ? 'visible' : 'hidden', focused, idleSeconds: Math.min(86400, Math.floor(idleMilliseconds() / 1000)),
      lastInteractionAt, interaction, status: status() };
  }
  function validClientTime(value) {
    if (typeof value !== 'string' || value.length > 35 || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
    const stamp = Date.parse(value);
    return Number.isFinite(stamp) && stamp >= Date.now() - 30*86400000 && stamp <= Date.now() + 300000;
  }
  function cleanContext(value) {
    if (!value || !UUID.test(value.tabId || '') || safePagePath(value.pagePath) === null
      || !['visible','hidden'].includes(value.visibility) || typeof value.focused !== 'boolean'
      || !Number.isInteger(value.idleSeconds) || value.idleSeconds < 0 || value.idleSeconds > 86400
      || !INTERACTIONS.has(value.interaction) || !STATUSES.has(value.status)
      || !(value.lastInteractionAt === null || validClientTime(value.lastInteractionAt))) return null;
    for (const [key,max] of Object.entries({pageTitle:180,screenId:120,screenTitle:180,section:180})) {
      if (typeof value[key] !== 'string' || value[key].length > max || /[\u0000-\u001f\u007f<>]/.test(value[key])) return null;
    }
    if (!/^[a-zA-Z0-9_:-]{1,120}$/.test(value.screenId)) return null;
    return {tabId:value.tabId,pagePath:safePagePath(value.pagePath),pageTitle:value.pageTitle,screenId:value.screenId,screenTitle:value.screenTitle,section:value.section,visibility:value.visibility,focused:value.focused,idleSeconds:value.idleSeconds,lastInteractionAt:value.lastInteractionAt,interaction:value.interaction,status:value.status};
  }
  function cleanQuestion(value) {
    if (!value || !['correct','incorrect','blank','ungraded'].includes(value.outcome)) return null;
    const result = {outcome:value.outcome};
    for (const [key,max] of Object.entries({questionId:160,prompt:1600,selectedAnswer:1200,correctAnswer:1200,assessmentKind:64})) {
      if (typeof value[key] !== 'string' || value[key].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value[key])) return null;
      result[key] = value[key];
    }
    if (!result.questionId || !result.prompt || !/^[a-z-]{2,64}$/.test(result.assessmentKind)) return null;
    return result;
  }
  const PAGE_KINDS = new Set(['lesson','break','resource','overview']);
  function learningLabel(value,max) { return typeof value === 'string' && value.length<=max && !/[\u0000-\u001f\u007f<>]/.test(value) ? value : null; }
  function boundedInteger(value,max,min=0) { return Number.isInteger(value) && value>=min && value<=max; }
  function cleanLearning(value,type) {
    if (!value || typeof value!=='object' || Array.isArray(value)) return null;
    const text=(key,max,nullable=false) => nullable&&value[key]===null ? null : learningLabel(value[key],max);
    const topic=() => text('topicId',120)!==null && text('topicTitle',180)!==null;
    if (value.kind==='question' && ['question_open','question_result'].includes(type)) {
      const prompt=value.prompt===undefined?'':text('prompt',1500);
      if (!text('questionId',160) || !topic() || !['question','screen','unavailable'].includes(value.timingScope)
        || prompt===null || ![null,true,false].includes(value.helpUsed) || ![null,true,false].includes(value.hintUsed) || ![null,true,false].includes(value.answerRevealed)) return null;
      if (value.wallSeconds===null ? value.activeSeconds!==null : !boundedInteger(value.wallSeconds,86400)||!boundedInteger(value.activeSeconds,value.wallSeconds)) return null;
      if (value.timingScope==='unavailable' && (value.wallSeconds!==null||value.activeSeconds!==null)) return null;
      return {kind:'question',questionId:value.questionId,prompt,topicId:value.topicId,topicTitle:value.topicTitle,wallSeconds:value.wallSeconds,activeSeconds:value.activeSeconds,timingScope:value.timingScope,helpUsed:value.helpUsed,hintUsed:value.hintUsed,answerRevealed:value.answerRevealed};
    }
    if (value.kind==='help' && type==='help_used') {
      if (!['translation','hint','answer','audio'].includes(value.helpType) || !(value.questionId===null||text('questionId',160)) || ![null,true,false].includes(value.attemptedBeforeHelp)||!topic()) return null;
      return {kind:'help',helpType:value.helpType,questionId:value.questionId,attemptedBeforeHelp:value.attemptedBeforeHelp,topicId:value.topicId,topicTitle:value.topicTitle};
    }
    if (value.kind==='page' && type==='page_summary') {
      if (!UUID.test(value.visitId||'') || !PAGE_KINDS.has(value.pageKind)||!boundedInteger(value.pageIndex,2000,-1)||!boundedInteger(value.totalPages,2000)||!boundedInteger(value.viewSeconds,3600)||!boundedInteger(value.activeSeconds,value.viewSeconds)) return null;
      return {kind:'page',visitId:value.visitId,pageKind:value.pageKind,pageIndex:value.pageIndex,totalPages:value.totalPages,viewSeconds:value.viewSeconds,activeSeconds:value.activeSeconds};
    }
    if (value.kind==='progress' && type==='lesson_progress') {
      if (!PAGE_KINDS.has(value.pageKind)||!boundedInteger(value.pageIndex,2000,-1)||!boundedInteger(value.totalPages,2000)||!(value.questionCount===null||boundedInteger(value.questionCount,2000))||!boundedInteger(value.answeredQuestionCount,2000)||typeof value.completed!=='boolean') return null;
      return {kind:'progress',pageKind:value.pageKind,pageIndex:value.pageIndex,totalPages:value.totalPages,questionCount:value.questionCount,answeredQuestionCount:value.answeredQuestionCount,completed:value.completed};
    }
    if (value.kind==='break' && ['break_start','break_pause','break_resume','break_end'].includes(type)) {
      if (!UUID.test(value.breakId||'')||![10,15].includes(value.durationMinutes)||![10,15,20,30].includes(value.intervalSeconds)||!Array.isArray(value.selectedPages)||value.selectedPages.length>500||!boundedInteger(value.selectedCount,2000)||value.selectedCount<value.selectedPages.length||!boundedInteger(value.elapsedSeconds,900)||!boundedInteger(value.pausedSeconds,86400)||![null,'elapsed','early','closed','navigation'].includes(value.endReason)) return null;
      const selectedPages=[];
      for (const item of value.selectedPages) { if (!item||!learningLabel(item.id,160)||learningLabel(item.title,180)===null) return null; selectedPages.push({id:item.id,title:item.title}); }
      return {kind:'break',breakId:value.breakId,durationMinutes:value.durationMinutes,intervalSeconds:value.intervalSeconds,selectedPages,selectedCount:value.selectedCount,elapsedSeconds:value.elapsedSeconds,pausedSeconds:value.pausedSeconds,endReason:value.endReason};
    }
    if (value.kind==='dictionary' && type==='dictionary_lookup') {
      if (!text('term',80)||!['selection','manual'].includes(value.mode)||!['found','not_found','error'].includes(value.outcome)||!['local','online','context','none'].includes(value.source)) return null;
      return {kind:'dictionary',term:value.term,mode:value.mode,outcome:value.outcome,source:value.source};
    }
    return null;
  }
  function persistLearning() {
    if (!learningStateKey) return;
    try { localStorage.setItem(learningStateKey,JSON.stringify(learned)); } catch (_) {}
  }
  function restoreLearning() {
    learned=Object.create(null);
    try {
      const stored=JSON.parse(localStorage.getItem(learningStateKey)||'{}');
      if (stored&&typeof stored==='object'&&!Array.isArray(stored)) for (const [id,state] of Object.entries(stored).slice(-2000)) {
        if (!learningLabel(id,160)||!state||typeof state!=='object') continue;
        learned[id]={attempted:state.attempted===true,help:state.help===true,hint:state.hint===true,answer:state.answer===true};
      }
    } catch (_) {}
  }
  function questionState(id) {
    if (!Object.prototype.hasOwnProperty.call(learned,id)) {
      if (Object.keys(learned).length>=2000) delete learned[Object.keys(learned)[0]];
      Object.defineProperty(learned,id,{value:{attempted:false,help:false,hint:false,answer:false},enumerable:true,writable:true,configurable:true});
    }
    return learned[id];
  }
  function pageMetadata(screen=screenContext()) {
    try {
      const snapshot=window.EnglishLessonProgress?.snapshot?.();
      if(snapshot&&PAGE_KINDS.has(snapshot.pageKind)&&boundedInteger(snapshot.pageIndex,2000,-1)&&boundedInteger(snapshot.totalPages,2000)
        &&(snapshot.questionCount===null||boundedInteger(snapshot.questionCount,2000))) return {pageKind:snapshot.pageKind,pageIndex:snapshot.pageIndex,totalPages:snapshot.totalPages,questionCount:snapshot.questionCount,completed:snapshot.completed===true};
    } catch (_) {}
    const label=`${screen.screenTitle} ${screen.section}`;
    const pageKind=/\b(?:mola|break)\b/i.test(label)||screen.screenId==='breakreview'?'break':['home','screen--1'].includes(screen.screenId)?'overview':/^(source|vocab)(:|$)/.test(screen.screenId)?'resource':'lesson';
    return {pageKind,pageIndex:-1,totalPages:0,questionCount:null,completed:false};
  }
  function beginPage(screen=screenContext()) {
    pageVisit={id:eventId(),screen:{...screen},metadata:pageMetadata(screen),fingerprint:JSON.stringify(screen),started:performance.now(),sliceAt:performance.now(),sliceActive:totalActiveMilliseconds,activeAt:totalActiveMilliseconds,questions:new Set(),answered:new Set(),completed:false};
    openQuestions.clear();
  }
  function ensureLearningPage() {
    if (!running||stopped) return;
    const screen=screenContext();
    if (!pageVisit) beginPage(screen);
    else if (pageVisit.fingerprint!==JSON.stringify(screen)) { recordPage(); beginPage(screen); }
  }
  function recordProgress() {
    if (!pageVisit||!running||stopped) return;
    const {pageKind,pageIndex,totalPages,questionCount,completed}=pageVisit.metadata;
    addEvent('lesson_progress',0,pageVisit.screen.screenId,undefined,trackingContext(pageVisit.screen),undefined,{kind:'progress',pageKind,pageIndex,totalPages,questionCount,answeredQuestionCount:Math.min(2000,pageVisit.answered.size),completed:pageVisit.completed||completed||questionCount!==null&&questionCount>0&&pageVisit.answered.size>=questionCount});
  }
  function recordPage() {
    if (!pageVisit||!running||stopped) return;
    const now=performance.now(),viewSeconds=Math.min(3600,Math.max(0,Math.floor((now-pageVisit.sliceAt)/1000)));
    const activeSeconds=Math.min(viewSeconds,Math.max(0,Math.floor((totalActiveMilliseconds-pageVisit.sliceActive)/1000)));
    const {pageKind,pageIndex,totalPages}=pageVisit.metadata;
    addEvent('page_summary',0,pageVisit.screen.screenId,undefined,trackingContext(pageVisit.screen),undefined,{kind:'page',visitId:pageVisit.id,pageKind,pageIndex,totalPages,viewSeconds,activeSeconds});
    pageVisit.sliceAt+=viewSeconds*1000;
    if (now-pageVisit.sliceAt>=3600000) pageVisit.sliceAt=now;
    pageVisit.sliceActive+=activeSeconds*1000;
    recordProgress();
  }
  function topicFor(id) {
    const explicit=questionTopics.get(id), screen=pageVisit?.screen||screenContext();
    return explicit||{id:screen.screenId,title:screen.screenTitle||screen.section||pageTitle};
  }
  function questionLearning(id,scope='question',fallbackPrompt='') {
    const opened=openQuestions.get(id),saved=questionState(id),topic=topicFor(id);
    const start=opened?.started??pageVisit?.started,activeAt=opened?.activeAt??pageVisit?.activeAt;
    const available=Number.isFinite(start)&&Number.isFinite(activeAt);
    const wallSeconds=available?Math.min(86400,Math.max(0,Math.floor((performance.now()-start)/1000))):null;
    const activeSeconds=available?Math.min(wallSeconds,Math.max(0,Math.floor((totalActiveMilliseconds-activeAt)/1000))):null;
    const covered=!!opened;
    return {kind:'question',questionId:id,prompt:opened?.prompt||cleanLabel(fallbackPrompt,1500),topicId:topic.id,topicTitle:topic.title,wallSeconds,activeSeconds,timingScope:available?(covered?scope:'screen'):'unavailable',helpUsed:covered||saved.help?saved.help:null,hintUsed:covered||saved.hint?saved.hint:null,answerRevealed:covered||saved.answer?saved.answer:null};
  }
  function openQuestion(value) {
    if (!running||stopped||!value||!learningLabel(value.questionId,160)||!value.questionId) return;
    sampleTime(); ensureLearningPage();
    const id=value.questionId;
    if (value.topic) setQuestionTopic(id,value.topic);
    pageVisit.questions.add(id);
    if (questionState(id).attempted) pageVisit.answered.add(id);
    if (openQuestions.has(id)) return;
    openQuestions.set(id,{started:performance.now(),activeAt:totalActiveMilliseconds,prompt:cleanLabel(value.prompt,1500)});
    addEvent('question_open',0,activityAnchor(),undefined,trackingContext(),undefined,questionLearning(id));
  }
  function setQuestionTopic(id,value) {
    if (!learningLabel(id,160)||!value||!learningLabel(value.id,120)||learningLabel(value.title,180)===null) return false;
    questionTopics.set(id,{id:value.id,title:value.title}); return true;
  }
  function assessQuestion(value) {
    if (!running||stopped||String(window.EnglishAccess?.session()?.student?.id)!==userId||!value||!learningLabel(value.questionId,160)) return null;
    sampleTime(); ensureLearningPage();
    const id=value.questionId,learning=questionLearning(id,'question',value.prompt),saved=questionState(id);
    if (value.outcome!=='blank'&&value.outcome!=='ungraded') { saved.attempted=true;pageVisit.answered.add(id); }
    persistLearning();
    // The next checked revision is timed from the previous explicit assessment.
    if (openQuestions.has(id)) openQuestions.set(id,{...openQuestions.get(id),started:performance.now(),activeAt:totalActiveMilliseconds});
    return learning;
  }
  function recordHelp(id,kind) {
    if (!running||stopped||!['translation','hint','answer','audio'].includes(kind)) return;
    sampleTime();ensureLearningPage();
    const questionId=id&&learningLabel(id,160)?id:null;
    const dedupKey=`${pageVisit.id}:${questionId||'*'}:${kind}`;
    if (performance.now()-(helpDedup.get(dedupKey)??-Infinity)<250) return;
    helpDedup.set(dedupKey,performance.now());
    if (helpDedup.size>1000) helpDedup.delete(helpDedup.keys().next().value);
    const ids=questionId?[questionId]:Array.from(openQuestions.keys());
    const attemptedBeforeHelp=questionId?questionState(questionId).attempted:ids.length?ids.every(key=>questionState(key).attempted):null;
    for (const key of ids) { const saved=questionState(key);saved.help=true;if(kind==='hint')saved.hint=true;if(kind==='answer')saved.answer=true; }
    persistLearning();
    const subject=topicFor(questionId);
    addEvent('help_used',0,activityAnchor(),undefined,trackingContext(),undefined,{kind:'help',helpType:kind,questionId,attemptedBeforeHelp,topicId:subject.id,topicTitle:subject.title});
  }
  window.EnglishLearning=Object.freeze({assess:assessQuestion,topic:setQuestionTopic});
  async function presence(forceState, force = false) {
    if (!running || stopped || navigator.onLine === false) return;
    const state = forceState || (leaving || !visible ? 'hidden' : !focused || idleMilliseconds() >= IDLE_AFTER_MS ? 'idle' : 'active');
    const context = trackingContext();
    const stateKey = `${state}:${context.status}:${context.screenId}:${visible}:${focused}`;
    if (!force && stateKey === lastPresenceState && performance.now() - lastPresence < 25000) return;
    // A final pagehide snapshot must not wait behind a slow in-flight heartbeat.
    const finalSnapshot = presenceSending && leaving;
    if (presenceSending && !finalSnapshot) { presencePending = true; return; }
    const current = window.EnglishAccess?.session();
    if (String(current?.student?.id) !== userId) return;
    const owner = userId;
    if (!finalSnapshot) presenceSending = true;
    try {
      await window.EnglishAccess.request('/api/presence', {method:'POST',body:{state,lesson,activity:context.screenId,context,sequence:++presenceSequence},keepalive:state === 'hidden'});
      if (running && !stopped && userId === owner) { lastPresence = performance.now(); lastPresenceState = stateKey; }
    } catch (_) {} finally {
      if (!finalSnapshot) presenceSending = false;
      if (!finalSnapshot && presencePending && !stopped) { presencePending = false; void presence(undefined,true); }
    }
  }
  function persist() { if (queueKey) try { localStorage.setItem(queueKey,JSON.stringify(queue)); } catch (_) {} }
  function loadQueue() {
    try {
      const stored = JSON.parse(localStorage.getItem(queueKey) || '[]');
      if (!Array.isArray(stored)) return [];
      const accepted = [];
      for (const event of stored.slice(-MAX_QUEUE)) {
        if (!event || !EVENT_TYPES.has(event.type) || !UUID.test(event.eventId || '')
          || !(event.lesson === 'panel' || event.lesson === safePagePath(event.lesson) && event.lesson.startsWith('lessons/'))
          || typeof event.activity !== 'string' || !/^[a-zA-Z0-9_:-]{1,120}$/.test(event.activity)
          || !Number.isInteger(event.activeSeconds) || event.activeSeconds < 0 || event.activeSeconds > 30
          || !validClientTime(event.occurredAt)) continue;
        const details = event.type === 'question_result' ? cleanQuestion(event.details) : null;
        if (event.type === 'question_result' && !details) continue;
        const hasContext = Object.prototype.hasOwnProperty.call(event,'context');
        const context = hasContext ? cleanContext(event.context) : null;
        // Corrupt context must never turn a contextual heartbeat into legacy active-time credit.
        if (hasContext && (!context || (event.lesson === 'panel'
          ? !['panel','index.html'].includes(context.pagePath) : context.pagePath !== event.lesson))) continue;
        const hasLearning=Object.prototype.hasOwnProperty.call(event,'learning'),learning=hasLearning?cleanLearning(event.learning,event.type):null;
        if (hasLearning&&!learning) continue;
        if (['question_open','help_used','page_summary','lesson_progress','break_start','break_pause','break_resume','break_end','dictionary_lookup'].includes(event.type)&&!learning) continue;
        accepted.push({eventId:event.eventId,type:event.type,lesson:event.lesson,activity:event.activity,
          activeSeconds:event.activeSeconds,occurredAt:event.occurredAt,...(context?{context}:{}),...(details?{details}:{}),...(learning?{learning}:{})});
      }
      return accepted;
    } catch (_) { return []; }
  }
  function addEvent(type,activeSeconds=0,activity=activityAnchor(),details,context=trackingContext(),occurredAt=new Date().toISOString(),learning) {
    if (!running || stopped || !EVENT_TYPES.has(type)) return;
    if (String(window.EnglishAccess?.session()?.student?.id) !== userId) { stop(); return; }
    const clean=learning?cleanLearning(learning,type):null;
    if (learning&&!clean) return;
    queue.push({eventId:eventId(),type,lesson,activity,activeSeconds:Math.max(0,Math.min(30,Math.floor(activeSeconds))),occurredAt,context,...(details?{details}:{}),...(clean?{learning:clean}:{})});
    if (queue.length > MAX_QUEUE) queue.splice(0,queue.length-MAX_QUEUE);
    persist();
  }
  async function flush() {
    if (!running || stopped || sending || !queue.length || navigator.onLine === false) return;
    const current = window.EnglishAccess?.session();
    if (!current?.student || String(current.student.id) !== userId) return;
    const owner=userId, batch=[];
    let bytes=14;
    for(const item of queue.slice(0,BATCH_SIZE)) {
      // Count UTF-8 bytes; 500 selected break pages can exceed the normal small event size.
      const serialized=JSON.stringify(item);
      const size=typeof TextEncoder==='function'?new TextEncoder().encode(serialized).length:serialized.length*3;
      if(batch.length&&bytes+size>200*1024) break;
      if(bytes+size>240*1024) {queue=queue.filter(event=>event.eventId!==item.eventId);persist();continue;}
      batch.push(item);bytes+=size+1;
    }
    if(!batch.length) return;
    sending=true; let successful=false;
    try {
      await window.EnglishAccess.request('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({events:batch}),keepalive:leaving||!visible});
      if (!running || stopped || owner !== userId) return;
      const accepted = new Set(batch.map(event => event.eventId));
      queue=queue.filter(event => !accepted.has(event.eventId)); persist(); successful=true;
    } catch (error) { if (error?.status === 401 || error?.statusCode === 401) stop(); }
    finally { sending=false; if (successful && queue.length && !stopped) void flush(); }
  }
  function sampleTime() {
    const now=performance.now(), elapsed=now-lastTick;
    // Use the previous visibility/focus slice. Timer suspension never earns an unattended block.
    if (running && !stopped && visible && focused && !leaving && elapsed > 0 && elapsed <= 5000) {
      const earned = Math.max(0,Math.min(now,lastInput+IDLE_AFTER_MS)-lastTick);
      activeMilliseconds += earned;
      totalActiveMilliseconds += earned;
      // Retain the real earlier working observation: at the idle boundary the live context is already reading.
      if (earned > 0 && status() === 'working') lastWorkingSample = {
        context:trackingContext(lastScreen||screenContext()),occurredAt:new Date().toISOString()
      };
    }
    lastTick=now;
  }
  function recordTime() {
    sampleTime();
    const seconds=Math.min(30,Math.floor(activeMilliseconds/1000));
    if (seconds>0 && lastWorkingSample) {
      activeMilliseconds-=seconds*1000;
      const sample = lastWorkingSample;
      addEvent('heartbeat',seconds,sample.context.screenId,undefined,sample.context,sample.occurredAt);
    }
    if (activeMilliseconds>30000) activeMilliseconds=0;
  }
  function checkThresholds() {
    if (!running || stopped || leaving) return;
    const idle=idleMilliseconds();
    let changed=false;
    if (idle>=IDLE_AFTER_MS && !idleAnnounced) { idleAnnounced=true; addEvent('idle_start'); changed=true; }
    if (idle>=LEFT_OPEN_AFTER_MS && !abandonedAnnounced) { abandonedAnnounced=true; addEvent('abandoned'); changed=true; }
    if (changed) { void presence(undefined,true); void flush(); }
  }
  function onUserInput(event={}) {
    if (!running || stopped || event.isTrusted === false) return;
    const kind=event.type || 'pointerdown', now=performance.now();
    if ((kind === 'pointermove' || kind === 'scroll') && now-lastMotion < 1000) return;
    // Programmatic scrolling/navigation cannot resume a forgotten tab. Scroll needs a recent real gesture.
    if (kind === 'scroll' && now-lastGesture > 1500) return;
    if (kind === 'pointermove' || kind === 'scroll') lastMotion=now;
    if (kind !== 'scroll') lastGesture=now;
    sampleTime(); checkThresholds();
    const resumed=idleAnnounced||abandonedAnnounced;
    lastInput=now; lastInteractionAt=new Date().toISOString();
    lastInteraction=kind.startsWith('key')?'keyboard':kind.startsWith('touch')?'touch':kind==='scroll'||kind==='wheel'?'scroll':'pointer';
    idleAnnounced=false; abandonedAnnounced=false;
    if (resumed) { addEvent('resumed'); void flush(); }
    void presence(undefined,resumed);
  }
  function checkNavigation() {
    if (!running || stopped) return;
    const next=screenContext(), fingerprint=JSON.stringify(next);
    if (fingerprint !== JSON.stringify(lastScreen)) {
      recordTime(); ensureLearningPage(); lastScreen=next; lastActivity=next.screenId;
      addEvent('activity_view',0,lastActivity,undefined,trackingContext(next,'navigation'));
      void presence(undefined,true);
    }
  }
  function onClick(event) {
    if (!running || stopped || !(event.target instanceof Element)) return;
    const target = event.target.closest('button,[data-word],[data-complete],[data-reveal]');
    if (!target || target.disabled) return;
    const action = target.getAttribute('data-action');
    const boardAction = target.getAttribute('data-board-action');
    const label=staticText(target);
    if(target.hasAttribute('data-hint')||action==='hint') recordScopedHelp(target,'hint');
    else if(target.hasAttribute('data-translation')||target.hasAttribute('data-translate')||action==='translate'||/^(?:türkçe|çeviri|translation|translate)(?:\s|$)/i.test(label)) recordScopedHelp(target,'translation');
    if (target.hasAttribute('data-check') || target.hasAttribute('data-checkmarks')
      || ['check', 'find-check', 'placement-submit'].includes(action)) {
      addEvent('answer_check');
    } else if (target.hasAttribute('data-complete')) {
      // This event means the student used the completion control, not an assessed score.
      addEvent('activity_complete');
      ensureLearningPage(); if(pageVisit) {pageVisit.completed=true;recordProgress();}
    } else if (target.hasAttribute('data-word') || target.hasAttribute('data-mean')
      || target.id === 'v-all' || target.getAttribute('data-vocab-action') === 'all') {
      const card = target.closest('.word-card,.flashcard,.vcard');
      const allOpen = document.querySelector('.vlist.all');
      if (!card?.classList.contains('open') && !allOpen) {addEvent('vocabulary_reveal');recordScopedHelp(target,'translation');}
    } else if (target.id === 'board-reveal' || boardAction === 'reveal') {
      if (document.querySelector('[data-b-answer][hidden]')) {addEvent('answer_reveal');recordScopedHelp(target,'answer');}
    } else if (target.id === 'ans-btn') {
      if (target.getAttribute('aria-pressed') !== 'true') {addEvent('answer_reveal');recordScopedHelp(target,'answer');}
    } else if (target.hasAttribute('data-reveal') || target.hasAttribute('data-peek')
      || target.hasAttribute('data-show') || target.hasAttribute('data-solve') || target.hasAttribute('data-showmarks')
      || ['story-reveal', 'story-answers', 'teacher-model', 'mission'].includes(action)) {
      const host = target.closest('[data-host],.q-item,.flip-card');
      if (target.getAttribute('aria-pressed') !== 'true' && !host?.classList.contains('open') && !host?.classList.contains('peek')) {
        addEvent('answer_reveal'); recordScopedHelp(target,'answer');
      }
    }
  }
  function recordScopedHelp(target,kind) {
    const host=target.closest?.('[data-learning-question],[data-learning-questions],[data-question]');
    let ids=[];
    const one=host?.getAttribute?.('data-learning-question')||host?.getAttribute?.('data-question');
    if(one&&learningLabel(one,160)) ids=[one];
    else {try {const many=JSON.parse(host?.getAttribute?.('data-learning-questions')||'null');if(Array.isArray(many))ids=many.filter(id=>learningLabel(id,160)&&id).slice(0,2000);}catch(_) {}}
    const record=()=>{if(ids.length)for(const id of ids)recordHelp(id,kind);else recordHelp(null,kind);};
    // A reveal control can grade an answer selected earlier in this same native click.
    // Record the reveal after that grade; only subsequent attempts used the revealed answer.
    if(kind==='answer') void Promise.resolve().then(record);
    else record();
  }

  function onVocabularyKey(event) {
    if (!running || stopped || event.code !== 'Space' || !(event.target instanceof Element)) return;
    // Custom flash cards handle Space directly rather than generating a native button click.
    const card = event.target.closest('.flashcard[data-word]');
    if (card && !event.target.closest('input,textarea,select,button') && !card.classList.contains('open')) {
      addEvent('vocabulary_reveal'); recordScopedHelp(card,'translation');
    }
  }


  function onVisibilityChange() {
    if (!running || stopped) return;
    sampleTime(); recordTime();
    visible=document.visibilityState === 'visible'; focused=hasFocus(); lastTick=performance.now();
    if (visible) leaving=false;
    addEvent(visible?'tab_visible':'tab_hidden'); checkNavigation(); checkThresholds();
    void presence(undefined,true); void flush();
  }
  function onFocusChange(event) {
    if (!running || stopped) return;
    sampleTime(); recordTime();
    focused=event.type === 'focus'; lastTick=performance.now();
    addEvent(focused?'window_focus':'window_blur'); checkThresholds();
    void presence(undefined,true); void flush();
  }
  function listen(target,kind,callback,options) {
    target.addEventListener(kind,callback,options); listeners.push(() => target.removeEventListener?.(kind,callback,options));
  }
  function stop() {
    if (!running || stopped) return;
    if (String(window.EnglishAccess?.session()?.student?.id) === userId) {recordTime();recordPage();persistLearning();}
    persist(); stopped=true; running=false; presencePending=false;
    clearInterval(sampleTimer); clearInterval(sendTimer); clearInterval(navigationTimer);
    for (const remove of listeners.splice(0)) remove();
  }
  async function start() {
    const access=window.EnglishAccess;
    if (!access?.ready) return;
    try {
      const session=await access.ready;
      if (!session?.student?.id || session.role === 'admin' || String(access.session()?.student?.id) !== String(session.student.id)) return;
      userId=String(session.student.id); queueKey=`en-access-events:${userId}`; queue=loadQueue();
      learningStateKey=`en-learning-state:${encodeURIComponent(userId)}:${lesson}`;restoreLearning();
      running=true; lastInput=performance.now(); lastTick=lastInput;
      visible=document.visibilityState === 'visible'; focused=hasFocus();
      lastScreen=screenContext(); lastActivity=lastScreen.screenId;
      beginPage(lastScreen);
      addEvent('page_view'); if (lesson!=='panel') addEvent('lesson_open'); addEvent('activity_view',0,lastActivity);
      for (const kind of ['pointerdown','pointermove','keydown','touchstart','touchmove','wheel','scroll'])
        listen(document,kind,onUserInput,{capture:true,passive:true});
      listen(document,'click',onClick,true);
      listen(document,'keydown',onVocabularyKey,true);
      listen(document,'visibilitychange',onVisibilityChange);
      listen(window,'focus',onFocusChange); listen(window,'blur',onFocusChange);
      listen(window,'english:question-open',event => openQuestion(event.detail));
      listen(window,'english:assessment-help',event => recordHelp(event.detail?.questionId,event.detail?.helpType));
      listen(window,'english:question-result',event => { const result=cleanQuestion(event.detail); if (result) { const learning=cleanLearning(event.detail?.learning,'question_result')||assessQuestion(result);addEvent('question_result',0,activityAnchor(),result,trackingContext(),undefined,learning);recordProgress();void flush(); } });
      listen(window,'english:learning-event',event => {const type=event.detail?.type,learning=cleanLearning(event.detail?.learning,type);if(learning){addEvent(type,0,activityAnchor(),undefined,trackingContext(),undefined,learning);void flush();}});
      listen(document,'play',event => { if (event.target?.tagName==='AUDIO') { addEvent('audio_play');recordHelp(null,'audio');void flush(); } },true);
      listen(document,'ended',event => { if (event.target?.tagName==='AUDIO') { addEvent('audio_complete'); void flush(); } },true);
      listen(window,'hashchange',checkNavigation); listen(window,'popstate',checkNavigation);
      listen(window,'online',() => { void presence(undefined,true); void flush(); });
      listen(window,'pagehide',() => {
        recordTime();recordPage();leaving=true;addEvent('page_leave');persist();void presence('hidden',true);void flush();
      });
      listen(window,'pageshow',() => {
        if (!leaving) return;
        leaving=false; visible=document.visibilityState==='visible'; focused=hasFocus(); lastTick=performance.now();
        beginPage(screenContext());
        addEvent(visible?'tab_visible':'tab_hidden'); checkNavigation(); checkThresholds(); void presence(undefined,true); void flush();
      });
      listen(window,'english:logout',stop);
      sampleTimer=setInterval(() => { sampleTime(); checkThresholds(); },1000);
      navigationTimer=setInterval(checkNavigation,500);
      sendTimer=setInterval(() => {recordTime();ensureLearningPage();recordPage();void presence();void flush();},SEND_EVERY_MS);
      for(const question of window.EnglishAssessment?.opened?.()||[]) openQuestion(question);
      void flush(); void presence(undefined,true);
    } catch (_) { /* Tracking must never interrupt a lesson or sign-in. */ }
  }
  void start();
})();
