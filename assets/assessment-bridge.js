/* Evaluation events contain only answers explicitly graded by a lesson. Never reads a form. */
(() => {
  'use strict';
  if (window.EnglishAssessment) return;
  const last = new Map();
  const openedQuestions = new Map();
  const questionTopics = new Map();
  const observedElements = new Map();
  let observer = null;
  let lastOwner = '';
  const text = (value, max = 1000) => String(value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  const blank = value => value === undefined || value === null || text(value) === '';
  function identity() {
    const session = window.EnglishAccess?.session?.();
    const owner = `${session?.student?.id || 'pending'}:${typeof location === 'undefined' ? '' : location.pathname}`;
    if (lastOwner && lastOwner !== owner) { last.clear(); openedQuestions.clear(); questionTopics.clear(); }
    lastOwner = owner;
    return owner;
  }
  function topic(questionId, value) {
    const id = text(questionId, 160);
    if (!id || !value || typeof value !== 'object') return false;
    const clean = { id: text(value.id, 120), title: text(value.title, 180) };
    if (!clean.id || !clean.title) return false;
    questionTopics.set(id, clean);
    window.EnglishLearning?.topic?.(id, clean);
    return true;
  }
  function open(questionId, prompt, assessmentKind = 'fill-blank', subject) {
    try {
      identity();
      const id = text(questionId, 160), label = text(prompt, 1500);
      if (!id || !label) return false;
      if (subject) topic(id, subject);
      const detail = { questionId:id, prompt:label, assessmentKind:text(assessmentKind,64), topic:questionTopics.get(id) || null };
      openedQuestions.set(id, detail);
      if (openedQuestions.size > 2000) openedQuestions.delete(openedQuestions.keys().next().value);
      window.dispatchEvent(new CustomEvent('english:question-open', { detail }));
      return true;
    } catch (_) { return false; }
  }
  function visibleElement(element) {
    try {
      if (!element || element.isConnected===false || document.visibilityState==='hidden' || element.hidden || element.closest?.('[hidden],[aria-hidden="true"]')) return false;
      const rect=element.getBoundingClientRect?.();
      const height=window.innerHeight||document.documentElement?.clientHeight||0,width=window.innerWidth||document.documentElement?.clientWidth||0;
      if(!rect||height<=0||width<=0||rect.width<=0||rect.height<=0) return false;
      const area=Math.max(0,Math.min(rect.bottom,height)-Math.max(rect.top,0))*Math.max(0,Math.min(rect.right,width)-Math.max(rect.left,0));
      return area/(rect.width*rect.height)>=0.15;
    } catch (_) { return false; }
  }
  function activateElement(element) {
    if (!visibleElement(element)) return;
    for (const item of observedElements.get(element)?.values()||[]) open(item.questionId,item.prompt,item.assessmentKind,item.topic);
  }
  function observe(element, questionId, prompt, assessmentKind='fill-blank', subject) {
    try {
      const id=text(questionId,160),label=text(prompt,1500);
      if (!element||!id||!label) return false;
      if (!observedElements.has(element)) observedElements.set(element,new Map());
      observedElements.get(element).set(id,{questionId:id,prompt:label,assessmentKind,topic:subject||null});
      const ids=Array.from(observedElements.get(element).keys());
      if (ids.length===1) element.setAttribute?.('data-learning-question',id);
      else {element.removeAttribute?.('data-learning-question');element.setAttribute?.('data-learning-questions',JSON.stringify(ids));}
      if (typeof window.IntersectionObserver==='function') {
        if (!observer) observer=new window.IntersectionObserver(entries=>{
          for (const entry of entries) if (entry.isIntersecting&&entry.intersectionRatio>=0.15) activateElement(entry.target);
          for (const node of observedElements.keys()) if (node.isConnected===false) {observer.unobserve(node);observedElements.delete(node);}
        },{threshold:[0,0.15]});
        observer.observe(element);
      }
      activateElement(element);
      if (observedElements.size>2000) {const old=observedElements.keys().next().value;observer?.unobserve(old);observedElements.delete(old);}
      return true;
    } catch (_) { return false; }
  }
  function help(questionId, kind) {
    try {
      if (!['translation','hint','answer','audio'].includes(kind)) return false;
      window.dispatchEvent(new CustomEvent('english:assessment-help', { detail:{questionId:questionId == null ? null : text(questionId,160),helpType:kind} }));
      return true;
    } catch (_) { return false; }
  }
  function emit(input) {
    try {
      identity();
      if (!input || !['correct', 'incorrect', 'blank', 'ungraded'].includes(input.outcome)) return false;
      const detail = {
        questionId: text(input.questionId, 160), prompt: text(input.prompt, 1500),
        selectedAnswer: text(input.selectedAnswer), correctAnswer: text(input.correctAnswer),
        outcome: input.outcome,
        assessmentKind: ['multiple-choice', 'fill-blank', 'matching', 'self-report'].includes(input.assessmentKind) ? input.assessmentKind : 'fill-blank',
      };
      if (!detail.questionId || !detail.prompt) return false;
      if (input.topic) topic(detail.questionId, input.topic);
      if (Array.isArray(input.options)) detail.options = input.options.slice(0, 20).map(value => text(value));
      const key = (input.attemptScope ? text(input.attemptScope, 200) + ':' : '') + detail.questionId;
      const fingerprint = JSON.stringify([detail.selectedAnswer, detail.correctAnswer, detail.outcome]);
      if (last.get(key) === fingerprint) return false;
      last.set(key, fingerprint);
      detail.attemptId = typeof window.crypto?.randomUUID === 'function' ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const learning = window.EnglishLearning?.assess?.(detail);
      if (learning) detail.learning = learning;
      window.dispatchEvent(new CustomEvent('english:question-result', { detail }));
      return true;
    } catch (_) { return false; } // Logging must never break the exercise.
  }
  function result(questionId, prompt, selectedAnswer, correctAnswer, right, assessmentKind = 'fill-blank', options, attemptScope) {
    return emit({ questionId, prompt, selectedAnswer, correctAnswer, outcome: blank(selectedAnswer) ? 'blank' : right ? 'correct' : 'incorrect', assessmentKind, options, attemptScope });
  }
  function choice(questionId, q, options, choice, answer, attemptScope) {
    return result(questionId, q.prompt || q.q || q.qEN || q.questionEN || q.question || q.id || 'Question', blank(choice) ? '' : options[Number(choice)], options[answer], !blank(choice) && Number(choice) === Number(answer), 'multiple-choice', options, attemptScope);
  }
  window.EnglishAssessment = Object.freeze({ emit, result, choice, open, observe, help, topic, opened:() => Array.from(openedQuestions.values(), value => ({...value,topic:value.topic?{...value.topic}:null})), reset: id => id ? last.delete(id) : last.clear() });
  const inspectVisible=() => {for(const element of observedElements.keys()) {if(element.isConnected===false){observer?.unobserve(element);observedElements.delete(element);}else activateElement(element);}};
  // Fallbacks also cover browsers without IntersectionObserver. Only static question metadata is inspected.
  document.addEventListener('scroll',inspectVisible,{passive:true,capture:true});
  document.addEventListener('visibilitychange',inspectVisible);
  document.addEventListener('focusin',event=>{for(const element of observedElements.keys())if(element===event.target||element.contains?.(event.target))activateElement(element);},true);
  document.addEventListener('pointerdown',event=>{for(const element of observedElements.keys())if(element===event.target||element.contains?.(event.target))activateElement(element);},{capture:true,passive:true});
  window.addEventListener?.('resize',inspectVisible,{passive:true});
  document.addEventListener('click', event => {
    if (event.target?.closest?.('[data-clear],[data-reset],[data-clearmarks]')) last.clear();
  }, true);
})();
