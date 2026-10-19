/* Static lesson metadata only: never reads written answers or teacher notes. */
(() => {
  'use strict';
  if (window.EnglishLearningPageBridge) return;
  const text = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/\*\*/g,'').replace(/\s+/g,' ').trim() : '';
  const topic = (screen,item={}) => {
    const label=text(item.why || item.explanation || item.topic || '') || text(screen.title);
    const rules=[
      ['do-does','Present Simple · do / does',/\bdo\s*\/\s*does\b|\bdoes\s*\/\s*do\b|\bdoes\b.{0,45}(?:yalın|soru)|soru.{0,45}\bdoes\b/i],
      ['time-prepositions','Zaman edatları · in / on / at',/\bin\s*[·/]\s*on\s*[·/]\s*at\b|saat\s*→\s*at|gün\s*→\s*on/i],
      ['present-perfect','Present Perfect',/present perfect/i],
      ['present-continuous','Present Continuous',/present continuous|am\s*\/\s*is\s*\/\s*are\s*\+\s*-?ing/i],
      ['past-simple','Past Simple',/past simple|simple past/i],
      ['present-simple','Present Simple',/present simple|simple present|he\s*\/\s*she\s*\/\s*it.{0,20}-s/i],
      ['be','be · am / is / are',/\bam\s*[·/]\s*is\s*[·/]\s*are\b|\bbe\s*\+/i],
      ['articles','Tanımlıklar · a / an / the',/\ba\s*[·/]\s*an\b|tanımlık|articles/i],
      ['conditionals','Koşul cümleleri',/conditional|if clause/i],
      ['passive','Edilgen yapı',/passive|edilgen/i],
      ['comparatives','Karşılaştırmalar',/comparative|superlative|karşılaştırma/i],
      ['modals','Modal fiiller',/modal|can\s*\/\s*can't|must\s*\/\s*have to/i]
    ];
    const found=rules.find(([, ,pattern])=>pattern.test(label));
    return found ? {id:'grammar:'+found[0],title:found[1]} : {id:text(screen.id).slice(0,120),title:text(screen.title).slice(0,180)};
  };
  const observe = (element,id,prompt,kind,tag) => {
    if (!element || !id || !prompt) return;
    window.EnglishAssessment?.observe?.(element,String(id),text(prompt),kind,tag);
  };
  function questionCount(screen) {
    if(!screen || !Array.isArray(screen.sections)) return null;
    let count=0;
    for(const section of screen.sections) {
      if(['mcq','choice','fix','order','listen','spell','sort'].includes(section.type))count+=(section.items||[]).length;
      else if(section.type==='gap')count+=(section.items||[]).reduce((n,item)=>n+(Array.isArray(item.a)?item.a.length:1),0);
      else if(section.type==='match')count+=(section.pairs||[]).length;
      else if(section.type==='reading' && section.marks)return null;
    }
    return Math.min(2000,count);
  }
  function registerComponent({screens,getIndex,binders,key}) {
    const teaching=screens.map((screen,index)=>({screen,index})).filter(({screen})=>screen.block>0&&screen.type!=='break'&&Array.isArray(screen.sections));
    window.EnglishLessonProgress={snapshot(){
      const index=getIndex(),screen=screens[index];
      const pageIndex=teaching.findIndex(item=>item.index===index);
      return {pageKind:index<0?'overview':screen?.type==='break'?'break':pageIndex>=0?'lesson':'resource',pageIndex,totalPages:teaching.length,questionCount:pageIndex>=0?questionCount(screen):null,completed:false};
    }};
    for(const type of ['mcq','choice','gap','fix','order','listen','spell','match','sort','reading']) {
      const original=binders[type]; if(typeof original!=='function')continue;
      binders[type]=function(el,section,screen,k){
        const result=original.apply(this,arguments);
        if(type==='match')for(const node of el.querySelectorAll('[data-l]')) {const i=Number(node.dataset.l);observe(node,section.id+':'+i,section.pairs?.[i]?.[0],'matching',topic(screen));}
        else if(type==='sort')for(const node of el.querySelectorAll('[data-i]')) {const i=Number(node.dataset.i);observe(node,section.id+':'+i,section.items?.[i]?.[0],'matching',topic(screen));}
        else if(type==='reading')for(const node of el.querySelectorAll('.mw[data-id]'))observe(node,node.dataset.id,node.textContent,'matching',topic(screen));
        else for(const node of el.querySelectorAll('.q-item[data-i]')) {
          const i=Number(node.dataset.i),item=section.items?.[i]; if(item===undefined)continue;
          const prompt=typeof item==='string'?item:item.q||item.w||item.hint||item.text||(type==='spell'?'Listen and spell':'Question');
          const tag=topic(screen,typeof item==='object'?item:{});
          if(type==='gap')for(let j=0;j<(Array.isArray(item.a)?item.a.length:1);j++)observe(node,key(screen,k,i,j),prompt,'fill-blank',tag);
          else observe(node,key(screen,k,i),prompt,['mcq','choice'].includes(type)?'multiple-choice':'fill-blank',tag);
        }
        return result;
      };
    }
  }
  function watch(refresh) {
    let queued=false;
    const run=()=>{queued=false;refresh();};
    const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(run);}});
    observer.observe(document.querySelector('#main')||document.querySelector('#workspace')||document.body,{childList:true,subtree:true});
    refresh();
  }
  function registerBoard({getSlides,getIndex,getMode,getGroup,getCompleted}) {
    const eligible=()=>getSlides().map((screen,index)=>({screen,index})).filter(({screen})=>screen.tag!=='BREAK'&&screen.type!=='break');
    window.EnglishLessonProgress={snapshot(){
      const slides=getSlides(),board=getMode()==='board',index=getIndex(),group=getGroup(),screen=board?slides[index]:null;
      const list=eligible(),groupSlides=list.filter(item=>item.screen.group===group);
      const actual=board?index:groupSlides.at(-1)?.index;
      const pageIndex=list.findIndex(item=>item.index===actual);
      const isBreak=board?screen?.tag==='BREAK':slides.some(item=>item.group===group&&item.tag==='BREAK')&&!groupSlides.length;
      return {pageKind:group==='home'?'overview':isBreak?'break':pageIndex>=0?'lesson':'resource',pageIndex,totalPages:list.length,questionCount:board?(screen?.type==='quiz'?1:0):null,completed:Boolean(getCompleted?.())};
    }};
    watch(()=>{
      const board=getMode()==='board',screen=getSlides()[getIndex()];
      if(board) {
        if(screen?.type==='quiz'&&screen.question)observe(document.querySelector('#board-content'),'board:'+screen.uid,screen.question.q||screen.question.prompt||screen.question.questionEN||'Question','multiple-choice',topic({id:screen.group,title:screen.title},screen.question));
      } else for(const node of document.querySelectorAll('#main .question')) {
        const feedback=node.querySelector('.feedback[id^="fb-"]');
        if(!feedback)continue;
        const id=feedback.id.slice(3),prompt=node.querySelector('.question-title')?.textContent;
        observe(node,id,prompt,node.querySelector('input[type="radio"]')?'multiple-choice':'fill-blank',topic({id:getGroup(),title:document.querySelector('#main h1')?.textContent||'Etkinlik'}));
      }
    });
  }
  function registerYds({units,questions,getRoute,getLast,getCompleted}) {
    const pages=units.flatMap(unit=>unit.sections.map(section=>({unit,section})));
    window.EnglishLessonProgress={snapshot(){
      const route=getRoute()||{},sectionId=document.getElementById('section-select')?.value||getLast()?.sectionId;
      const pageIndex=route.view==='unit'?pages.findIndex(item=>item.section.id===sectionId):-1;
      return {pageKind:route.view==='breakreview'?'break':route.view==='home'?'overview':pageIndex>=0?'lesson':'resource',pageIndex,totalPages:pages.length,questionCount:pageIndex>=0?questions.filter(q=>q.sectionId===sectionId).length:null,completed:pageIndex>=0&&Boolean(getCompleted?.(sectionId))};
    }};
    const map=new Map(questions.map(q=>[q.id,q]));
    watch(()=>{
      for(const node of document.querySelectorAll('.quiz-card[id^="question-"]')) {
        const id=node.id.slice(9),q=map.get(id);if(!q)continue;
        const page=pages.find(item=>item.section.id===q.sectionId);
        observe(node,id,q.prompt,'multiple-choice',{id:q.sectionId||q.unitId,title:page?.section.title||units.find(u=>u.id===q.unitId)?.title||'YDS'});
      }
    });
  }
  window.EnglishLearningPageBridge=Object.freeze({registerComponent,registerBoard,registerYds});
})();
