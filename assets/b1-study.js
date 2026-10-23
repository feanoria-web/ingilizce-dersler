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
  const blocks = Array.isArray(data.blocks) && data.blocks.length ? data.blocks : [1, 2, 3];
  const perPage = 12;
  const audio = en => `<button type="button" class="b1sg-audio" data-b1-say="${esc(en)}" aria-label="İngilizce örneği dinle: ${esc(en)}">Dinle</button>`;
  function chunks(items) {
    return array(items).length ? `<dl class="b1sg-chunks">${items.map(item => `<div><dt lang="en">${esc(item.en)}</dt><dd><strong>${esc(item.tr)}</strong>${item.note ? `<p>${esc(item.note)}</p>` : ''}</dd></div>`).join('')}</dl>` : '';
  }
  function example(item, index, detailed = true) {
    return `<article class="b1sg-example"><div class="b1sg-example-heading"><span>Örnek ${index + 1}</span>${audio(item.en)}</div><p class="b1sg-en" lang="en">${esc(item.en)}</p><p class="b1sg-tr">${esc(item.tr)}</p>${paragraphs(item.why || item.note)}${detailed ? chunks(item.chunks) : ''}${item.variations?.length ? `<div class="b1sg-variations"><h5>Aynı yapıyla başka cümleler</h5>${item.variations.map(variant => `<p lang="en"><strong>${esc(variant.en)}</strong></p><p>${esc(variant.tr)}</p>${paragraphs(variant.note)}`).join('')}</div>` : ''}</article>`;
  }
  function more(title, body, kind = 'hint', className = '') {
    return `<details class="b1sg-more ${className}" data-b1-help="${kind}"><summary>${esc(title)}</summary><div class="b1sg-more-body">${body}</div></details>`;
  }
  function briefExample(item, index) {
    const note = array(item.why || item.note)[0] || '';
    const shortNote = note.split(/\s+/u).length <= 45 ? paragraphs(note) : '';
    return `<article class="b1sg-example b1sg-example-brief"><div class="b1sg-example-heading"><span>Bir örnekle anlayalım</span>${audio(item.en)}</div><p class="b1sg-en" lang="en">${esc(item.en)}</p><p class="b1sg-tr">${esc(item.tr)}</p>${shortNote}</article>`;
  }
  function check(item) {
    return `<div class="b1sg-check"><p>${esc(item.question)}</p><details data-b1-help="answer"><summary>Örnek cevabı ve nedenini göster</summary><div>${paragraphs(item.answer)}${paragraphs(item.why)}</div></details></div>`;
  }
  function annotatedExample(item, index) {
    return `<details class="b1sg-sentence" data-b1-help="translation"><summary><span><strong lang="en">${esc(item.en)}</strong><small>${esc(item.tr)}</small></span></summary><div class="b1sg-more-body">${example(item, index)}</div></details>`;
  }
  function explanation(items) {
    if (items.length <= 4) return paragraphs(items);
    // Long essays are split into small, separately expandable reading steps.
    return items.reduce((html, text, index) => {
      if (index % 2) return html;
      const sentence = text.split(/(?<=[.!?])\s+/u)[0];
      const title = sentence.length <= 100 ? sentence : `${sentence.slice(0, 96).replace(/\s+\S*$/, '')}…`;
      return html + more(title, paragraphs(items.slice(index, index + 2)), 'hint', 'b1sg-note');
    }, '');
  }
  function pattern(item, index, screenId) {
    const id = `b1sg-${screenId}-${index}`;
    const selected = item.exampleIndex ?? 0;
    const preview = item.examples[selected];
    const formulas = array(item.formula);
    const comparison = (item.contrasts?.length ? `<h4>Benzer ifadelerle farkı</h4>${item.contrasts.map(entry => `<div class="b1sg-contrast"><h5>${esc(entry.label)}</h5>${paragraphs(entry.explanation)}${entry.example ? `<p lang="en"><strong>${esc(entry.example)}</strong></p>` : ''}${paragraphs(entry.tr)}</div>`).join('')}` : '')
      + (item.mistakes?.length ? `<h4>Sık yapılan hatalar ve düzeltmeleri</h4>${item.mistakes.map(entry => `<div class="b1sg-mistake"><p><span>Bu amaçla kullanma:</span> <s lang="en">${esc(entry.wrong)}</s></p><p><span>Doğru / amaçlanan biçim:</span> <strong lang="en">${esc(entry.right)}</strong></p>${paragraphs(entry.why)}</div>`).join('')}` : '');
    return `<details class="b1sg-topic" id="${esc(id)}" data-b1-topic data-b1-help="hint">
      <summary><span class="b1sg-number">${index + 1}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.meaning)}</small></span></summary>
      <div class="b1sg-topic-body">
        <div class="b1sg-quick"><p class="b1sg-eyebrow">ÖZÜNÜ ÖĞREN</p>${list(item.summary || [item.meaning])}${formulas[0] ? `<p class="b1sg-mini-formula"><strong>Yapı:</strong> ${esc(formulas[0])}</p>` : ''}</div>
        ${briefExample(preview, selected)}
        ${item.checks?.[0] ? `<h4 class="b1sg-check-title">Kendini dene</h4>${check(item.checks[0])}` : ''}
        <div class="b1sg-detail-options">
          ${more('Detayları aç: anlam ve cümle yapısı', explanation(item.explanation) + (formulas.length ? `<div class="b1sg-formula"><h4>Cümleyi kurma yolları</h4>${list(formulas)}</div>` : ''))}
          ${more(`Örnekleri ve çözümlemelerini aç · ${item.examples.length} örnek`, item.examples.map(annotatedExample).join(''), 'translation')}
          ${comparison ? more('Karşılaştırmaları ve sık hataları aç', comparison) : ''}
          ${item.checks?.length > 1 ? more(`Diğer küçük denemeler · ${item.checks.length - 1}`, item.checks.slice(1).map(check).join('')) : ''}
        </div>
      </div>
    </details>`;
  }
  const chapterIndex = () => `<div class="b1sg-index">${blocks.map(block => `<section><h3>${block}. bölüm</h3>${data.chapters.filter(chapter => chapter.block === block).map(chapter => `<button type="button" data-b1-goto="${esc(chapter.screenId)}">${esc(chapter.title)}</button>`).join('')}</section>`).join('')}</div>`;
  function teachingGuide() {
    return `<div class="b1sg-intro"><h2>Sınıfta bu rehberi nasıl yavaş ve anlaşılır işleriz?</h2><p>Bir başlıktaki bütün örnekleri peş peşe okumak yerine bir örnekte durun. Önce cümlenin ne söylemek istediğini sorun. Ardından özneyi, fiili, zaman veya yer bilgisini buldurun. Türkçe çeviriyi en başta vermek yerine öğrencinin anlam tahminini dinleyin; sonra birlikte karşılaştırın. Cevabı bilmemek hızlanmak için bir işaret değildir; aynı cümleyi daha küçük parçalara bölmek için bir fırsattır.</p><ol><li><strong>Anlamı kurun.</strong> Tek bir durum seçin: ev paylaşmak, damlayan bir musluk veya bir arkadaşa mektup. Öğrenci önce Türkçe olarak ne söyleyeceğini belirlesin. Sonra bu duruma uygun kalıbı bulsun. Böylece kelimeler bağlamdan kopuk bir listeye dönüşmez.</li><li><strong>Bir modeli birlikte inceleyin.</strong> İngilizce cümleyi okuyun, anlam gruplarını tek tek gösterin. “Burada neden on var?”, “Bu olumsuzluk yasak mı, zorunluluk yokluğu mu?” gibi küçük sorularla ilerleyin. Bir öğrencinin sessizce başını sallaması yerine kendi sözleriyle açıklamasını isteyin.</li><li><strong>Önce destekli değiştirin.</strong> Aynı cümlede yalnız bir parçayı değiştirin: kişi, yer, ev işi veya gerekçe. Öğrenci bunu rahatça kurduğunda iki parçayı değiştirsin. Yeni kelimeyle yeni dilbilgisini aynı anda zorunlu kılmak yerine yükü küçük adımlarla artırın.</li><li><strong>Sonra desteği azaltın.</strong> Örneği kapatıp kendi hayatından tek bir cümle kurmasını isteyin. Yazmak için düşünme süresi verin. Küçük denemelerin örnek cevabını herkes üretmeyi denedikten sonra açın. Örnek cevap, öğrencinin farklı ama anlamlı doğru cümlesini geçersiz kılmaz.</li><li><strong>Gerekçeyi dinleyin.</strong> “Cevap doğru mu?” sorusuna ek olarak “Bunu neden seçtin?” diye sorun. Yanlış cevapta bütün konuyu yeniden anlatmak yerine yanlış anlaşılmış parçaya dönün. Örneğin mustn't ile don't have to karıştıysa önce yasak ile gereklilik yokluğu ayrımını iki kısa durumla yeniden kurun.</li><li><strong>Bir sonraki derste geri dönün.</strong> Ders sonunda üç ifade seçtirin. Bir sonraki buluşmada açıklamayı açmadan bu ifadelerle yeni cümle kurdurun. Gerekirse aynı bölümü yeniden okuyun; tekrar, yeni konulara geçişi geciktiren bir engel değil öğrenmenin bir parçasıdır.</li></ol><p>Dersteki eski dakika önerileri ek rehberin tamamını bir derste bitirme zorunluluğu değildir. Sınıfın ihtiyacına göre bir konuya birden fazla oturum ayırabilirsiniz. Birkaç öğrenciden bağımsız örnek ve açıklama duyana kadar ilerleme hızını artırmayın.</p></div>`;
  }
  function introduction() {
    return `<div class="b1sg-intro"><p class="b1sg-eyebrow">ÖZETLE BAŞLA · İSTERSEN DERİNLEŞ</p><h2>Acele etmeden öğrenelim</h2><p>Her başlıkta kısa açıklama, Türkçeli bir örnek ve küçük bir deneme var. Uzun anlatımlara, diğer örneklere ve sık hatalara yalnız ihtiyacın olduğunda ulaşmak için ilgili ayrıntıyı aç.</p><p><strong>${data.stats.chapters} konu ekranı · ${data.stats.patterns} kalıp · ${data.stats.words} kelime / ifade</strong></p><button type="button" data-b1-goto="vocab">Ayrıntılı kelime defterini aç</button></div>`;
  }
  function glossary() {
    return `<section class="b1sg" lang="tr" aria-label="Ayrıntılı kelime defteri"><div class="b1sg-intro"><h2>Ayrıntılı kelime defteri</h2><p>Her madde bir çeviriden fazlasını içerir: kullanım açıklaması, birlikte kullanılan kelimeler, Türkçeli örnekler ve dikkat edilecek noktalar. Bir maddeyi inceleyip onunla kendi hayatından bir cümle kur.</p><div class="b1sg-search"><label>Kelime veya Türkçe anlam ara<input type="search" data-b1-query placeholder="${esc(data.searchHint || 'alone, lonely, on the one hand, fatura…')}" value="${esc(state.query)}"></label><label>Bölüm<select data-b1-block><option value="">Bütün bölümler</option>${blocks.map(block => `<option value="${block}"${state.block === String(block) ? ' selected' : ''}>${block}. bölüm</option>`).join('')}</select></label></div><p data-b1-count role="status" aria-live="polite"></p></div><div data-b1-words></div><nav class="b1sg-pagination" aria-label="Kelime defteri sayfaları"><button type="button" data-b1-page="prev">← Önceki kelimeler</button><span data-b1-page-label></span><button type="button" data-b1-page="next">Sonraki kelimeler →</button></nav><p class="b1sg-original-note">Aşağıda dersin ilk hazırlanışındaki kısa kelime listesi de yer alıyor.</p></section>`;
  }
  function render(screenId) {
    if (screenId === 'home') return `<section class="b1sg" lang="tr">${introduction()}${chapterIndex()}</section>`;
    if (screenId === 'vocab') return glossary();
    if (screenId === 'summary' || screenId === 'guide') return `<section class="b1sg" lang="tr">${screenId === 'guide' ? more('Öğretmen için ayrıntılı çalışma önerileri', teachingGuide()) : introduction()}${chapterIndex()}</section>`;
    const chapter = data.chapters.find(item => item.screenId === screenId);
    if (!chapter) return '';
    return `<section class="b1sg" lang="tr" aria-label="${esc(chapter.title)} ayrıntılı anlatım">
      <div class="b1sg-intro"><p class="b1sg-eyebrow">KISA ANLATIM + İSTEĞE BAĞLI AYRINTILAR · ${chapter.block}. BÖLÜM</p><h2>${esc(chapter.title)}</h2>${paragraphs(chapter.shortIntro || chapter.intro[0])}<p class="b1sg-reading-tip">Özeti oku, bir örnekle dene. Daha fazla bilgi için yalnız ihtiyacın olan ayrıntıyı aç.</p><div class="b1sg-actions"><button type="button" data-b1-open-all>Özetleri aç</button><button type="button" data-b1-close-all>Hepsini kapat</button><button type="button" data-b1-for-block="${chapter.block}" data-b1-goto="vocab">Bölümün kelimeleri</button><button type="button" data-b1-practice>Ders etkinliklerine geç ↓</button></div></div>
      ${chapter.patterns.map((item, i) => pattern(item, i, screenId)).join('')}
      ${more('Konunun geniş çerçevesini aç', paragraphs(chapter.intro))}
      ${chapter.sentenceNotes?.length ? `<details class="b1sg-topic b1sg-sentences" data-b1-help="translation"><summary><span><strong>Dersteki cümleleri tek tek çözelim</strong><small>${chapter.sentenceNotes.length} cümle · incelemek istediğin örneği aç</small></span></summary><div class="b1sg-topic-body">${chapter.sentenceNotes.map(annotatedExample).join('')}</div></details>` : ''}
      <div class="b1sg-practice-note"><button type="button" data-b1-practice>İlk dersin açıklama ve etkinliklerine geç ↓</button></div>
    </section>`;
  }
  function wordCard(word) {
    const pairs = items => `<dl class="b1sg-collocations">${items.map(entry => `<div><dt lang="en">${esc(entry.en)}</dt><dd>${esc(entry.tr)}</dd></div>`).join('')}</dl>`;
    const collocations = array(word.collocations);
    const details = paragraphs(word.explanation)
      + (collocations.length ? `<h4>Birlikte kullanılan ifadeler</h4>${pairs(collocations)}` : '')
      + `<h4>Bütün örnekler ve kullanım notları</h4>${array(word.examples).map(annotatedExample).join('')}`;
    return `<details class="b1sg-word" id="b1sg-word-${esc(word.id)}" data-b1-help="translation"><summary><span><strong lang="en">${esc(word.term)}</strong><small>${esc(word.meaning)}</small></span></summary><div class="b1sg-topic-body"><p class="b1sg-word-type">${esc(word.partOfSpeech)}</p>${collocations.length ? pairs(collocations.slice(0, 2)) : ''}${briefExample(word.examples[0], 0)}${word.commonMistake ? `<div class="b1sg-contrast"><h4>Dikkat et</h4>${paragraphs(word.commonMistake)}</div>` : ''}${more('Kelimenin ayrıntılarını ve diğer örnekleri aç', details, 'translation')}</div></details>`;
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
      if (button.hasAttribute('data-b1-practice')) root.querySelector('section[data-k]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      if (button.hasAttribute('data-b1-open-all')) host.querySelectorAll('details[data-b1-topic]').forEach(details => { details.open = true; });
      if (button.hasAttribute('data-b1-close-all')) host.querySelectorAll('details').forEach(details => { details.open = false; });
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
