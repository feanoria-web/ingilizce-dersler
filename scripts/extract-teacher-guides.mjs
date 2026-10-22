import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PRIVATE_IDS=new Set(['guide','plan','observe','diagnosis']);
const PRIVATE_CLASS=/\b(?:teacher-only|teacher-note|teacher-panel|teacher-resource|t-only|act-prep|act-tip|b-private)\b/;
const privateSection=item=>item?.type==='diagnosis'||/^Teacher:\s*diagnosis grid$/i.test(item?.title||'');
const MARKER='<meta name="teacher-guides" content="private-v1">';
const require=createRequire(import.meta.url);
const acorn=require('./vendor/acorn.cjs');
const parse=source=>acorn.parse(source,{ecmaVersion:'latest',sourceType:'script',allowReturnOutsideFunction:true});
const keyOf=node=>node?.type==='Identifier'?node.name:node?.type==='Literal'?String(node.value):null;
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const clone=value=>JSON.parse(JSON.stringify(value));
const hasContent=value=>value!==undefined&&value!==null&&(typeof value==='string'?value.trim().length>0:Array.isArray(value)?value.length>0:typeof value==='object'?Object.keys(value).length>0:Boolean(value));
function walk(node,visit,parent=null){if(!node||typeof node!=='object')return;visit(node,parent);for(const [key,value]of Object.entries(node)){if(['start','end','loc','range'].includes(key))continue;if(Array.isArray(value)){for(const item of value)if(item?.type)walk(item,visit,node);}else if(value?.type)walk(value,visit,node);}}
function editsApplied(source,edits){
  const sorted=edits.sort((a,b)=>a.start-b.start||b.end-a.end),selected=[];
  for(const edit of sorted){const previous=selected.at(-1);if(previous&&edit.start<previous.end){if(edit.end<=previous.end)continue;throw new Error('Overlapping teacher-guide source edits.');}selected.push(edit);}
  for(const edit of selected.reverse())source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
  return source;
}
function nodeText(source,node){return source.slice(node.start,node.end);}
function readable(source,node){
  if(node.type==='Literal')return node.value;
  const strings=[];walk(node,child=>{if(child.type==='Literal'&&typeof child.value==='string'&&child.value.trim())strings.push(child.value);else if(child.type==='TemplateElement'&&child.value.cooked?.trim())strings.push(child.value.cooked);});
  return {text:humanText(strings),source:nodeText(source,node)};
}
function humanText(values){return [...new Set(values.map(value=>value.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()).filter(value=>value.length>3&&/[\p{L}]/u.test(value)))];}
function sourceContent(source){try{const tree=parse('const content=`'+source+'`;'),node=tree.body[0].declarations[0].init;return {...readable('const content=`'+source+'`;',node),source};}catch{return {source};}}
export function normalizeTeacherGuideBundle(bundle){
  for(const lesson of bundle.lessons){const counts=new Map();for(const section of lesson.sections){const base=section.id,count=(counts.get(base)||0)+1;counts.set(base,count);section.id=base+(count>1?'-'+count:'');if(section.content?.source){if(!section.content.text)section.content=sourceContent(section.content.source);else section.content.text=humanText(Array.isArray(section.content.text)?section.content.text:[section.content.text]);}}}
  return bundle;
}
function privateHtmlEdits(source,node,add){
  if(node.type!=='TemplateLiteral')return [];
  let virtual='',parts=[];
  for(let i=0;i<node.quasis.length;i++){
    const q=node.quasis[i],start=virtual.length;virtual+=source.slice(q.start,q.end);parts.push({from:start,to:virtual.length,start:q.start,end:q.end});
    if(i<node.expressions.length){const e=node.expressions[i],from=virtual.length;virtual+='\u0000';parts.push({from,to:virtual.length,start:q.end,end:node.quasis[i+1].start});}
  }
  const at=(offset,end=false)=>{const p=parts.find(p=>offset>=p.from&&offset<(p.to))||parts.at(-1);return p.start+(p.to-p.from===p.end-p.start?offset-p.from:end?p.end-p.start:0);};
  const tags=[...virtual.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>/gi)],edits=[];
  for(let i=0;i<tags.length;i++){
    const tag=tags[i];if(tag[0].startsWith('</'))continue;
    const classes=tag[0].match(/\bclass\s*=\s*(["'])(.*?)\1/i)?.[2]||'';
    const target=tag[0].match(/\bdata-(?:go|special)\s*=\s*(["'])(.*?)\1/i)?.[2];
    if(!PRIVATE_CLASS.test(classes)&&!PRIVATE_IDS.has(target))continue;
    let depth=1,end=tag.index+tag[0].length;
    for(let j=i+1;j<tags.length;j++){if(tags[j][1].toLowerCase()!==tag[1].toLowerCase())continue;depth+=tags[j][0].startsWith('</')?-1:1;if(!depth){end=tags[j].index+tags[j][0].length;i=j;break;}}
    if(depth)continue;
    const start=at(tag.index),finish=at(end-1,true)+1;
    add('inline-'+start,'Öğretmene özel içerik',sourceContent(source.slice(start,finish)));
    edits.push({start,end:finish,text:''});
  }
  return edits;
}
function removeArrayItem(source,array,item){
  const index=array.elements.indexOf(item),next=array.elements[index+1],previous=array.elements[index-1];
  return next?{start:item.start,end:next.start,text:''}:{start:previous?previous.end:item.start,end:item.end,text:''};
}

function sanitizeComponent(value,add){
  const data=clone(value);
  for(const screen of data.screens||[]){
    if(PRIVATE_IDS.has(screen.id)){add(screen.id,screen.titleTR||screen.title||screen.id,screen);continue;}
    const notes={};for(const key of ['teacher','stages'])if(screen[key]?.length){notes[key]=screen[key];delete screen[key];}
    if(Object.keys(notes).length)add('screen-'+screen.id,screen.titleTR||screen.title||screen.id,notes);
    const prune=(item,context)=>{if(!item||typeof item!=='object')return;for(const key of ['prep','tip'])if(item[key]){add('activity-'+screen.id+'-'+key,context,{[key]:item[key]});delete item[key];}if(privateSection(item)){add('diagnosis-'+screen.id,context,item);return;}for(const [key,child]of Object.entries(item)){if(Array.isArray(child))item[key]=child.filter(x=>{if(privateSection(x)){add('diagnosis-'+screen.id,context,x);return false;}prune(x,x?.title||context);return true;});else if(child&&typeof child==='object')prune(child,context);}};
    prune(screen,screen.titleTR||screen.title);
  }
  data.screens=(data.screens||[]).filter(s=>!PRIVATE_IDS.has(s.id));
  if(data.homeLinks)data.homeLinks=data.homeLinks.filter(link=>!PRIVATE_IDS.has(link[0]));
  for(const key of ['teacherNotes','smallClass']){if(data[key]?.length)add(key,key,data[key]);data[key]=[];}
  return data;
}
function sanitizeBoard(value,add){
  const data=clone(value);
  const take=(object,key,label=key,empty)=>{if(object&&Object.hasOwn(object,key)){const value=object[key];if(hasContent(value))add(key,label,value);if(empty!==undefined)object[key]=empty;else delete object[key];}};
  for(const key of ['teacherGuidance','teacherRubric','observationGuidance'])take(data,key,key,{});
  for(const key of ['sourceTexts','sourcePages','rawSources','studentSamples','ambiguities','missingReferencedModels'])take(data,key,key,[]);
  take(data.placement,'bands','Seviye değerlendirme aralıkları',[]);
  take(data.writing,'teacherFields','Yazma değerlendirmesi',{});take(data.writing,'teacherLevelChoices','Yazma seviyeleri',[]);take(data.writing,'rubric','Yazma değerlendirme ölçütleri',[]);
  function prune(object,context=''){
    if(!object||typeof object!=='object')return;
    for(const key of Object.keys(object)){
      const value=object[key];
      if(/^teacherNote/i.test(key)){take(object,key,context||key,'');continue;}
      if((key==='steps'||key==='observe')&&Object.hasOwn(object,'teacherNote')&&Array.isArray(value)){take(object,key,context||object.titleEN||object.title,[]);continue;}
      if(value&&typeof value==='object')prune(value,object.titleEN||object.title||context);
    }
  }
  prune(data);return data;
}

export function sanitizeLessonHtml(html,id){
  if(html.includes(MARKER))return {html,guide:null,changed:false};
  const guide={id,title:id,sections:[]},attachments=[];
  const sectionCounts=new Map();
  const add=(sectionId,title,content)=>{const count=(sectionCounts.get(sectionId)||0)+1;sectionCounts.set(sectionId,count);guide.sections.push({id:sectionId+(count>1?'-'+count:''),title,content});};
  let relevant=false;
  html=html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,(whole,attributes,source)=>{
    if(/\btype\s*=\s*['"]application\/json/i.test(attributes)||!source.trim())return whole;
    const ast=parse(source),edits=[],protectedRanges=[];
    walk(ast,(node)=>{
      if(node.type!=='VariableDeclarator'||node.id.type!=='Identifier'||!node.init)return;
      if(node.id.name==='LESSON'){
        const statement=ast.body.find(s=>s.start<=node.start&&s.end>=node.end);
        const value=vm.runInNewContext(source.slice(0,statement.end)+';LESSON',{}, {timeout:3000});
        guide.title=value.meta?.titleTR||value.meta?.title||id;relevant=true;
        edits.push({start:node.init.start,end:node.init.end,text:json(sanitizeComponent(value,add))});protectedRanges.push(node.init);
      }else if(node.id.name==='DATA'&&node.init.type==='ObjectExpression'){
        const value=JSON.parse(nodeText(source,node.init));guide.title=value.metadata?.titleTR||value.metadata?.titleEN||value.metadata?.title||id;relevant=true;
        edits.push({start:node.init.start,end:node.init.end,text:json(sanitizeBoard(value,add))});protectedRanges.push(node.init);
      }else if(node.id.name==='PRINTABLES'&&node.init.type==='ArrayExpression'){
        const value=JSON.parse(nodeText(source,node.init)),publicDocs=[];
        for(const doc of value){if(/ogretmen|öğretmen|teacher/i.test(doc.base+' '+doc.title)){for(const key of ['pdf','docx']){const m=doc[key]?.match(/^data:([^;,]+);base64,([\s\S]+)$/);if(m)attachments.push({name:doc.base+'.'+key,mime:m[1],base64:m[2]});}add('printable-'+doc.base,doc.title,{description:doc.description});}else publicDocs.push(doc);}
        edits.push({start:node.init.start,end:node.init.end,text:json(publicDocs)});protectedRanges.push(node.init);
      }
    });
    if(!relevant)return whole;
    walk(ast,(node,parent)=>{
      if(protectedRanges.some(r=>node.start>=r.start&&node.end<=r.end))return;
      if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='note'){add('note-'+node.start,'Öğretmen notu',readable(source,node.arguments[0]||node));edits.push({start:node.start,end:node.end,text:'""'});}
      if(node.type==='Property'&&keyOf(node.key)==='note'){add('note-'+node.start,'Öğretmen notu',readable(source,node.value));edits.push({start:node.value.start,end:node.value.end,text:'""'});}
      if(node.type==='ArrayExpression'&&parent?.type==='ArrayExpression'&&PRIVATE_IDS.has(node.elements[0]?.value)){edits.push(removeArrayItem(source,parent,node));}
      if(node.type==='MemberExpression'&&['state','st'].includes(node.object?.name)&&keyOf(node.property)==='teacher'){
        const target=parent?.type==='AssignmentExpression'&&parent.left===node?parent:node;edits.push({start:target.start,end:target.end,text:'false'});
      }
      if(node.type==='FunctionDeclaration'&&['observationHTML','observations','samples','exportObservations'].includes(node.id.name)){add('function-'+node.id.name,'Öğretmen gözlem ve değerlendirmesi',readable(source,node));edits.push({start:node.body.start,end:node.body.end,text:'{return "";}'});}
      if(node.type==='FunctionDeclaration'&&node.id.name==='note')edits.push({start:node.body.start,end:node.body.end,text:'{return "";}'});
      if(node.type==='FunctionDeclaration'&&node.id.name==='renderObservations')edits.push({start:node.body.start,end:node.body.end,text:'{return render("home");}'});
      if(node.type==='FunctionDeclaration'&&node.id.name==='renderPlan')edits.push({start:node.body.start,end:node.body.end,text:'{return "";}'});
      if(node.type==='TemplateLiteral')edits.push(...privateHtmlEdits(source,node,add));
    });
    source=editsApplied(source,edits);
    // Reset legacy persisted teacher flags before any UI initialisation and every save.
    source=source.replace(/function save\(\)\s*\{/g,match=>`${source.includes('let st =')?'st':'state'}.teacher=false;\n${match}${source.includes('let st =')?'st':'state'}.teacher=false;`);
    parse(source);
    return `<script${attributes}>${source}</script>`;
  });
  if(!relevant)return {html,guide:null,changed:false};
  html=html.replace(/<button\b([^>]*\bid\s*=\s*['"](?:teacher-toggle|flow-btn)['"][^>]*)>/gi,'<button$1 hidden disabled tabindex="-1" aria-hidden="true" style="display:none!important">');
  html=html.replace('</head>',MARKER+'\n<style id="student-teacher-visibility">.teacher-only,.teacher-note,.teacher-panel,.teacher-resource,.t-only,.act-prep,.act-tip,.b-private{display:none!important}</style>\n</head>');
  if(attachments.length)guide.attachments=attachments;
  return {html,guide,changed:true};
}

export function assertPublicLessonHtml(html,id='lesson'){
  const fail=detail=>{throw new Error(`${id}: private teacher content (${detail}); run node scripts/extract-teacher-guides.mjs --apply.`);};
  // Also protect future lesson families that use static HTML rather than LESSON/DATA.
  const markup=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
  const stack=[],voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for(const tag of markup.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>/gi)){
    const name=tag[1].toLowerCase();
    if(tag[0].startsWith('</')){let index=stack.length-1;while(index>=0&&stack[index].name!==name)index--;if(index<0)continue;const open=stack[index];stack.length=index;if(open.private&&markup.slice(open.end,tag.index).trim())fail('static teacher-only block');continue;}
    const classes=tag[0].match(/\bclass\s*=\s*(["'])(.*?)\1/i)?.[2]||'',elementId=tag[0].match(/\bid\s*=\s*(["'])(.*?)\1/i)?.[2]||'';
    const target=tag[0].match(/\b(?:href|data-go|data-special)\s*=\s*(["'])(.*?)\1/i)?.[2]||'';
    const isPrivate=PRIVATE_CLASS.test(classes)||/^(?:guide|teacher[-_](?:guide|notes?|panel|resource))$/i.test(elementId);
    if(/^(?:#(?:guide|teacher-guide)|guide|teacher-guide)$/.test(target))fail('static teacher guide link');
    if(!voidTags.has(name)&&!tag[0].endsWith('/>'))stack.push({name,end:tag.index+tag[0].length,private:isPrivate});
  }
  if(/\bconst\s+LESSON\s*=|\bconst\s+DATA\s*=\s*\{/.test(html)&&!html.includes(MARKER))fail('unprocessed source');
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
    if(/\bid\s*=\s*['"]teacher[-_](?:guides?|notes?|data)['"]/i.test(match[1])&&match[2].trim())fail('teacher data script');
    if(/\btype\s*=\s*['"]application\/json/i.test(match[1])||!match[2].trim())continue;
    const source=match[2],ast=parse(source),ranges=[];let family=false;
    walk(ast,node=>{
      if(node.type!=='VariableDeclarator'||!['LESSON','DATA','PRINTABLES'].includes(node.id?.name)||!node.init||!['ObjectExpression','ArrayExpression'].includes(node.init.type))return;
      if(node.id.name==='PRINTABLES'){
        const docs=JSON.parse(nodeText(source,node.init));if(docs.some(doc=>/ogretmen|öğretmen|teacher/i.test(doc.base+' '+doc.title)))fail('teacher attachment');return;
      }
      family=true;ranges.push(node.init);
      let value;try{value=JSON.parse(nodeText(source,node.init));}catch{fail('data must be extracted JSON');}
      const findings=[],add=(sectionId)=>findings.push(sectionId);
      if(node.id.name==='LESSON'){sanitizeComponent(value,add);if(value.homeLinks?.some(link=>PRIVATE_IDS.has(link[0])))fail('teacher resource link');}
      else sanitizeBoard(value,add);
      if(findings.length)fail(findings[0]);
    });
    if(!family)continue;
    walk(ast,(node,parent)=>{
      if(ranges.some(r=>node.start>=r.start&&node.end<=r.end))return;
      if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='note')fail('inline note');
      if(node.type==='Property'&&keyOf(node.key)==='note'&&!(node.value.type==='Literal'&&node.value.value===''))fail('slide note');
      if(node.type==='ArrayExpression'&&parent?.type==='ArrayExpression'&&PRIVATE_IDS.has(node.elements[0]?.value))fail('teacher navigation');
      if(node.type==='TemplateLiteral'&&privateHtmlEdits(source,node,()=>{}).length)fail('teacher-only template');
      if(node.type==='MemberExpression'&&['state','st'].includes(node.object?.name)&&keyOf(node.property)==='teacher'&&!(parent?.type==='AssignmentExpression'&&parent.left===node&&parent.right.type==='Literal'&&parent.right.value===false))fail('legacy teacher-mode access');
    });
  }
  return true;
}
async function lessonFiles(directory){const files=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const full=path.join(directory,entry.name);if(entry.isDirectory())files.push(...await lessonFiles(full));else if(/\.html?$/i.test(entry.name))files.push(full);}return files.sort();}
export async function extractTeacherGuides({root=ROOT,apply=false}={}){
  const output=path.join(root,'private','teacher-guides.json'),backupRoot=path.join(root,'private','teacher-guides-original');
  let existing={version:1,lessons:[]};try{existing=JSON.parse(await fs.readFile(output,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const existingJson=JSON.stringify(existing);normalizeTeacherGuideBundle(existing);
  const records=new Map(existing.lessons.map(item=>[item.id,item])),changes=[];
  for(const file of await lessonFiles(path.join(root,'lessons'))){const relative=path.relative(root,file).split(path.sep).join('/'),id=relative.replace(/^lessons\//,'').replace(/\.html?$/i,''),original=await fs.readFile(file,'utf8');const result=sanitizeLessonHtml(original,id);if(!result.changed)continue;records.set(id,result.guide);changes.push({file,relative,original,html:result.html});}
  if(apply&&(changes.length||existingJson!==JSON.stringify(existing))){await fs.mkdir(backupRoot,{recursive:true});for(const change of changes){const backup=path.join(backupRoot,change.relative);await fs.mkdir(path.dirname(backup),{recursive:true});try{await fs.writeFile(backup,change.original,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}}await fs.writeFile(output,JSON.stringify({version:1,lessons:[...records.values()].sort((a,b)=>a.id.localeCompare(b.id))}));for(const change of changes)await fs.writeFile(change.file,change.html);}
  return {changed:changes.length,lessons:records.size,applied:apply};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const apply=process.argv.includes('--apply');if(process.argv.some(a=>a.startsWith('--')&&a!=='--apply'))throw new Error('Only --apply is supported.');
  const result=await extractTeacherGuides({apply});console.log(JSON.stringify(result));
}
