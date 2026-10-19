import path from 'node:path';

export function instrumentLearning(source,relativePath,{versions={}}={}) {
  const file=relativePath.replace(/\\/g,'/');
  if(path.posix.isAbsolute(file)||file.split('/').includes('..'))throw new Error('Learning path must stay within site.');
  if(!/^lessons\/(a1|a2|b1|yds)\/.+\.html?$/.test(file)||source.includes('id="english-learning-page-bridge"'))return source;
  let html=source;
  const replace=(anchor,body)=>{
    const count=typeof anchor==='string'?html.split(anchor).length-1:[...html.matchAll(anchor)].length;
    if(count!==1)throw new Error(`${file}: learning registration anchor changed (${count}).`);
    html=html.replace(anchor,()=>body);
  };
  if(source.includes('const S = LESSON.screens')) {
    replace(/  init\(\);\r?\n\}\)\(\);/g,`  window.EnglishLearningPageBridge?.registerComponent({screens:S,getIndex:()=>st.idx,binders:B,key});\n  init();\n})();`);
  } else if(source.includes('initializeBoard();')&&source.includes('boardSlides')) {
    const anchor=/initializeBoard\(\);(?=(?:(?:if\(typeof initializeExtras[^<]*|initializeExtras\(\);))?\s*<\/script>)/g;
    // Break instrumentation appends its registration immediately after initialization.
    const appended=/initializeBoard\(\);(?=\s*;window.EnglishBreakReview)/g;
    const pattern=[...source.matchAll(appended)].length?appended:anchor;
    replace(pattern,`initializeBoard();\nwindow.EnglishLearningPageBridge?.registerBoard({getSlides:()=>boardSlides,getIndex:()=>boardIndex,getMode:()=>state.mode,getGroup:()=>current,getCompleted:()=>state.done[current]});\n`);
  } else if(file==='lessons/yds/grammar-studio.html') {
    replace(/  save\(\);render\(\);\r?\n\}\)\(\);/g,`  save();render();\n  window.EnglishLearningPageBridge?.registerYds({units:UNITS,questions:QUESTIONS,getRoute:()=>currentRoute,getLast:()=>state.last,getCompleted:id=>state.read[id]});\n})();`);
  } else throw new Error(`${file}: unsupported learning page model.`);
  const assets=path.posix.relative(path.posix.dirname(file),'assets')+'/';
  const version=name=>versions[name]?'?v='+versions[name]:'';
  html=html.replace(/<\/head\s*>/i,()=>`<script id="english-learning-page-bridge" src="${assets}learning-page-bridge.js${version('learning-page-bridge.js')}"></script>\n</head>`);
  if(versions['assessment-bridge.js'])html=html.replace(/(id="english-assessment-bridge" src="[^"]*assessment-bridge\.js)(")/,`$1?v=${versions['assessment-bridge.js']}$2`);
  return html;
}
