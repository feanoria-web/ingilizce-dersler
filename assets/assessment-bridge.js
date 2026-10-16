/* Evaluation events contain only answers explicitly graded by a lesson. Never reads a form. */
(() => {
  'use strict';
  if (window.EnglishAssessment) return;
  const last = new Map();
  const text = (value, max = 1000) => String(value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  const blank = value => value === undefined || value === null || text(value) === '';
  function emit(input) {
    try {
      if (!input || !['correct', 'incorrect', 'blank', 'ungraded'].includes(input.outcome)) return false;
      const detail = {
        questionId: text(input.questionId, 160), prompt: text(input.prompt, 1500),
        selectedAnswer: text(input.selectedAnswer), correctAnswer: text(input.correctAnswer),
        outcome: input.outcome,
        assessmentKind: ['multiple-choice', 'fill-blank', 'matching', 'self-report'].includes(input.assessmentKind) ? input.assessmentKind : 'fill-blank',
      };
      if (!detail.questionId || !detail.prompt) return false;
      if (Array.isArray(input.options)) detail.options = input.options.slice(0, 20).map(value => text(value));
      const key = (input.attemptScope ? text(input.attemptScope, 200) + ':' : '') + detail.questionId;
      const fingerprint = JSON.stringify([detail.selectedAnswer, detail.correctAnswer, detail.outcome]);
      if (last.get(key) === fingerprint) return false;
      last.set(key, fingerprint);
      detail.attemptId = typeof window.crypto?.randomUUID === 'function' ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  window.EnglishAssessment = Object.freeze({ emit, result, choice, reset: id => id ? last.delete(id) : last.clear() });
  document.addEventListener('click', event => {
    if (event.target?.closest?.('[data-clear],[data-reset],[data-clearmarks]')) last.clear();
  }, true);
})();
