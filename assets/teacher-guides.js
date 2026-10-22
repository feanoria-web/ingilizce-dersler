(() => {
  'use strict';
  const access = window.EnglishAccess;
  const $ = id => document.getElementById(id);
  const validId = id => typeof id === 'string' && /^(a1|a2|b1|yds)\/[a-z0-9-]+$/.test(id) && id.length <= 100;
  const labels = {teacher:'Öğretmen notları',teacherNotes:'Öğretmen notları',teacherNote:'Öğretmen notu',teacherNoteTurkish:'Öğretmen açıklaması',teacherGuidance:'Öğretmen rehberi',teacherRubric:'Değerlendirme ölçütleri',observationGuidance:'Gözlem rehberi',sourceTexts:'Kaynak metinler',sourceText:'Kaynak metin',stages:'Dersin aşamaları',steps:'Uygulama adımları',prep:'Hazırlık',tip:'Öneri',smallClass:'Küçük sınıf önerileri',title:'Başlık',titleTR:'Başlık',titleEN:'İngilizce başlık',text:'Açıklama',body:'İçerik',content:'İçerik',items:'Maddeler',sections:'Bölümler',teacherFields:'Öğretmen değerlendirmesi',rubric:'Değerlendirme ölçütleri',bands:'Seviye ölçütleri',observe:'Gözlem',goal:'Hedef',aim:'Amaç',time:'Süre',minutes:'Dakika',duration:'Süre',materials:'Malzemeler',instructions:'Yönergeler',notes:'Notlar',note:'Not',label:'Başlık',type:'Tür',id:'Bölüm',en:'İngilizce',tr:'Türkçe',answer:'Yanıt',answers:'Yanıtlar',prompt:'Yönerge',question:'Soru',questions:'Sorular',studentSamples:'Öğrenci örnekleri',teacherOnly:'Öğretmene özel',ambiguities:'Ders notları',missingReferencedModels:'Kaynakla ilgili notlar',sourceIssues:'Kaynakla ilgili notlar'};
  const urls = new Set();
  let generation = 0, catalog = [], selected = '', loading = 0, verified = false, active = true, verificationEpoch = 0, lastVerification = 0;
  function status(text, error = false) { $('guide-status').textContent = text; $('guide-status').classList.toggle('is-error', error); }
  function clear() { $('guide-content').replaceChildren(); $('guide-open-lesson').hidden = true; for (const url of urls) URL.revokeObjectURL(url); urls.clear(); }
  function lock() { generation++; verificationEpoch++; verified=false; loading=0; clear(); catalog=[]; selected=''; $('guide-lesson').replaceChildren(); $('guide-lesson').disabled=true; $('admin-dashboard').hidden=true; $('admin-signin').hidden=false; }
  const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = String(text); if (className) node.className=className; return node; };
  function plain(value) {
    return String(value).replace(/<br\s*\/?>/gi,'\n').replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi,'\n').replace(/<\/?(?:p|div|span|b|strong|em|i|u|ul|ol|li|h[1-6]|table|tr|td|th|thead|tbody)\b[^>]*>/gi,'').replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[key]).trim();
  }
  const label = key => labels[key] || key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ');
  function valueNode(value, depth=0) {
    if (value===null || typeof value!=='object') return element('p', value===null ? '—' : typeof value==='boolean' ? value ? 'Evet' : 'Hayır' : plain(value));
    if (depth>12) return element('pre', JSON.stringify(value,null,2));
    if (Array.isArray(value)) {
      const list=element('ol');
      for (const item of value) { const row=element('li'); if(item && typeof item==='object') row.className='guide-item'; row.append(valueNode(item,depth+1)); list.append(row); }
      return list;
    }
    const group=element('div');
    for (const [key,item] of Object.entries(value)) {
      if (item===undefined || Array.isArray(item)&&item.length===0) continue;
      const field=element('div',undefined,'guide-field'); field.append(element(depth<2?'h3':'h4',label(key)),valueNode(item,depth+1)); group.append(field);
    }
    return group;
  }
  function attachmentButton(attachment) {
    const button=element('button',attachment.name,'button'); button.type='button';
    button.addEventListener('click',()=>{
      try {
        if (!verified || !access.session() || access.session().role!=='admin') {lock();return;}
        if (!['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(attachment.mime) || typeof attachment.base64!=='string' || attachment.base64.length>22*1024*1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.base64)) throw new Error('Dosya biçimi desteklenmiyor.');
        const bytes=Uint8Array.from(atob(attachment.base64),character=>character.charCodeAt(0));
        const url=URL.createObjectURL(new Blob([bytes],{type:attachment.mime})); urls.add(url);
        const link=element('a'); link.href=url; link.download=String(attachment.name).replace(/[\\/\u0000-\u001f]/g,'_'); document.body.append(link); link.click(); link.remove();
        setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},1000);
      } catch(error) { status(error.message,true); }
    }); return button;
  }
  function render(guide) {
    if (!guide || guide.id!==selected || !Array.isArray(guide.sections)) throw new Error('Rehber yanıtı doğrulanamadı.');
    const fragment=document.createDocumentFragment(); fragment.append(element('h2',guide.title));
    for(const [index,section] of guide.sections.entries()) {
      const details=element('details',undefined,'guide-section'); details.open=index===0;
      const body=element('div'); body.append(valueNode(section.content)); details.append(element('summary',section.title),body); fragment.append(details);
    }
    if(Array.isArray(guide.attachments)&&guide.attachments.length) {const section=element('section',undefined,'guide-section');const body=element('div',undefined,'guide-downloads'); section.append(element('h3','Öğretmen dosyaları'));for(const file of guide.attachments)body.append(attachmentButton(file));section.append(body);fragment.append(section);}
    $('guide-content').append(fragment); const link=$('guide-open-lesson');link.href=`lessons/${guide.id}.html`;link.hidden=false;
  }
  async function openGuide(id) {
    if(!verified || access.session()?.role!=='admin'){lock();return;}
    const ticket=++generation;clear();selected=id;
    if(!validId(id)) {status('Bir ders seçin.');return;}
    status('Rehber yükleniyor…');
    try {const guide=await access.request(`/api/admin/teacher-guides/${id}`);if(ticket!==generation)return;if(access.session()?.role!=='admin'){lock();return;}render(guide);status('');}
    catch(error){if(ticket===generation){clear();status(error.message,true);}}
  }
  async function load() {
    if(!active || !verified || loading)return;
    const ticket=++generation;loading=ticket;clear();status('Dersler yükleniyor…');$('guide-lesson').disabled=true;
    try {
      if(access?.session()?.role!=='admin') {lock();return;}
      const response=await access.request('/api/admin/teacher-guides');if(ticket!==generation)return;
      if(!Array.isArray(response?.lessons)||response.lessons.some(item=>!validId(item.id)||typeof item.title!=='string'))throw new Error('Ders listesi doğrulanamadı.');
      catalog=response.lessons;const select=$('guide-lesson');select.replaceChildren();
      for(const lesson of catalog){const option=element('option',`${lesson.id.split('/')[0].toUpperCase()} · ${lesson.title}`);option.value=lesson.id;select.append(option);}
      const requested=new URLSearchParams(location.search).get('lesson');selected=catalog.some(item=>item.id===requested)?requested:catalog.some(item=>item.id===selected)?selected:catalog[0]?.id||'';select.value=selected;select.disabled=catalog.length===0;
      if(!catalog.length)status('Henüz öğretmen rehberi eklenmedi.');else await openGuide(selected);
    } catch(error){if(ticket===generation)status(error.message,true);}finally{if(loading===ticket)loading=0;}
  }
  $('guide-lesson').addEventListener('change',()=>{const id=$('guide-lesson').value;if(!catalog.some(item=>item.id===id))return;const url=new URL(location.href);url.searchParams.set('lesson',id);history.replaceState(null,'',url);openGuide(id);});
  $('guide-retry').addEventListener('click',load);
  window.addEventListener('english:logout',lock);window.addEventListener('english:session-expired',lock);window.addEventListener('pagehide',()=>{active=false;lock();});
  async function verifyAndLoad(){if(!active)return;const epoch=verificationEpoch;if(Date.now()-lastVerification<15000)return;lastVerification=Date.now();try{if(access?.session()?.role!=='admin')return;const identity=await access.request('/api/auth/me');if(!active||epoch!==verificationEpoch)return;if(identity.role!=='admin'||access.session()?.role!=='admin'){lock();return;}verified=true;if($('admin-dashboard').hidden){$('admin-signin').hidden=true;$('admin-dashboard').hidden=false;await load();}}catch(_){if(active&&epoch===verificationEpoch)lock();}}
  window.addEventListener('pageshow',event=>{active=true;if(event.persisted){lastVerification=0;verifyAndLoad();}});window.addEventListener('focus',verifyAndLoad);
  const readyEpoch=verificationEpoch;
  access?.ready.then(session=>{if(!active||readyEpoch!==verificationEpoch)return;if(session?.role==='admin'&&access.session()?.role==='admin'){verified=true;load();}else lock();});
})();
