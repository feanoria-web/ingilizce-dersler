# A2 beşinci ders: ayrıntılı çalışma rehberi

Bu klasör `lessons/a2/day-05.html` dersine yayımlama sırasında eklenen özgün Türkçe açıklamaları içerir. Yapı ve görüntüleme A1 dördüncü ders (`a1-study/`) ve son B1 dersiyle (`b1-study/`) aynıdır: içerik `scripts/b1-study.mjs` ile doğrulanır, `assets/b1-study.js` ve `assets/b1-study.css` ile gösterilir. Hangi dersin hangi klasörü kullandığı `STUDY_LESSONS` içinde tanımlıdır.

Ders iki güne yayılır: 26 Ekim (1. ve 2. bölüm) ve 27 Ekim (3. ve 4. bölüm). Dört bölüm dosyası (`block-1.json` … `block-4.json`) bu dört bölüme karşılık gelir. Her `chapter.screenId` dersin bir öğretim ekranına bağlanır. Ek etkinlik (oyun) ekranları bu derste ayrı anlatım gerektirmez. Her kalıpta anlam, ayrıntılı açıklama, cümle formülü, Türkçeli ve gerekçeli örnekler, sık hatalar ve kendini dene soruları vardır. Kelime defterindeki `sourceTerms` değerleri dersin ifade bankasındaki başlıkları birebir kapsar.

`concise.json` her ekranın kısa girişini ve her kalıbın 3–4 maddelik özetini içerir. İlk açılışta özet, bir örnek ve bir küçük deneme görünür; uzun açıklamalar ve diğer örnekler ayrı açılır.

Metin alanları düz metindir; HTML yazılmaz. Kazanımlar MEB yetişkin A2 programının 26–27 Ekim satırlarından alınmıştır: sıfatlar ve zıt anlamlıları, hayvanlar ve yaşadıkları yerler, yer bildiren edatlar, hayvanat bahçesi tabelaları, hayvan sesleri, hayvanı betimlemek, sevilen ve korkulan hayvan, hayvanlardan elde edilenler, haritada binaların yeri, yol tarifi vermek ve anlamak, kendi mahallesini çizmek, telefonda yol tarifi, günlük hayat ve rutinler, doğru / yanlış okuma, eş ve zıt anlamlı sıfatlar.

Doğrulama: `npm run build`, `npm run check:build`, `node --test tests/b1-study.test.mjs tests/a1-study.test.mjs tests/a2-study.test.mjs`.
