(() => {
  'use strict';
  const DATA = JSON.parse(document.getElementById('study-data').textContent);
  const UNITS = DATA.units;
  const UNIT_MAP = new Map(UNITS.map(unit => [unit.id,unit]));
  const QUESTIONS = UNITS.flatMap(unit => [
    ...unit.questions.map(q => ({...q,unitId:unit.id})),
    ...unit.reading.questions.map(q => ({...q,unitId:unit.id,type:'reading',sectionId:''})),
  ]);
  const QUESTION_MAP = new Map(QUESTIONS.map(q => [q.id,q]));
  const WORDS = UNITS.flatMap(unit => unit.vocabulary.map((word,index) => ({...word,id:`${unit.id}-v${index+1}`,unitId:unit.id})));
  const KEY = 'hudavendigar-yds-grammar-studio-v1';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const norm = value => String(value ?? '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const defaultState = {read:{},answers:{},wrong:{},words:{},notes:{},plan:{},last:null,large:false,exam:null,history:[]};
  let state = {...defaultState};
  let storageOK = true;
  try {
    const loaded = object(JSON.parse(localStorage.getItem(KEY) || '{}'));
    state = {...defaultState,...loaded};
    for (const key of ['read','answers','wrong','words','notes','plan']) state[key] = object(state[key]);
    state.history = Array.isArray(state.history) ? state.history.slice(-20) : [];
    for (const [id,answer] of Object.entries(state.answers)) {
      if (!QUESTION_MAP.has(id) || !answer || typeof answer !== 'object' || (answer.choice !== undefined && (!Number.isInteger(answer.choice) || answer.choice<0 || answer.choice>4))) delete state.answers[id];
    }
    for (const id of Object.keys(state.wrong)) if (!QUESTION_MAP.has(id)) delete state.wrong[id];
    if (state.exam && (!Array.isArray(state.exam.ids) || !state.exam.ids.length || state.exam.ids.some(id => !QUESTION_MAP.has(id)) || !Number.isFinite(state.exam.started))) state.exam=null;
    if (state.exam) {
      state.exam.choices=object(state.exam.choices);
      state.exam.index=Math.max(0,Math.min(Math.trunc(Number(state.exam.index)||0),state.exam.ids.length-1));
      state.exam.minutes=Number.isFinite(state.exam.minutes)&&state.exam.minutes>=0?state.exam.minutes:0;
      for (const [id,choice] of Object.entries(state.exam.choices)) if (!state.exam.ids.includes(id)||!Number.isInteger(choice)||choice<0||choice>4) delete state.exam.choices[id];
    }
  } catch (_) { storageOK=false; }
  const ui = {bankUnit:'all',bankType:'all',bankSearch:'',bankUnsolved:false,bankPage:0,wordUnit:'all',wordSearch:'',wordMode:'all',flipped:new Set(),testUnit:'all',testCount:20,testMinutes:30,testReading:false};
  let toastTimer;
  let currentRoute;

  function save() {
    try { localStorage.setItem(KEY,JSON.stringify(state)); } catch (_) { storageOK=false; }
    const indicator=$('#save-indicator');
    indicator.innerHTML=storageOK?'<i></i> Bu cihazda kayıtlı':'Kayıt kullanılamıyor';
  }
  function tell(message) {
    const toast=$('#toast'); toast.textContent=message; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove('show'),3200);
  }
  function unitPercent(unit) { return Math.round(unit.sections.filter(section=>state.read[section.id]).length/unit.sections.length*100); }
  function solvedCount() { return QUESTIONS.filter(q=>state.answers[q.id]?.checked).length; }
  function correctCount() { return QUESTIONS.filter(q=>state.answers[q.id]?.checked&&state.answers[q.id].choice===q.answer).length; }
  function wrongQuestions() { return QUESTIONS.filter(q=>state.wrong[q.id]); }
  function unitOptions(value, all=true) { return `${all?`<option value="all" ${value==='all'?'selected':''}>Tüm üniteler</option>`:''}${UNITS.map(unit=>`<option value="${unit.id}" ${unit.id===value?'selected':''}>${String(unit.number).padStart(2,'0')} · ${esc(unit.subtitle)}</option>`).join('')}`; }
  function pageHead(eyebrow,title,description='') { return `<div class="page-head"><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1>${description?`<p class="description">${esc(description)}</p>`:''}</div>`; }
  function breadcrumbs(unit,tail='Konu anlatımı') { return `<div class="breadcrumbs"><a href="#home">Genel bakış</a><span>/</span><a href="#unit/${unit.id}">${esc(unit.subtitle)}</a><span>/ ${esc(tail)}</span></div>`; }
  function empty(title,text,action='') { return `<div class="empty"><h2>${esc(title)}</h2><p>${esc(text)}</p>${action?`<div class="actions" style="justify-content:center;margin-top:23px">${action}</div>`:''}</div>`; }
  function formatPassage(text) { return text.split(/\n\s*\n/).map(part=>`<p>${esc(part)}</p>`).join(''); }
  function tableHTML(table) { return table?`<div class="table-wrap"><table><thead><tr>${table.head.map(cell=>`<th scope="col">${esc(cell)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''; }

  function home() {
    const last=state.last&&UNIT_MAP.has(state.last.unitId)?state.last:{unitId:UNITS[0].id,sectionId:UNITS[0].sections[0].id};
    const done=UNITS.reduce((sum,unit)=>sum+unit.sections.filter(section=>state.read[section.id]).length,0);
    return `<section class="hero"><div><p class="eyebrow">YDS / GRAMMAR STUDIO</p><h1>Dil bilgisini kur.<br><em>Cümleyi daha iyi oku.</em></h1><p class="lead">Zamanlardan bağlaçlara, cümlenin bütün parçaları. Türkçe açıklamalarla öğren; örneklerle pekiştir, sorularla kendini yokla.</p><div class="actions"><a class="button primary" href="#unit/${last.unitId}/${last.sectionId}">${state.last?'Kaldığım yerden devam et':'Konu çalışmaya başla'} <span aria-hidden="true">↗</span></a><a class="button" href="#test">${state.exam?(state.exam.submitted?'Son testini gör':'Teste dön'):'Çalışma testi hazırla'} <span aria-hidden="true">→</span></a></div></div><div class="hero-sheet" aria-label="Model cümle: Because the evidence was limited, the claim was revised. Bağlaç, özne ve yüklem örneği."><span class="sheet-label">ÖNCE CÜMLENİN İSKELETİNİ GÖR.</span><p class="grammar-sentence"><span class="clause">Because</span> the evidence<br>was limited, <span class="subject">the claim</span><br><span class="verb">was revised.</span></p><div class="grammar-key"><span class="clause"><i></i> Bağlaç</span><span class="subject"><i></i> Özne</span><span class="verb"><i></i> Yüklem</span></div><p class="sheet-note">Kanıtlar sınırlı olduğu için iddia yeniden değerlendirildi.<br>Bağlacı bul. Ana cümleyi ayır. Anlamı takip et.</p></div></section><div class="stats"><div class="stat"><strong>12</strong><span>ana ünite<br>${DATA.summary.sections} konu anlatımı</span></div><div class="stat"><strong>${DATA.summary.questions}</strong><span>açıklamalı soru<br>5 seçenekli çalışmalar</span></div><div class="stat"><strong>${DATA.summary.vocabulary}</strong><span>kelime / öbek kartı<br>12 okuma metni</span></div><div class="stat"><strong>${done}</strong><span>çalışılan konu<br>${solvedCount()} soru kontrol edildi</span></div></div><div class="section-heading"><h2>Konu haritan</h2><span>${done} / ${DATA.summary.sections} konu tamamlandı</span></div><div class="unit-grid">${UNITS.map(unit=>`<a href="#unit/${unit.id}" class="unit-card"><span class="unit-card-top"><span class="unit-card-number">${String(unit.number).padStart(2,'0')}</span><span class="unit-card-range">KAYNAK · S. ${esc(unit.pages)}</span></span><h3>${esc(unit.title)}</h3><p>${esc(unit.subtitle)}<br>${unit.sections.length} konu · ${unit.questions.length} alıştırma</p><span class="unit-card-bottom"><span class="progress-track" role="progressbar" aria-label="${esc(unit.subtitle)} çalışılan konular" aria-valuenow="${unitPercent(unit)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${unitPercent(unit)}%"></i></span><span class="progress-label"><span>${unit.sections.filter(section=>state.read[section.id]).length} / ${unit.sections.length} konu</span><span>%${unitPercent(unit)} ↗</span></span></span></a>`).join('')}</div><div class="section-heading"><h2>Çalışmanı gör</h2><span>İlerleme bu tarayıcıda saklanır.</span></div><div class="stats"><div class="stat"><strong>${correctCount()}</strong><span>doğru cevap<br>kontrol edilmiş sorularda</span></div><div class="stat"><strong>${wrongQuestions().length}</strong><span>tekrar edilecek soru<br>yanlış / cevapsız kaydı</span></div><div class="stat"><strong>${WORDS.filter(word=>state.words[word.id]).length}</strong><span>öğrenilen kelime<br>senin işaretlediğin kartlar</span></div><div class="stat"><strong>${state.history.length}</strong><span>tamamlanan test<br>son 20 test saklanır</span></div></div>`;
  }

  function questionCard(q,{exam=false,position=null}={}) {
    const unit=UNIT_MAP.get(q.unitId);
    const response=exam?{choice:state.exam.choices[q.id],checked:state.exam.submitted}:state.answers[q.id]||{};
    const checked=Boolean(response.checked);
    const correct=response.choice===q.answer;
    const label={grammar:'Dil bilgisi',translation:'Çeviri',meaning:'Anlam',reading:'Okuduğunu anlama'}[q.type];
    const passage=q.type==='reading'?`<details class="passage" ${exam?'open':''}><summary>${esc(unit.reading.title)} · Metni oku</summary>${formatPassage(unit.reading.text)}</details>`:'';
    return `<article class="quiz-card" id="question-${q.id}"><div class="quiz-card-top"><span>${position===null?'':`${position}. `}${esc(label)}</span><span>ÜNİTE ${String(unit.number).padStart(2,'0')}</span></div>${passage}<h3>${esc(q.prompt)}</h3><div class="quiz-options" role="group" aria-label="${esc(q.id)} cevap seçenekleri">${q.options.map((option,index)=>`<button type="button" class="answer-choice ${response.choice===index?'picked':''} ${checked&&index===q.answer?'correct':''} ${checked&&response.choice===index&&!correct?'wrong':''}" data-action="choose" data-question="${q.id}" data-index="${index}" data-exam="${exam?'true':'false'}" aria-pressed="${response.choice===index}" ${checked?'disabled':''}><span class="letter" aria-hidden="true">${String.fromCharCode(65+index)}</span><span>${esc(option)}</span></button>`).join('')}</div>${!exam?`<div class="quiz-card-actions"><div class="actions">${!checked?`<button class="button primary small" type="button" data-action="grade" data-question="${q.id}" ${response.choice===undefined?'disabled':''}>Kontrol et</button>`:`<button class="button small" type="button" data-action="retry" data-question="${q.id}">Yeniden dene ↺</button>`}</div>${q.sectionId?`<a href="#unit/${unit.id}/${q.sectionId}" class="question-topic-link">Konuya dön ↗</a>`:`<a href="#reading/${unit.id}" class="question-topic-link">Okuma çalışmasına dön ↗</a>`}</div>`:''}${checked?`<div class="feedback ${correct?'':'bad'}"><strong>${correct?'✓ Doğru cevap':response.choice===undefined?'Boş bırakıldı':'Cevabı birlikte inceleyelim'} · ${String.fromCharCode(65+q.answer)}</strong><p>${esc(q.explanation)}</p></div>`:''}</article>`;
  }

  function unitPage(unit,sectionId) {
    const section=unit.sections.find(item=>item.id===sectionId)||unit.sections[0];
    const index=unit.sections.indexOf(section);
    state.last={unitId:unit.id,sectionId:section.id};
    save();
    const related=QUESTIONS.filter(q=>q.unitId===unit.id&&q.sectionId===section.id);
    return `${breadcrumbs(unit)}${pageHead(`ÜNİTE ${String(unit.number).padStart(2,'0')} / KAYNAK S. ${unit.pages}`,unit.title,unit.description)}<div class="unit-toolbar"><div class="unit-select"><label for="section-select">Konuyu seç</label><select id="section-select" data-change="section" data-unit="${unit.id}">${unit.sections.map((item,i)=>`<option value="${item.id}" ${item.id===section.id?'selected':''}>${String(i+1).padStart(2,'0')} · ${esc(item.title)}${state.read[item.id]?' ✓':''}</option>`).join('')}</select></div><span class="topic-count">${unit.sections.filter(item=>state.read[item.id]).length} / ${unit.sections.length} çalışıldı</span><a class="button small" href="#bank/${unit.id}">Ünite soruları ↗</a></div><div class="topic-layout"><article class="topic-article"><div class="topic-title-row"><h2>${esc(section.title)}</h2><button type="button" class="read-toggle" data-action="read" data-section="${section.id}" aria-pressed="${Boolean(state.read[section.id])}">${state.read[section.id]?'✓ Çalışıldı':'Çalışıldı olarak işaretle'}</button></div><p class="topic-lead">${esc(section.lead)}</p><div class="rule-panel"><h3 class="small-title">Kuralı kur</h3><ol>${section.rules.map(rule=>`<li>${esc(rule)}</li>`).join('')}</ol></div>${tableHTML(section.table)}<div class="section-heading"><h2>Örnekte gör</h2></div><div class="example-grid">${section.examples.map(example=>`<div class="example"><p class="en">${esc(example.en)}</p><p class="tr">${esc(example.tr)}</p><p class="note">${esc(example.note)}</p></div>`).join('')}</div><div class="pitfalls"><h3 class="small-title">Bu ayrımlara dikkat et</h3><ul>${section.pitfalls.map(pitfall=>`<li>${esc(pitfall)}</li>`).join('')}</ul></div><div class="topic-notes"><label for="topic-note">Kendi notum</label><textarea id="topic-note" data-note="${section.id}" maxlength="1800" placeholder="Bir örnek cümle, karıştırdığın bir ayrım, hatırlamak istediğin bir ipucu…">${esc(state.notes[section.id]||'')}</textarea><small>Bu not yalnızca bu tarayıcıda saklanır.</small></div><div class="section-heading"><h2>Soruda dene</h2><span>${related.length} açıklamalı soru</span></div>${related.length?related.map((q,i)=>questionCard(q,{position:i+1})).join(''):empty('Ünite alıştırmalarına geç.','Bu başlığı farklı konularla birlikte kullanmak için ünite sorularını çöz.',`<a href="#bank/${unit.id}" class="button primary">Ünite sorularını aç ↗</a>`)}<div class="topic-neighbors">${index>0?`<a class="button" href="#unit/${unit.id}/${unit.sections[index-1].id}">← ${esc(unit.sections[index-1].title)}</a>`:'<span></span>'}${index<unit.sections.length-1?`<a class="button primary" href="#unit/${unit.id}/${unit.sections[index+1].id}">${esc(unit.sections[index+1].title)} →</a>`:`<a class="button primary" href="#reading/${unit.id}">Ünite okumasına geç →</a>`}</div></article><aside class="topic-aside" aria-label="Ünitenin konu listesi"><h3>BU ÜNİTEDE</h3>${unit.sections.map((item,i)=>`<a href="#unit/${unit.id}/${item.id}" class="${item.id===section.id?'active':''}"><span class="step-number">${String(i+1).padStart(2,'0')}</span><span>${esc(item.title)}</span>${state.read[item.id]?'<span class="done-mark">✓</span>':''}</a>`).join('')}</aside></div>`;
  }

  function filteredQuestions() {
    const search=norm(ui.bankSearch);
    return QUESTIONS.filter(q=>(ui.bankUnit==='all'||q.unitId===ui.bankUnit)&&(ui.bankType==='all'||q.type===ui.bankType)&&(!ui.bankUnsolved||!state.answers[q.id]?.checked)&&norm(`${q.prompt} ${UNIT_MAP.get(q.unitId).subtitle}`).includes(search));
  }
  function bank() {
    const questions=filteredQuestions();
    const pages=Math.max(1,Math.ceil(questions.length/8));
    ui.bankPage=Math.max(0,Math.min(ui.bankPage,pages-1));
    const shown=questions.slice(ui.bankPage*8,ui.bankPage*8+8);
    return `${pageHead('ALIŞTIRMA / AÇIKLAMALI SORULAR','Soru bankası','Önce seçimini yap, ardından kontrol et. Açıklama, doğru seçeneğin gerekçesini ve dikkat etmen gereken ayrımı gösterir.')}<div class="actions" style="margin-bottom:20px"><button class="button primary" data-action="test-from-bank">Seçili üniteden test hazırla ↗</button></div><div class="filters"><label>Ünite<select data-change="bank-unit">${unitOptions(ui.bankUnit)}</select></label><label>Soru türü<select data-change="bank-type">${[['all','Tüm sorular'],['grammar','Dil bilgisi'],['translation','Çeviri'],['meaning','Anlam'],['reading','Okuma']].map(([value,label])=>`<option value="${value}" ${ui.bankType===value?'selected':''}>${label}</option>`).join('')}</select></label><label class="filter-search">Ara<input type="search" id="bank-search" data-search="bank" value="${esc(ui.bankSearch)}" placeholder="Soru veya konu içinde ara…"></label><label class="checkbox-label"><input type="checkbox" data-change="bank-unsolved" ${ui.bankUnsolved?'checked':''}> Çözdüklerimi gizle</label></div><div class="list-summary"><span>${questions.length} soru · Sayfa ${ui.bankPage+1}/${pages}</span><span>${solvedCount()} soru kontrol edildi</span></div>${shown.length?shown.map((q,i)=>questionCard(q,{position:ui.bankPage*8+i+1})).join(''):empty('Bu filtrede soru bulunamadı.','Üniteyi veya soru türünü değiştir; arama kelimesini temizlemeyi de deneyebilirsin.')}<div class="pagination"><button class="button small" data-action="bank-prev" ${ui.bankPage===0?'disabled':''}>← Önceki</button><span>${ui.bankPage+1} / ${pages}</span><button class="button small" data-action="bank-next" ${ui.bankPage>=pages-1?'disabled':''}>Sonraki →</button></div>`;
  }

  function readingPage(unit) {
    if (!unit) return `${pageHead('OKUMA / ANLAM VE BAĞLANTI','Okuma atölyesi','Her metin, ilgili ünitenin yapılarının doğal bir bağlamda kullanıldığı özgün bir akademik okumadır. Ana fikri, çıkarımı ve sözcüklerin metindeki işlevini birlikte çalış.')}<div class="reading-picker">${UNITS.map(item=>`<a href="#reading/${item.id}" class="reading-link"><p class="eyebrow">ÜNİTE ${String(item.number).padStart(2,'0')}</p><h3>${esc(item.reading.title)}</h3><p>${esc(item.subtitle)}<br>${item.reading.text.trim().split(/\s+/).length} kelime · 3 açıklamalı soru</p></a>`).join('')}</div>`;
    return `${breadcrumbs(unit,'Okuma çalışması')}${pageHead(`OKUMA / ÜNİTE ${String(unit.number).padStart(2,'0')}`,unit.reading.title,'İlk okumada genel anlamı takip et. İkinci okumada bağlaçları, ana yüklemleri ve ilgili dil bilgisi yapılarını fark et.')}<div class="actions"><a class="button small" href="#unit/${unit.id}">Konu anlatımını aç ↗</a><a class="button small" href="#reading">Tüm okumalar</a></div><div class="reading-text">${formatPassage(unit.reading.text)}</div><p class="reading-hint">Küçük bir çalışma: Her cümlenin ana öznesini ve yüklemini bul. Sonra ünitenin konusuyla ilişkili bir yapıyı seçerek cümleye kattığı anlamı kendi sözlerinle açıkla.</p><div class="section-heading"><h2>Metni soruda oku</h2><span>3 açıklamalı soru</span></div>${QUESTIONS.filter(q=>q.unitId===unit.id&&q.type==='reading').map((q,i)=>questionCard(q,{position:i+1})).join('')}`;
  }

  function vocab() {
    const query=norm(ui.wordSearch);
    const words=WORDS.filter(word=>(ui.wordUnit==='all'||word.unitId===ui.wordUnit)&&(ui.wordMode!=='learning'||!state.words[word.id])&&(ui.wordMode!=='known'||state.words[word.id])&&norm(`${word.word} ${word.meaning}`).includes(query));
    return `${pageHead('KELİME / BAĞLAM / KULLANIM','Kelime kartları','Önce kelimeyi hatırlamayı dene. Kartı çevir, Türkçesini ve örnek cümledeki kullanımını gör; öğrendiklerini kendin işaretle.')}<div class="filters"><label>Ünite<select data-change="word-unit">${unitOptions(ui.wordUnit)}</select></label><label>Kartlar<select data-change="word-mode">${[['all','Tüm kartlar'],['learning','Çalışacaklarım'],['known','Öğrendiklerim']].map(([value,label])=>`<option value="${value}" ${ui.wordMode===value?'selected':''}>${label}</option>`).join('')}</select></label><label class="filter-search">Ara<input id="word-search" type="search" data-search="word" value="${esc(ui.wordSearch)}" placeholder="İngilizce veya Türkçe ara…"></label></div><div class="list-summary"><span>${words.length} kart</span><span>${WORDS.filter(word=>state.words[word.id]).length} / ${WORDS.length} öğrenildi</span></div>${words.length?`<div class="vocab-grid">${words.map(word=>`<article class="vocab-card ${state.words[word.id]?'known':''}"><div class="vocab-top"><span>ÜNİTE ${String(UNIT_MAP.get(word.unitId).number).padStart(2,'0')}</span><span>${esc(word.pos)}</span></div><h3>${esc(word.word)}</h3>${ui.flipped.has(word.id)?`<p class="meaning">${esc(word.meaning)}</p><p class="word-example">${esc(word.example)}</p>`:'<p class="flip-hint">Anlamını hatırlayabiliyor musun?</p>'}<div class="vocab-controls"><button type="button" class="flip-word" data-action="flip" data-word="${word.id}" aria-pressed="${ui.flipped.has(word.id)}">${ui.flipped.has(word.id)?'Anlamı gizle ↺':'Kartı çevir ↗'}</button><button type="button" data-action="known" data-word="${word.id}" aria-pressed="${Boolean(state.words[word.id])}">${state.words[word.id]?'✓ Öğrendim':'Öğrendim'}</button></div></article>`).join('')}</div>`:empty('Bu filtrede kart yok.','Başka bir ünite veya kart grubu seçmeyi dene.')}`;
  }

  function mistakes() {
    const questions=wrongQuestions();
    return `${pageHead('TEKRAR / YANLIŞLARDAN ÖĞREN','Yanlış defteri','Yanlış cevapladığın veya çalışma testinde boş bıraktığın sorular burada toplanır. Konuya geri dön, ardından soruyu yeniden dene. Doğru kontrol edilen soru bu listeden çıkar.')}<div class="list-summary"><span>${questions.length} soru tekrar bekliyor</span><span>Her soru ilgili konuya bağlıdır.</span></div>${questions.length?questions.map((q,i)=>questionCard(q,{position:i+1})).join(''):empty('Henüz tekrar kaydı yok.','Soru bankasında kontrol ettiğin yanlış cevaplar burada görünecek.',`<a href="#bank" class="button primary">Soru bankasını aç ↗</a>`)}`;
  }

  function plan() {
    return `${pageHead('ÇALIŞMA / KÜÇÜK ADIMLAR','Altı haftalık konu rotası','Haftada iki ünite önerisiyle bütün konu haritasını dolaş. Bu esnek bir çalışma sırasıdır; hızını kendin belirleyebilir, bir haftaya daha fazla zaman ayırabilirsin.')}<div class="plan-instructions"><span class="small-title">Her ünitede aynı döngü</span><ol><li>Konu anlatımını oku; örneklerde ana yapıyı fark et.</li><li>Ünite sorularını çöz ve gerekçelerini incele.</li><li>Okuma metnindeki yapıları bul, üç soruyu cevapla.</li><li>Kelime kartlarını tekrar et; yanlış defterine geri dön.</li></ol></div><div class="week-grid">${Array.from({length:6},(_,index)=>{const group=UNITS.slice(index*2,index*2+2);return `<section class="week-card"><p class="eyebrow">${index+1}. HAFTA / ÖNERİLEN ROTA</p><h3>${esc(group.map(unit=>unit.subtitle).join(' + '))}</h3>${group.map(unit=>`<div class="plan-unit"><a href="#unit/${unit.id}"><strong>${String(unit.number).padStart(2,'0')} · ${esc(unit.title)}</strong><small>${unit.sections.filter(section=>state.read[section.id]).length} / ${unit.sections.length} konu çalışıldı</small></a><label class="plan-check"><input type="checkbox" data-change="plan-unit" data-unit="${unit.id}" ${state.plan[unit.id]?'checked':''}> Tamam</label></div>`).join('')}</section>`;}).join('')}</div><div class="source-panel"><h2>Notların da bir çalışma izi.</h2><p>Konu sayfalarındaki “Kendi notum” alanları sana ait örnekleri ve karıştırdığın ayrımları saklar. Konuyu çalıştı olarak işaretlemek ile haftalık plan kutusunu işaretlemek birbirinden bağımsızdır; rota tamamlamayı sen belirlersin.</p></div>`;
  }

  function source() {
    return `${pageHead('KAYNAK / KAPSAM / KULLANIM','Bu çalışma alanı nasıl kuruldu?','Konu haritası, yüklenen English Grammar Inside and Out dosyasındaki 12 ana ünite ve ekler temel alınarak hazırlandı.')}<div class="source-grid"><section class="source-panel"><h2>Kaynak konu haritası</h2><p><strong>${esc(DATA.source.title)}</strong><br>${esc(DATA.source.author)} · ${esc(DATA.source.publisher)}<br>Yüklenen PDF: ${DATA.source.pages} sayfa.</p><p>Bu site için Türkçe anlatımlar, İngilizce örnekler, soru açıklamaları, okuma metinleri ve kelime kartları hazırlanmıştır. Ünite başlıklarının altında dosyadaki ilgili sayfa aralığı gösterilir.</p><p>Kitabın edat ve phrasal verb ekleri, 11 ve 12. ünitelerdeki kullanım tabloları ve kelime öbekleriyle çalışılır.</p></section><section class="source-panel"><h2>Nasıl kullanabilirim?</h2><ul><li>Konu haritasından bir ünite seç, alt başlıklar arasında ilerle.</li><li>Alıştırmalarda bir seçenek seçtikten sonra “Kontrol et” ile açıklamayı aç.</li><li>Çalışma testinde soruları en sona kadar cevaplayıp topluca değerlendir.</li><li>A+ ile metinleri büyüt; yazdır düğmesiyle mevcut ekranı yazdır.</li></ul></section></div><section class="source-panel"><h2>12 ünitenin kaynak aralığı</h2><ul class="source-list">${UNITS.map(unit=>`<li><a href="#unit/${unit.id}">${String(unit.number).padStart(2,'0')} · ${esc(unit.title)}</a><span>S. ${esc(unit.pages)}</span></li>`).join('')}</ul></section><section class="source-panel"><h2>Kayıtlarım nerede?</h2><p>Çalışıldı işaretleri, soru cevapları, yanlış defteri, notlar, kelime kartları ve çalışma planı bu tarayıcıda saklanır. Başka cihazlarla eşitlenmez. Tarayıcı verilerini temizlersen bu kayıtlar silinir; gizli pencerede kalıcı olmayabilir.</p><p>Test sonuçları doğru, yanlış ve boş sayıları ile doğruluk oranını gösterir. Çalışma testleri bu sitenin soru bankasından oluşturulur.</p><p>Sitenin içeriklerini güncelleme ve ders yükleme işlemleri, ders panelinin GitHub deposunda yetkili hesap üzerinden yapılır.</p></section>`;
  }

  function testPool() { return QUESTIONS.filter(q=>(ui.testUnit==='all'||q.unitId===ui.testUnit)&&(ui.testReading||q.type!=='reading')); }
  function testSetup() {
    const pool=testPool();
    const counts=[...new Set([10,20,40,pool.length].filter(n=>n>0&&n<=pool.length))].sort((a,b)=>a-b);
    if (!counts.includes(Number(ui.testCount))) ui.testCount=counts.includes(20)?20:counts[0];
    return `${pageHead('ÇALIŞMA TESTİ / KENDİNİ YOKLA','Kendi testini hazırla.','Sorular seçtiğin ünitelerden rastgele gelir. Seçenekler ve sorular üzerinde ilerleyebilir; değerlendirmeyi testi bitirdiğinde topluca görebilirsin.')}<form id="test-form" class="test-setup"><div class="test-fields"><div class="test-field wide"><label for="test-unit">Üniteler</label><select id="test-unit" data-change="test-unit">${unitOptions(ui.testUnit)}</select></div><div class="test-field"><label for="test-count">Soru sayısı</label><select id="test-count" data-change="test-count">${counts.map(count=>`<option value="${count}" ${count===Number(ui.testCount)?'selected':''}>${count} soru</option>`).join('')}</select></div><div class="test-field"><label for="test-minutes">Süre</label><select id="test-minutes" data-change="test-minutes">${[0,15,30,45,60].map(minutes=>`<option value="${minutes}" ${minutes===Number(ui.testMinutes)?'selected':''}>${minutes?`${minutes} dakika`:'Süresiz'}</option>`).join('')}</select></div></div><label class="plan-check"><input type="checkbox" data-change="test-reading" ${ui.testReading?'checked':''}> Okuma sorularını da dahil et</label><p class="test-note">Bu seçimde ${pool.length} soru var. Süreli testte kalan süre dolduğunda verilen cevaplar değerlendirilir. Testin ve cevapların bu cihazda saklanır.</p><button class="button primary" type="submit">Testi başlat →</button></form>`;
  }
  function timeText() {
    if (!state.exam?.minutes) return 'Süresiz';
    const remaining=Math.max(0,Math.ceil((state.exam.started+state.exam.minutes*60000-Date.now())/1000));
    return `${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
  }
  function examExpired() { return Boolean(state.exam&&!state.exam.submitted&&state.exam.minutes>0&&Date.now()>=state.exam.started+state.exam.minutes*60000); }
  function testPage() {
    if (!state.exam) return testSetup();
    const exam=state.exam;
    if (exam.submitted) return testResults();
    const q=QUESTION_MAP.get(exam.ids[exam.index]);
    const answered=exam.ids.filter(id=>exam.choices[id]!==undefined).length;
    return `${pageHead('ÇALIŞMA TESTİ / CEVAPLAR SONDA','Bir soru, bir ayrım.')}<div class="test-toolbar"><span>${exam.index+1} / ${exam.ids.length} soru · ${answered} cevaplandı</span><strong id="test-timer" aria-label="Kalan süre">${timeText()}</strong></div><div class="test-dots" aria-label="Test soruları">${exam.ids.map((id,index)=>`<button type="button" data-action="test-go" data-index="${index}" class="${index===exam.index?'current':''} ${exam.choices[id]!==undefined?'answered':''}" aria-label="${index+1}. soru${exam.choices[id]!==undefined?', cevaplandı':''}" ${index===exam.index?'aria-current="step"':''}>${index+1}</button>`).join('')}</div>${questionCard(q,{exam:true,position:exam.index+1})}<div class="actions"><button class="button" data-action="test-prev" ${exam.index===0?'disabled':''}>← Önceki soru</button><button class="button primary" data-action="test-next" ${exam.index===exam.ids.length-1?'disabled':''}>Sonraki soru →</button><button class="button quiet" data-action="test-finish">Testi bitir ve değerlendir</button></div><p class="test-note">${exam.ids.length-answered} soru henüz cevaplanmadı. Sorular arasında gezinirken seçimlerin saklanır.</p>`;
  }
  function testResults() {
    const exam=state.exam;
    const correct=exam.ids.filter(id=>exam.choices[id]===QUESTION_MAP.get(id).answer).length;
    const blank=exam.ids.filter(id=>exam.choices[id]===undefined).length;
    const wrong=exam.ids.length-correct-blank;
    const groups=UNITS.map(unit=>{const ids=exam.ids.filter(id=>QUESTION_MAP.get(id).unitId===unit.id);return {unit,total:ids.length,correct:ids.filter(id=>exam.choices[id]===QUESTION_MAP.get(id).answer).length};}).filter(group=>group.total);
    return `${pageHead('ÇALIŞMA TESTİ / DEĞERLENDİRME','Sonuçlarını birlikte incele.',exam.expired?'Süre doldu; kaydedilen cevaplar değerlendirildi.':'Doğru seçeneğin gerekçesini oku ve eksik kalan konulara geri dön.')}<div class="test-results"><div class="result-stat"><strong>${correct} / ${exam.ids.length}</strong><span>DOĞRU CEVAP</span></div><div class="result-stat"><strong>%${Math.round(correct/exam.ids.length*100)}</strong><span>BU TESTTE DOĞRULUK</span></div><div class="result-stat"><strong>${wrong} / ${blank}</strong><span>YANLIŞ / BOŞ</span></div></div><div class="actions"><button class="button primary" data-action="test-new">Yeni test hazırla →</button><a class="button" href="#mistakes">Yanlış defterini aç ↗</a></div><div class="result-breakdown">${groups.map(group=>`<div class="result-unit"><strong>${esc(group.unit.subtitle)}</strong>${group.correct} / ${group.total} doğru</div>`).join('')}</div><div class="section-heading"><h2>Cevapların ve gerekçeleri</h2><span>${exam.ids.length} soru</span></div>${exam.ids.map((id,index)=>questionCard(QUESTION_MAP.get(id),{exam:true,position:index+1})).join('')}`;
  }

  function submitExam(expired=false) {
    if (!state.exam||state.exam.submitted) return;
    expired=expired||examExpired();
    const exam=state.exam;
    exam.submitted=true; exam.expired=expired; exam.finished=Date.now();
    let correct=0;
    for (const id of exam.ids) {
      const q=QUESTION_MAP.get(id),choice=exam.choices[id];
      state.answers[id]={choice,checked:true,attempts:(state.answers[id]?.attempts||0)+1};
      if (choice===q.answer) {correct++;delete state.wrong[id];} else state.wrong[id]=true;
    }
    state.history.push({finished:exam.finished,count:exam.ids.length,correct}); state.history=state.history.slice(-20);
    save(); render({scroll:true});
    tell(expired?'Süre doldu. Test sonuçların hazır.':'Test tamamlandı. Gerekçeleri inceleyebilirsin.');
  }
  function startExam() {
    const pool=[...testPool()];
    for (let i=pool.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    const ids=pool.slice(0,Math.min(Number(ui.testCount)||20,pool.length)).map(q=>q.id);
    if (!ids.length) {tell('Bu seçimde soru bulunamadı.');return;}
    state.exam={ids,choices:{},index:0,started:Date.now(),minutes:Number(ui.testMinutes)||0,submitted:false};
    save(); render({scroll:true});
  }

  function route() {
    let parts;
    try { parts=decodeURIComponent(location.hash.slice(1)).split('/'); } catch(_){parts=['home'];}
    const view=['home','unit','bank','reading','vocab','mistakes','plan','source','test'].includes(parts[0])?parts[0]:'home';
    return {view,unit:UNIT_MAP.get(parts[1]),sectionId:parts[2]};
  }
  function closeMenu() {document.body.classList.remove('menu-open');$('#menu-button').setAttribute('aria-expanded','false');$('#workspace').inert=false;}
  function go(hash) {if (location.hash===`#${hash}`) render({scroll:true});else location.hash=hash;}
  function render({scroll=false,preserveFocus=false}={}) {
    if(examExpired()){submitExam(true);return;}
    const active=preserveFocus?document.activeElement:null;
    const focusId=active?.id;
    const selection=active&&typeof active.selectionStart==='number'?active.selectionStart:null;
    currentRoute=route();
    if (currentRoute.view==='bank'&&currentRoute.unit) ui.bankUnit=currentRoute.unit.id;
    let html;
    switch(currentRoute.view) {
      case 'unit': html=unitPage(currentRoute.unit||UNITS[0],currentRoute.sectionId); break;
      case 'bank':html=bank();break;
      case 'reading':html=readingPage(currentRoute.unit);break;
      case 'vocab':html=vocab();break;
      case 'mistakes':html=mistakes();break;
      case 'plan':html=plan();break;
      case 'source':html=source();break;
      case 'test':html=testPage();break;
      default:html=home();
    }
    $('#workspace').innerHTML=html;
    document.body.classList.toggle('large-type',Boolean(state.large));
    $('#font-button').setAttribute('aria-pressed',String(Boolean(state.large)));
    document.querySelectorAll('[data-nav]').forEach(link=>{const activeNav=link.dataset.nav===currentRoute.view;link.classList.toggle('active',activeNav);if(activeNav)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    document.querySelectorAll('#unit-nav a').forEach(link=>{const selected=currentRoute.view==='unit'&&link.dataset.unit===(currentRoute.unit||UNITS[0]).id;link.classList.toggle('active',selected);if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    $('#mistake-badge').textContent=wrongQuestions().length;
    if (scroll) {closeMenu();window.scrollTo({top:0,behavior:'instant'});$('#workspace').focus({preventScroll:true});}
    if (focusId) {const input=document.getElementById(focusId);if(input){input.focus({preventScroll:true});if(selection!==null&&typeof input.setSelectionRange==='function')try{input.setSelectionRange(selection,selection);}catch(_){}}}
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-action]');
    if (!button||button.disabled) return;
    const action=button.dataset.action;
    if(examExpired()&&((action==='choose'&&button.dataset.exam==='true')||['test-finish','test-go','test-prev','test-next'].includes(action))){submitExam(true);return;}
    if (action==='menu') {const open=!document.body.classList.contains('menu-open');document.body.classList.toggle('menu-open',open);$('#menu-button').setAttribute('aria-expanded',String(open));$('#workspace').inert=open;if(open)requestAnimationFrame(()=>{if(document.body.classList.contains('menu-open'))$('#sidebar .studio-brand').focus();});return;}
    if (action==='close-menu') {closeMenu();$('#menu-button').focus();return;}
    if (action==='font') {state.large=!state.large;save();document.body.classList.toggle('large-type',state.large);button.setAttribute('aria-pressed',String(state.large));return;}
    if (action==='print') {window.print();return;}
    if (action==='choose') {
      const id=button.dataset.question,choice=Number(button.dataset.index);
      if (!QUESTION_MAP.has(id)||!Number.isInteger(choice)||choice<0||choice>4) return;
      if (button.dataset.exam==='true') {if(!state.exam||state.exam.submitted)return;state.exam.choices[id]=choice;}
      else {if(state.answers[id]?.checked)return;state.answers[id]={...state.answers[id],choice,checked:false};}
      save();render();document.querySelector(`#question-${id} [data-index="${choice}"]`)?.focus({preventScroll:true});return;
    }
    if (action==='grade') {
      const id=button.dataset.question,q=QUESTION_MAP.get(id),answer=state.answers[id];
      if(!q||!answer||answer.choice===undefined||answer.checked)return;
      answer.checked=true;answer.attempts=(answer.attempts||0)+1;
      if(answer.choice===q.answer){delete state.wrong[id];tell('Doğru. Açıklamayı da incele.');}else{state.wrong[id]=true;tell('Soru yanlış defterine eklendi.');}
      save();render();document.getElementById(`question-${id}`)?.scrollIntoView({block:'nearest',behavior:'instant'});return;
    }
    if(action==='retry'){const id=button.dataset.question;if(QUESTION_MAP.has(id)){state.answers[id]={attempts:state.answers[id]?.attempts||0};save();render();}return;}
    if(action==='read'){const id=button.dataset.section;state.read[id]=!state.read[id];save();render();tell(state.read[id]?'Konu çalışıldı olarak işaretlendi.':'Çalışıldı işareti kaldırıldı.');return;}
    if(action==='flip'){const id=button.dataset.word;ui.flipped.has(id)?ui.flipped.delete(id):ui.flipped.add(id);render();return;}
    if(action==='known'){const id=button.dataset.word;state.words[id]=!state.words[id];save();render();return;}
    if(action==='bank-prev'||action==='bank-next'){ui.bankPage+=action==='bank-next'?1:-1;render({scroll:true});return;}
    if(action==='test-from-bank'){ui.testUnit=ui.bankUnit;if(!state.exam)go('test');else{go('test');tell(state.exam.submitted?'Önceki testin sonucu açık. Yeni test düğmesiyle devam edebilirsin.':'Devam eden testini tamamlayabilirsin.');}return;}
    if(action==='test-new'){state.exam=null;save();go('test');return;}
    if(action==='test-finish'){submitExam();return;}
    if(action==='test-go'&&state.exam&&!state.exam.submitted){state.exam.index=Math.max(0,Math.min(Number(button.dataset.index),state.exam.ids.length-1));save();render({scroll:true});return;}
    if((action==='test-prev'||action==='test-next')&&state.exam&&!state.exam.submitted){state.exam.index=Math.max(0,Math.min(state.exam.index+(action==='test-next'?1:-1),state.exam.ids.length-1));save();render({scroll:true});}
  });
  document.addEventListener('change',event=>{
    const input=event.target,kind=input.dataset.change;
    if(!kind)return;
    if(kind==='section'){go(`unit/${input.dataset.unit}/${input.value}`);return;}
    if(kind==='bank-unit'){ui.bankUnit=input.value;ui.bankPage=0;if(currentRoute.unit)go('bank');else render();return;}
    if(kind==='bank-type'){ui.bankType=input.value;ui.bankPage=0;render();return;}
    if(kind==='bank-unsolved'){ui.bankUnsolved=input.checked;ui.bankPage=0;render();return;}
    if(kind==='word-unit'){ui.wordUnit=input.value;render();return;}
    if(kind==='word-mode'){ui.wordMode=input.value;render();return;}
    if(kind==='plan-unit'){state.plan[input.dataset.unit]=input.checked;save();return;}
    if(kind==='test-unit'){ui.testUnit=input.value;render();return;}
    if(kind==='test-count'){ui.testCount=Number(input.value);return;}
    if(kind==='test-minutes'){ui.testMinutes=Number(input.value);return;}
    if(kind==='test-reading'){ui.testReading=input.checked;render();}
  });
  document.addEventListener('input',event=>{
    const input=event.target;
    if(input.dataset.note){state.notes[input.dataset.note]=input.value.slice(0,1800);save();return;}
    if(input.dataset.search==='bank'){ui.bankSearch=input.value;ui.bankPage=0;render({preserveFocus:true});}
    if(input.dataset.search==='word'){ui.wordSearch=input.value;render({preserveFocus:true});}
  });
  document.addEventListener('submit',event=>{if(event.target.id==='test-form'){event.preventDefault();startExam();}});
  document.addEventListener('keydown',event=>{
    if(!document.body.classList.contains('menu-open'))return;
    if(event.key==='Escape'){closeMenu();$('#menu-button').focus();return;}
    if(event.key==='Tab'){
      const elements=[...document.querySelectorAll('#sidebar a[href], #sidebar button:not(:disabled)')];
      const first=elements[0],last=elements[elements.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  window.addEventListener('hashchange',()=>render({scroll:true}));
  const mobile=matchMedia('(max-width:760px)');
  mobile.addEventListener('change',()=>closeMenu());
  setInterval(()=>{
    if(!state.exam||state.exam.submitted||!state.exam.minutes)return;
    if(examExpired()){submitExam(true);return;}
    const timer=$('#test-timer');if(timer)timer.textContent=timeText();
  },1000);
  $('#unit-nav').innerHTML=UNITS.map(unit=>`<a href="#unit/${unit.id}" data-unit="${unit.id}"><span class="nav-number">${String(unit.number).padStart(2,'0')}</span><span class="unit-text">${esc(unit.subtitle)}</span></a>`).join('');
  save();render();
})();
