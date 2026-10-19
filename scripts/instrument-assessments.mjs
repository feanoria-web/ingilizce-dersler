import path from 'node:path';

// Exact, fail-closed build transforms. Offline source lessons are never changed.
export function instrumentAssessments(source, relativePath = 'index.html') {
  if (typeof source !== 'string') throw new TypeError('HTML must be a string.');
  const file = relativePath.replace(/\\/g, '/');
  if (path.posix.isAbsolute(file) || file.split('/').includes('..')) throw new Error('Assessment path must stay within the site.');
  if (source.includes('id="english-assessment-bridge"')) return { html: source, coverage: { path: file, alreadyInstrumented: true, hooks: [] } };
  let html = source;
  const coverage = { path: file, family: 'activity-only', hooks: [], ungraded: ['Free writing, speaking, teacher observations and answer reveals are activity records, not automatic correctness scores.'] };
  const hook = (name, before, after, required = true) => {
    const count = html.split(before).length - 1;
    if (count !== 1) {
      if (!required && count === 0) return;
      throw new Error(`${file}: ${name} expected one grading anchor; found ${count}.`);
    }
    html = html.replace(before, after);
    coverage.hooks.push(name);
  };
  if (html.includes('function bindChoice(el, o, s, k, correct)')) {
    coverage.family = 'component-lessons';
    hook('instant-choice', 'st.choices[key(s, k, i)] = +b.dataset.j; save(); paint();', 'st.choices[key(s, k, i)] = +b.dataset.j; save(); paint(); if(window.EnglishAssessment?.choice(key(s,k,i),o.items[i],o.items[i].o||o.options,+b.dataset.j,correct(o.items[i])))window.EnglishAssessment?.help?.(key(s,k,i),"answer");');
    hook('gap-fill', 'const good = accepts(inp.value, it.a[+inp.dataset.j]);', 'const good = accepts(inp.value, it.a[+inp.dataset.j]); if(window.EnglishAssessment?.result(key(s,k,+q.dataset.i,+inp.dataset.j),it.q,inp.value,it.a[+inp.dataset.j],good))window.EnglishAssessment?.help?.(key(s,k,+q.dataset.i,+inp.dataset.j),"answer");');
    hook('sentence-rewrite', 'const good = it.r.some(r => norm(r) === norm(inp.value));', 'const good = it.r.some(r => norm(r) === norm(inp.value)); if(window.EnglishAssessment?.result(key(s,k,+q.dataset.i),it.w,inp.value,it.r.join(" / "),good))window.EnglishAssessment?.help?.(key(s,k,+q.dataset.i),"answer");');
    hook('word-order', 'const good = picked.length === words.length && accepts(picked.map(w => words[w]).join(" "), it.a);', 'const good = picked.length === words.length && accepts(picked.map(w => words[w]).join(" "), it.a); window.EnglishAssessment?.result(key(s,k,i),it.w,picked.map(w=>words[w]).join(" "),it.a,good);', html.includes('B.order ='));
    hook('pair-matching', 'checked = true; const ok = o.pairs.filter((_, i) => pl[i] === i).length;', 'checked = true; o.pairs.forEach((pair,i)=>window.EnglishAssessment?.result(o.id+":"+i,pair[0],pl[i]===undefined?"":o.pairs[pl[i]]?.[1],pair[1],pl[i]===i,"matching")); const ok = o.pairs.filter((_, i) => pl[i] === i).length;', html.includes('B.match ='));
    hook('dictation-typed', 'const good = norm(inp.value) === norm(strip(it.text));', 'const good = norm(inp.value) === norm(strip(it.text)); window.EnglishAssessment?.result(key(s,k,+q.dataset.i),it.hint||"Listen and type",inp.value,it.text,good);', html.includes('B.listen ='));
    hook('category-sort', 'checked = true; const n = Object.keys(pl).length, ok = o.items.filter((it, i) => pl[i] === it[1]).length;', 'checked = true; o.items.forEach((it,i)=>window.EnglishAssessment?.result(o.id+":"+i,it[0],pl[i]===undefined?"":o.buckets[pl[i]],o.buckets[it[1]],pl[i]===it[1],"matching")); const n = Object.keys(pl).length, ok = o.items.filter((it, i) => pl[i] === it[1]).length;');
    hook('spelling-typed', 'good = inp.value.trim().toLowerCase() === o.items[+q.dataset.i].toLowerCase();', 'good = inp.value.trim().toLowerCase() === o.items[+q.dataset.i].toLowerCase(); window.EnglishAssessment?.result(key(s,k,+q.dataset.i),"Listen and spell",inp.value,o.items[+q.dataset.i],good);', html.includes('B.spell ='));
    hook('reading-word-classification', 'const m = mk[w.dataset.id]; if (!m) return;', 'const m = mk[w.dataset.id]; window.EnglishAssessment?.result(w.dataset.id,w.textContent,m?o.marks[m]?.label:"",o.marks[w.dataset.k]?.label,m===w.dataset.k,"matching"); if (!m) return;');
  } else if (html.includes('function grade(prefix,qs)') || html.includes("function grade(prefix,questions,mode='mcq')")) {
    coverage.family = 'legacy-workbook';
    if (html.includes('function grade(prefix,qs)')) {
      hook('workbook-quiz-and-fill', 'if(right)n++;const fb=', 'window.EnglishAssessment?.result(prefix+"-"+i,q.q||q.prompt||q.questionEN,v===undefined||v===""?"":q.options?q.options[Number(v)]:v,q.options?q.options[q.answer]:q.answer,right,q.options?"multiple-choice":"fill-blank",q.options);if(right)n++;const fb=');
    } else {
      hook('workbook-quiz-and-fill-v2', 'if(right)n++;const fb=$(`#fb-${prefix}-${i}`);', 'window.EnglishAssessment?.result(prefix+"-"+i,q.q||q.prompt,val===undefined||val===""?"":mode==="mcq"?q.options[Number(val)]:val,mode==="mcq"?q.options[q.answer]:q.answer,right,mode==="mcq"?"multiple-choice":"fill-blank",q.options);if(right)n++;const fb=$(`#fb-${prefix}-${i}`);');
    }
    if (html.includes('function checkLightQuiz(prefix)')) {
      hook('first-day-blank', "if(value===undefined||value===''){if(fb)", "if(value===undefined||value===''){window.EnglishAssessment?.choice(prefix+'-'+i,q,q.options,undefined,q.answer);if(fb)");
      hook('first-day-light-quiz', 'const right=Number(value)===q.answer;if(right)correct++;', 'const right=Number(value)===q.answer;window.EnglishAssessment?.choice(prefix+"-"+i,q,q.options,value,q.answer);if(right)correct++;');
    }
    // A classroom vote is graded only when its answer is opened, never on page render.
    hook('board-selected-answer', 'boardReveals[s.uid]=count>=n?0:count+1;applyBoardReveal()', 'boardReveals[s.uid]=count>=n?0:count+1;if(count<n&&s.type==="quiz"&&boardVotes[s.uid]!==undefined)window.EnglishAssessment?.choice("board:"+s.uid,s.question,s.question.options,boardVotes[s.uid],s.question.answer);applyBoardReveal()');
    hook('board-graded-vote-change', 'boardVotes[boardSlides[boardIndex].uid]=+vote.dataset.boardVote;applyBoardReveal()', 'boardVotes[boardSlides[boardIndex].uid]=+vote.dataset.boardVote;applyBoardReveal();const assessed=boardSlides[boardIndex];if(assessed.type==="quiz"&&boardReveals[assessed.uid]>0)window.EnglishAssessment?.choice("board:"+assessed.uid,assessed.question,assessed.question.options,boardVotes[assessed.uid],assessed.question.answer)');
  } else if (html.includes('function submitExam(expired=false)')) {
    coverage.family = 'yds-studio';
    hook('yds-practice-checked', 'answer.checked=true;answer.attempts=(answer.attempts||0)+1;', 'answer.checked=true;answer.attempts=(answer.attempts||0)+1;if(window.EnglishAssessment?.choice(id,q,q.options,answer.choice,q.answer))window.EnglishAssessment?.help?.(id,"answer");');
    hook('yds-practice-retry', 'if(QUESTION_MAP.has(id)){state.answers[id]={attempts:', 'if(QUESTION_MAP.has(id)){window.EnglishAssessment?.reset(id);state.answers[id]={attempts:');
    hook('yds-submitted-exam', 'const q=QUESTION_MAP.get(id),choice=exam.choices[id];', 'const q=QUESTION_MAP.get(id),choice=exam.choices[id];window.EnglishAssessment?.choice(id,q,q.options,choice,q.answer,"exam:"+exam.started);');
  }
  if (coverage.hooks.length) {
    if (!/<head\b[^>]*>/i.test(html)) throw new Error(`${file}: no head for assessment bridge.`);
    const assets = `${path.posix.relative(path.posix.dirname(file), 'assets') || '.'}/`;
    html = html.replace(/<head\b[^>]*>/i, head => `${head}\n<script id="english-assessment-bridge" src="${assets}assessment-bridge.js"></script>\n`);
  }
  return { html, coverage };
}
