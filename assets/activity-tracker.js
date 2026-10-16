/* Explicit lesson assessment results and activity metadata; no unrelated notes or password fields. */
(() => {
  'use strict';
  if (window.__englishActivityTracker) return;
  window.__englishActivityTracker = true;

  const MAX_QUEUE = 300;
  const BATCH_SIZE = 10;
  const IDLE_AFTER_MS = 60_000;
  const SEND_EVERY_MS = 30_000;
  const EVENT_TYPES = new Set(['page_view', 'lesson_open', 'activity_view', 'answer_check', 'answer_reveal', 'activity_complete', 'vocabulary_reveal', 'heartbeat','question_result','audio_play','audio_complete']);
  let userId = null;
  let queueKey = '';
  let queue = [];
  let running = false;
  let sending = false;
  let stopped = false;
  let lastInput = performance.now();
  let lastTick = lastInput;
  let activeMilliseconds = 0;
  let lastActivity = '';
  let sampleTimer;
  let sendTimer;
  let navigationTimer;
  let presenceSending=false,presencePending=false,lastPresence=0,lastPresenceState='',leaving=false;
  function cleanQuestion(value) {
    if(!value||!['correct','incorrect','blank','ungraded'].includes(value.outcome))return null;
    const result={outcome:value.outcome};
    for(const [key,max] of Object.entries({questionId:160,prompt:1600,selectedAnswer:1200,correctAnswer:1200,assessmentKind:64})){
      if(typeof value[key]!=='string'||value[key].length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value[key]))return null;
      result[key]=value[key];
    }
    if(!result.questionId||!result.prompt||!/^[a-z-]{2,64}$/.test(result.assessmentKind))return null;
    return result;
  }
  async function presence(forceState,force=false) {
    if(!running||stopped||navigator.onLine===false)return;
    const state=forceState||(leaving||document.visibilityState!=='visible'?'hidden':performance.now()-lastInput>=IDLE_AFTER_MS?'idle':'active');
    if(!force&&state===lastPresenceState&&performance.now()-lastPresence<25000)return;
    if(presenceSending){presencePending=true;return;}
    const current=window.EnglishAccess?.session();if(String(current?.student?.id)!==userId)return;
    presenceSending=true;
    try{await window.EnglishAccess.request('/api/presence',{method:'POST',body:{state,lesson,activity:activityAnchor()},keepalive:state==='hidden'});lastPresence=performance.now();lastPresenceState=state;}catch{}finally{presenceSending=false;if(presencePending&&!stopped){presencePending=false;void presence(undefined,true);}}
  }

  // The path is limited to site lessons; queries, origins and names never enter a payload.
  function lessonPath() {
    const match = location.pathname.match(/(?:^|\/)(lessons\/(?:a1|a2|b1|yds)\/[a-zA-Z0-9_./%~-]+\.html?)$/);
    if (!match || match[1].includes('..')) return 'panel';
    return match[1].slice(0, 240);
  }
  const lesson = lessonPath();

  function activityAnchor() {
    // Reject arbitrary query-like fragments and encoded text; keep only normal section IDs.
    const hash = location.hash.slice(1);
    const anchor = /^[a-zA-Z0-9_-]{1,96}$/.test(hash) ? hash : 'home';
    const board = document.getElementById('board-jump');
    const screen = board && /^\d{1,5}$/.test(board.value) ? `:screen-${board.value}` : '';
    return `${anchor}${screen}`.slice(0, 120);
  }

  function eventId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function persist() {
    if (!queueKey) return;
    try { localStorage.setItem(queueKey, JSON.stringify(queue)); } catch (_) { /* Tracking must not interrupt a lesson. */ }
  }

  function loadQueue() {
    try {
      const stored = JSON.parse(localStorage.getItem(queueKey) || '[]');
      if (!Array.isArray(stored)) return [];
      // Whitelist fields on replay as well; local storage is untrusted input.
      return stored.slice(-MAX_QUEUE).filter((event) => event && EVENT_TYPES.has(event.type)
        && /^[a-f\d-]{36}$/i.test(event.eventId)
        && (event.lesson === 'panel' || /^lessons\/(?:a1|a2|b1|yds)\/[a-zA-Z0-9_./%~-]+\.html?$/.test(event.lesson))
        && !event.lesson.includes('..')
        && typeof event.activity === 'string' && /^[a-zA-Z0-9_:-]{1,120}$/.test(event.activity)
        && Number.isInteger(event.activeSeconds) && event.activeSeconds >= 0 && event.activeSeconds <= 30)
        .filter(event=>event.type!=='question_result'||cleanQuestion(event.details))
        .map(({ eventId, type, lesson, activity, activeSeconds,occurredAt,details }) => ({ eventId, type, lesson, activity, activeSeconds,...(typeof occurredAt==='string'&&Number.isFinite(Date.parse(occurredAt))&&Date.now()-Date.parse(occurredAt)<30*86400000&&Date.parse(occurredAt)<=Date.now()+300000?{occurredAt}:{}),...(type==='question_result'?{details:cleanQuestion(details)}:{}) }));
    } catch (_) { return []; }
  }

  function addEvent(type, activeSeconds = 0, activity = activityAnchor(),details) {
    if (!running || stopped || !EVENT_TYPES.has(type)) return;
    queue.push({ eventId: eventId(), type, lesson, activity, activeSeconds: Math.max(0, Math.min(30, Math.floor(activeSeconds))),occurredAt:new Date().toISOString(),...(details?{details}:{}) });
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    persist();
  }

  async function flush() {
    if (!running || stopped || sending || !queue.length || navigator.onLine === false) return;
    const current = window.EnglishAccess?.session();
    if (!current?.student || String(current.student.id) !== userId) return;
    const owner = userId;
    const batch = queue.slice(0, BATCH_SIZE);
    sending = true;
    let successful=false;
    try {
      await window.EnglishAccess.request('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: batch }) });
      // An old response must never mutate a different student's queue after logout/login.
      if (!running || stopped || owner !== userId) return;
      const accepted = new Set(batch.map((event) => event.eventId));
      queue = queue.filter((event) => !accepted.has(event.eventId));
      persist();
      successful=true;
    } catch (error) {
      if (error?.status === 401 || error?.statusCode === 401) stop();
      // Network failures retain the same event IDs for idempotent replay.
    } finally { sending = false;if(successful&&queue.length&&!stopped)void flush(); }
  }

  function sampleTime() {
    const now = performance.now();
    const elapsed = now - lastTick;
    const eligibleUntil = lastInput + IDLE_AFTER_MS;
    if (running && !stopped && document.visibilityState === 'visible' && elapsed > 0 && elapsed <= 5_000) {
      activeMilliseconds += Math.max(0, Math.min(now, eligibleUntil) - lastTick);
    }
    lastTick = now;
  }

  function recordTime() {
    sampleTime();
    const seconds = Math.min(30, Math.floor(activeMilliseconds / 1000));
    if (seconds > 0) {
      activeMilliseconds -= seconds * 1000;
      addEvent('heartbeat', seconds, lastActivity || activityAnchor());
    }
    // A browser suspension never awards a large block of unattended time.
    if (activeMilliseconds > 30_000) activeMilliseconds = 0;
  }

  function onUserInput() {
    sampleTime();
    lastInput = performance.now();
    void presence();
  }

  function checkNavigation() {
    if (!running || stopped || document.visibilityState !== 'visible') return;
    const next = activityAnchor();
    if (next !== lastActivity) {
      recordTime();
      lastActivity = next;
      addEvent('activity_view', 0, next);
      void presence();
    }
  }

  function onClick(event) {
    if (!running || stopped || !(event.target instanceof Element)) return;
    const target = event.target.closest('button,[data-word],[data-complete],[data-reveal]');
    if (!target || target.disabled) return;
    const action = target.getAttribute('data-action');
    const boardAction = target.getAttribute('data-board-action');
    if (target.hasAttribute('data-check') || target.hasAttribute('data-checkmarks')
      || ['check', 'find-check', 'placement-submit'].includes(action)) {
      addEvent('answer_check');
    } else if (target.hasAttribute('data-complete')) {
      // This event means the student used the completion control, not an assessed score.
      addEvent('activity_complete');
    } else if (target.hasAttribute('data-word') || target.hasAttribute('data-mean')
      || target.id === 'v-all' || target.getAttribute('data-vocab-action') === 'all') {
      const card = target.closest('.word-card,.flashcard,.vcard');
      const allOpen = document.querySelector('.vlist.all');
      if (!card?.classList.contains('open') && !allOpen) addEvent('vocabulary_reveal');
    } else if (target.id === 'board-reveal' || boardAction === 'reveal') {
      if (document.querySelector('[data-b-answer][hidden]')) addEvent('answer_reveal');
    } else if (target.id === 'ans-btn') {
      if (target.getAttribute('aria-pressed') !== 'true') addEvent('answer_reveal');
    } else if (target.hasAttribute('data-reveal') || target.hasAttribute('data-peek')
      || target.hasAttribute('data-show') || target.hasAttribute('data-solve') || target.hasAttribute('data-showmarks')
      || ['story-reveal', 'story-answers', 'teacher-model', 'mission'].includes(action)) {
      const host = target.closest('[data-host],.q-item,.flip-card');
      if (target.getAttribute('aria-pressed') !== 'true' && !host?.classList.contains('open') && !host?.classList.contains('peek')) {
        addEvent('answer_reveal');
      }
    }
  }

  function onVocabularyKey(event) {
    if (!running || stopped || event.code !== 'Space' || !(event.target instanceof Element)) return;
    // Custom flash cards handle Space directly rather than generating a native button click.
    const card = event.target.closest('.flashcard[data-word]');
    if (card && !event.target.closest('input,textarea,select,button') && !card.classList.contains('open')) {
      addEvent('vocabulary_reveal');
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      // visibilitychange runs after visibilityState changes, so account for the last visible slice explicitly.
      const now = performance.now();
      const elapsed = now - lastTick;
      if (elapsed > 0 && elapsed <= 5_000) activeMilliseconds += Math.max(0, Math.min(now, lastInput + IDLE_AFTER_MS) - lastTick);
      lastTick = now;
      recordTime();
      void flush();
      void presence('hidden',true);
    } else {
      leaving=false;
      lastTick = performance.now();
      checkNavigation();
      void presence(undefined,true);
    }
  }

  function stop() {
    if (!running || stopped) return;
    recordTime();
    persist();
    stopped = true;
    running = false;
    clearInterval(sampleTimer);
    clearInterval(sendTimer);
    clearInterval(navigationTimer);
  }

  async function start() {
    const access = window.EnglishAccess;
    if (!access?.ready) return;
    try {
      const session = await access.ready;
      if (!session?.student?.id || session.role === 'admin') return;
      userId = String(session.student.id);
      queueKey = `en-access-events:${userId}`;
      queue = loadQueue();
      running = true;
      lastInput = performance.now();
      lastTick = lastInput;
      lastActivity = activityAnchor();
      addEvent('page_view');
      if (lesson !== 'panel') addEvent('lesson_open');
      addEvent('activity_view', 0, lastActivity);
      for (const kind of ['pointerdown', 'keydown', 'touchstart', 'scroll']) {
        document.addEventListener(kind, onUserInput, { capture: true, passive: true });
      }
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onVocabularyKey, true);
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('english:question-result',event=>{const result=cleanQuestion(event.detail);if(result){addEvent('question_result',0,activityAnchor(),result);void flush();}});
      document.addEventListener('play',event=>{if(event.target?.tagName==='AUDIO'){addEvent('audio_play');void flush();}},true);
      document.addEventListener('ended',event=>{if(event.target?.tagName==='AUDIO'){addEvent('audio_complete');void flush();}},true);
      window.addEventListener('hashchange', checkNavigation);
      window.addEventListener('popstate', checkNavigation);
      window.addEventListener('online', () => void flush());
      window.addEventListener('pagehide', () => { leaving=true;recordTime();persist();void presence('hidden',true);void flush(); });
      window.addEventListener('english:logout', stop);
      sampleTimer = setInterval(sampleTime, 1_000);
      navigationTimer = setInterval(checkNavigation, 500);
      sendTimer = setInterval(() => { recordTime();void presence();void flush(); }, SEND_EVERY_MS);
      void flush();
      void presence(undefined,true);
    } catch (_) { /* The access client handles sign-in and errors. */ }
  }
  void start();
})();
