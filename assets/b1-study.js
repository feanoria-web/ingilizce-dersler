/* Extra teaching material lives beside the lesson; original questions and answer IDs stay intact. */
(() => {
  'use strict';
  const source = document.getElementById('english-b1-study-data');
  if (!source) return;
  const data = JSON.parse(source.textContent);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
  const array = value => Array.isArray(value) ? value : value ? [value] : [];
  const paragraphs = value => array(value).map(text => `<p>${esc(text)}</p>`).join('');
  const list = value => array(value).length ? `<ul>${array(value).map(text => `<li>${esc(text)}</li>`).join('')}</ul>` : '';
  const normalize = text => String(text).toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
  const state = { query: '', block: '', page: 0 };
  const perPage = 12;
  const audio = en => `<button type="button" class="b1sg-audio" data-b1-say="${esc(en)}" aria-label="İngilizce örneği dinle: ${esc(en)}">Dinle</button>`;
  function chunks(items) {
    return array(items).length ? `<dl class="b1sg-chunks">${items.map(item => `<div><dt lang="en">${esc(item.en)}</dt><dd><strong>${esc(item.tr)}</strong>${item.note ? `<p>${esc(item.note)}</p>` : ''}</dd></div>`).join('')}</dl>` : '';
  }
  function example(item, index, detailed = true) {
    return `<article class="b1sg-example"><div class="b1sg-example-heading"><span>Örnek ${index + 1}</span>${audio(item.en)}</div><p class="b1sg-en" lang="en">${esc(item.en)}</p><p class="b1sg-tr">${esc(item.tr)}</p>${paragraphs(item.why || item.note)}${detailed ? chunks(item.chunks) : ''}${item.variations?.length ? `<div class="b1sg-variations"><h5>Aynı yapıyla başka cümleler</h5>${item.variations.map(variant => `<p lang="en"><strong>${esc(variant.en)}</strong></p><p>${esc(variant.tr)}</p>${paragraphs(variant.note)}`).join('')}</div>` : ''}</article>`;
  }
  function pattern(item, index, screenId) {
    const id = `b1sg-${screenId}-${index}`;
    return `<details class="b1sg-topic" id="${esc(id)}" data-b1-help="hint"><summary><span class="b1sg-number">${index + 1}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.meaning)}</small></span></summary><div class="b1sg-topic-body">${paragraphs(item.explanation)}${array(item.formula).length ? `<div class="b1sg-formula"><h4>Cümleyi kurma yolu</h4>${list(item.formula)}</div>` : ''}<h4>Örnekleri adım adım inceleyelim</h4>${array(item.examples).map((entry, i) => example(entry, i)).join('')}${item.contrasts?.length ? `<h4>Benzer ifadelerle farkı</h4>${item.contrasts.map(entry => `<div class="b1sg-contrast"><h5>${esc(entry.label)}</h5>${paragraphs(entry.explanation)}${entry.example ? `<p lang="en"><strong>${esc(entry.example)}</strong></p>` : ''}${paragraphs(entry.tr)}</div>`).join('')}` : ''}${item.mistakes?.length ? `<h4>Sık yapılan hatalar ve düzeltmeleri</h4>${item.mistakes.map(entry => `<div class="b1sg-mistake"><p><span>Bu amaçla kullanma:</span> <s lang="en">${esc(entry.wrong)}</s></p><p><span>Doğru / amaçlanan biçim:</span> <strong lang="en">${esc(entry.right)}</strong></p>${paragraphs(entry.why)}</div>`).join('')}` : ''}${item.checks?.length ? `<h4>Şimdi sen dene</h4><p>Cevabı açmadan önce söyle veya bir kâğıda yaz. Ardından açıklamayla karşılaştır; farklı bir doğru cevap da mümkün olabilir.</p>${item.checks.map(entry => `<div class="b1sg-check"><p>${esc(entry.question)}</p><details data-b1-help="answer"><summary>Örnek cevabı ve nedenini göster</summary><div>${paragraphs(entry.answer)}${paragraphs(entry.why)}</div></details></div>`).join('')}` : ''}</div></details>`;
  }
  const chapterIndex = () => `<div class="b1sg-index">${[1, 2, 3].map(block => `<section><h3>${block}. bölüm</h3>${data.chapters.filter(chapter => chapter.block === block).map(chapter => `<button type="button" data-b1-goto="${esc(chapter.screenId)}">${esc(chapter.title)}</button>`).join('')}</section>`).join('')}</div>`;
  function teachingGuide() {
    return `<div class="b1sg-intro"><h2>Sınıfta bu rehberi nasıl yavaş ve anlaşılır işleriz?</h2><p>Bir başlıktaki bütün örnekleri peş peşe okumak yerine bir örnekte durun. Önce cümlenin ne söylemek istediğini sorun. Ardından özneyi, fiili, zaman veya yer bilgisini buldurun. Türkçe çeviriyi en başta vermek yerine öğrencinin anlam tahminini dinleyin; sonra birlikte karşılaştırın. Cevabı bilmemek hızlanmak için bir işaret değildir; aynı cümleyi daha küçük parçalara bölmek için bir fırsattır.</p><ol><li><strong>Anlamı kurun.</strong> Tek bir durum seçin: ev paylaşmak, damlayan bir musluk veya bir arkadaşa mektup. Öğrenci önce Türkçe olarak ne söyleyeceğini belirlesin. Sonra bu duruma uygun kalıbı bulsun. Böylece kelimeler bağlamdan kopuk bir listeye dönüşmez.</li><li><strong>Bir modeli birlikte inceleyin.</strong> İngilizce cümleyi okuyun, anlam gruplarını tek tek gösterin. “Burada neden on var?”, “Bu olumsuzluk yasak mı, zorunluluk yokluğu mu?” gibi küçük sorularla ilerleyin. Bir öğrencinin sessizce başını sallaması yerine kendi sözleriyle açıklamasını isteyin.</li><li><strong>Önce destekli değiştirin.</strong> Aynı cümlede yalnız bir parçayı değiştirin: kişi, yer, ev işi veya gerekçe. Öğrenci bunu rahatça kurduğunda iki parçayı değiştirsin. Yeni kelimeyle yeni dilbilgisini aynı anda zorunlu kılmak yerine yükü küçük adımlarla artırın.</li><li><strong>Sonra desteği azaltın.</strong> Örneği kapatıp kendi hayatından tek bir cümle kurmasını isteyin. Yazmak için düşünme süresi verin. Küçük denemelerin örnek cevabını herkes üretmeyi denedikten sonra açın. Örnek cevap, öğrencinin farklı ama anlamlı doğru cümlesini geçersiz kılmaz.</li><li><strong>Gerekçeyi dinleyin.</strong> “Cevap doğru mu?” sorusuna ek olarak “Bunu neden seçtin?” diye sorun. Yanlış cevapta bütün konuyu yeniden anlatmak yerine yanlış anlaşılmış parçaya dönün. Örneğin mustn't ile don't have to karıştıysa önce yasak ile gereklilik yokluğu ayrımını iki kısa durumla yeniden kurun.</li><li><strong>Bir sonraki derste geri dönün.</strong> Ders sonunda üç ifade seçtirin. Bir sonraki buluşmada açıklamayı açmadan bu ifadelerle yeni cümle kurdurun. Gerekirse aynı bölümü yeniden okuyun; tekrar, yeni konulara geçişi geciktiren bir engel değil öğrenmenin bir parçasıdır.</li></ol><p>Dersteki eski dakika önerileri ek rehberin tamamını bir derste bitirme zorunluluğu değildir. Sınıfın ihtiyacına göre bir konuya birden fazla oturum ayırabilirsiniz. Birkaç öğrenciden bağımsız örnek ve açıklama duyana kadar ilerleme hızını artırmayın.</p></div>`;
  }
  function introduction() {
    return `<div class="b1sg-intro"><p class="b1sg-eyebrow">ADIM ADIM · TÜRKÇE AÇIKLAMALI</p><h2>Acele etmeden öğrenelim</h2><p>Bu derste her konunun altında ayrıntılı bir çalışma rehberi var. Önce anlamı oku, sonra bir örneği parçalara ayırarak incele, en sonunda kendi cümleni kur. Bir konuyu anlamadan bir sonrakine geçmek zorunda değilsin.</p><p>Dersteki süreler bütün bu ek açıklamaları bitirmen gereken bir hız hedefi değildir. İstersen 15–25 dakikalık çalışmalar yap, bir kalıbı birkaç gün tekrar et. Açıklamalar ve örnek cevaplar tek tek açılır; kendi hızını sen belirle.</p><p><strong>${data.stats.chapters} konu ekranı · ${data.stats.patterns} ayrıntılı kalıp başlığı · ${data.stats.words} açıklamalı kelime / ifade</strong></p><button type="button" data-b1-goto="vocab">Ayrıntılı kelime defterini aç</button></div>`;
  }
  function glossary() {
    return `<section class="b1sg" lang="tr" aria-label="Ayrıntılı kelime defteri"><div class="b1sg-intro"><h2>Ayrıntılı kelime defteri</h2><p>Her madde bir çeviriden fazlasını içerir: kullanım açıklaması, birlikte kullanılan kelimeler, Türkçeli örnekler ve dikkat edilecek noktalar. Bir maddeyi inceleyip onunla kendi hayatından bir cümle kur.</p><div class="b1sg-search"><label>Kelime veya Türkçe anlam ara<input type="search" data-b1-query placeholder="alone, lonely, on the one hand, fatura…" value="${esc(state.query)}"></label><label>Bölüm<select data-b1-block><option value="">Bütün bölümler</option>${[1, 2, 3].map(block => `<option value="${block}"${state.block === String(block) ? ' selected' : ''}>${block}. bölüm</option>`).join('')}</select></label></div><p data-b1-count role="status" aria-live="polite"></p></div><div data-b1-words></div><nav class="b1sg-pagination" aria-label="Kelime defteri sayfaları"><button type="button" data-b1-page="prev">← Önceki kelimeler</button><span data-b1-page-label></span><button type="button" data-b1-page="next">Sonraki kelimeler →</button></nav><p class="b1sg-original-note">Aşağıda dersin ilk hazırlanışındaki kısa kelime listesi de yer alıyor.</p></section>`;
  }
  function render(screenId) {
    if (screenId === 'home') return `<section class="b1sg" lang="tr">${introduction()}${chapterIndex()}</section>`;
    if (screenId === 'vocab') return glossary();
    if (screenId === 'summary' || screenId === 'guide') return `<section class="b1sg" lang="tr">${screenId === 'guide' ? teachingGuide() : introduction()}${chapterIndex()}</section>`;
    const chapter = data.chapters.find(item => item.screenId === screenId);
    if (!chapter) return '';
    return `<section class="b1sg" lang="tr" aria-label="${esc(chapter.title)} ayrıntılı anlatım"><div class="b1sg-intro"><p class="b1sg-eyebrow">ÖNCE ANLAYALIM · ${chapter.block}. BÖLÜM</p><h2>${esc(chapter.title)}</h2>${paragraphs(chapter.intro)}<p class="b1sg-reading-tip">Bir başlığa dokunarak açıklamayı aç. Örneği önce sesli oku, parçaların anlamını bul, sonra Türkçesiyle karşılaştır. Tek oturuşta hepsini bitirmen gerekmiyor.</p><div class="b1sg-actions"><button type="button" data-b1-open-all>Açıklama başlıklarını aç</button><button type="button" data-b1-close-all>Başlıkları kapat</button><button type="button" data-b1-goto="vocab" data-b1-for-block="${chapter.block}">Bu bölümün kelimelerini çalış</button></div></div>${chapter.patterns.map((item, i) => pattern(item, i, screenId)).join('')}${chapter.sentenceNotes?.length ? `<details class="b1sg-topic b1sg-sentences" data-b1-help="translation"><summary><span><strong>Dersteki cümleleri tek tek çözelim</strong><small>${chapter.sentenceNotes.length} cümle: anlam, yapı ve parçalar</small></span></summary><div class="b1sg-topic-body">${chapter.sentenceNotes.map((entry, i) => example(entry, i)).join('')}</div></details>` : ''}<div class="b1sg-practice-note"><strong>Şimdi ilk ders etkinliklerine geçebilirsin.</strong><p>Aşağıdaki alıştırmalar aynı konuyu uygulamak içindir. Takılırsan bu rehbere dön ve bir örneği yeniden incele.</p></div></section>`;
  }
  function wordCard(word) {
    return `<details class="b1sg-word" id="b1sg-word-${esc(word.id)}" data-b1-help="translation"><summary><span><strong lang="en">${esc(word.term)}</strong><small>${esc(word.meaning)}</small></span></summary><div class="b1sg-topic-body"><p class="b1sg-word-type">${esc(word.partOfSpeech)}</p>${paragraphs(word.explanation)}${word.collocations?.length ? `<h4>Birlikte kullanılan ifadeler</h4><dl class="b1sg-collocations">${word.collocations.map(entry => `<div><dt lang="en">${esc(entry.en)}</dt><dd>${esc(entry.tr)}</dd></div>`).join('')}</dl>` : ''}<h4>Cümle içinde kullanalım</h4>${array(word.examples).map((entry, i) => example(entry, i, false)).join('')}${word.commonMistake ? `<div class="b1sg-contrast"><h4>Dikkat et</h4>${paragraphs(word.commonMistake)}</div>` : ''}</div></details>`;
  }
  function bind(root, screenId, actions = {}) {
    const host = root.querySelector('.b1sg');
    if (!host) return;
    // This guide has its own practice. It must not mark unrelated native quiz answers as revealed.
    const help = (kind, element) => {
      const region = element?.closest?.('.b1sg-topic,.b1sg-word');
      const chapter = data.chapters.find(item => item.screenId === screenId);
      const title = region?.querySelector('summary strong')?.textContent || chapter?.title || 'Ayrıntılı kelime defteri';
      try {
        window.dispatchEvent(new CustomEvent('english:learning-event', { detail: {
          type: 'help_used', learning: { kind: 'help', helpType: kind, questionId: null, attemptedBeforeHelp: null,
            topicId: `study:${region?.id || screenId}`.slice(0, 120), topicTitle: `Ayrıntılı rehber: ${title}`.replace(/\s+/g, ' ').slice(0, 180) }
        } }));
      } catch (_) { /* The teaching material remains usable before tracking initializes. */ }
    };
    // Native details and long reading sections keep normal keyboard navigation.
    host.addEventListener('keydown', event => {
      if ([' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(event.key)) event.stopPropagation();
    });
    host.addEventListener('toggle', event => {
      if (event.target.open && event.target.dataset.b1Help) help(event.target.dataset.b1Help, event.target);
    }, true);
    host.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !host.contains(button)) return;
      if (button.hasAttribute('data-b1-say')) { help('audio', button); actions.say?.(button.dataset.b1Say); }
      if (button.hasAttribute('data-b1-goto')) {
        state.block = button.dataset.b1ForBlock || ''; state.query = ''; state.page = 0;
        actions.go?.(button.dataset.b1Goto);
      }
      if (button.hasAttribute('data-b1-open-all')) host.querySelectorAll('details.b1sg-topic').forEach(details => { details.open = true; });
      if (button.hasAttribute('data-b1-close-all')) host.querySelectorAll('details.b1sg-topic').forEach(details => { details.open = false; });
    });
    if (screenId !== 'vocab') return;
    const query = host.querySelector('[data-b1-query]');
    const filter = host.querySelector('[data-b1-block]');
    const words = host.querySelector('[data-b1-words]');
    const previous = host.querySelector('[data-b1-page="prev"]');
    const next = host.querySelector('[data-b1-page="next"]');
    let timer;
    function paint() {
      const search = normalize(state.query).trim();
      const found = data.glossary.filter(word => (!state.block || word.block === Number(state.block)) && (!search || normalize([word.term, word.meaning, ...array(word.sourceTerms)].join(' ')).includes(search)));
      const pages = Math.max(1, Math.ceil(found.length / perPage));
      state.page = Math.max(0, Math.min(state.page, pages - 1));
      words.innerHTML = found.slice(state.page * perPage, (state.page + 1) * perPage).map(wordCard).join('') || '<p class="b1sg-empty">Bu aramayla eşleşen kelime bulunamadı. Daha kısa bir kelime veya Türkçe anlam deneyebilirsin.</p>';
      host.querySelector('[data-b1-count]').textContent = `${found.length} madde bulundu. Her sayfada en fazla ${perPage} madde gösterilir.`;
      host.querySelector('[data-b1-page-label]').textContent = `${state.page + 1} / ${pages}`;
      previous.disabled = state.page === 0; next.disabled = state.page + 1 >= pages;
    }
    query.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.query = query.value; state.page = 0; paint(); }, 130); });
    filter.addEventListener('change', () => { state.block = filter.value; state.page = 0; paint(); });
    [previous, next].forEach(button => button.addEventListener('click', () => { state.page += button === next ? 1 : -1; paint(); words.scrollIntoView({ block: 'start' }); }));
    paint();
  }
  window.EnglishB1Study = Object.freeze({ render, bind });
})();
