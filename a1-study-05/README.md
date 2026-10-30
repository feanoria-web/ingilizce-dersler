# A1 beşinci ders: ayrıntılı çalışma rehberi

Bu klasör `lessons/a1/day-05.html` dersine yayımlama sırasında eklenen özgün Türkçe açıklamaları içerir. Yapı ve görüntüleme son B1 dersiyle (`b1-study/`) aynıdır: içerik `scripts/b1-study.mjs` ile doğrulanır, `assets/b1-study.js` ve `assets/b1-study.css` ile gösterilir. Hangi dersin hangi klasörü kullandığı `STUDY_LESSONS` içinde tanımlıdır.

Üç bölüm dosyası (`block-1.json` … `block-3.json`) dersin üç gününe karşılık gelir: 8 Kasım (günüm, fiil + kelime, fiil çekimi, have got, sahiplik sıfatları, aile ve soyağacı), 14 Kasım ('s, Whose, tamlama, soru kelimeleri, meslekler) ve sonraki ders (meslek yazma, hayalimdeki meslek, nesneler, this / that / these / those ve iki ekranda Atatürk: hayatı, yaptıkları, millî bayramlar ve 10 Kasım). Her `chapter.screenId` dersin bir öğretim ekranına bağlanır. Ek etkinlik (oyun) ekranları ayrı anlatım gerektirmez. Her kalıpta anlam, ayrıntılı açıklama, cümle formülü, Türkçeli ve gerekçeli örnekler, sık hatalar ve kendini dene soruları vardır. `sentenceNotes` dersteki cümleleri tek tek açıklar. Kelime defterindeki `sourceTerms` değerleri dersin ifade bankasındaki başlıkları birebir kapsar.

`concise.json` her ekranın kısa girişini ve her kalıbın 3 maddelik özetini içerir. İlk açılışta özet, bir örnek ve bir küçük deneme görünür; uzun açıklamalar ve diğer örnekler ayrı açılır.

Metin alanları düz metindir; HTML yazılmaz. Kazanımlar MEB yetişkin A1 programından alınmıştır. Fotokopi materyali yoktur; resim sıralama, soyağacı, meslek görselleri ve nesne alıştırmaları dersin ekranlarındadır.

Doğrulama: `npm run build`, `npm run check:build`, `node --test tests/b1-study.test.mjs tests/a1-day05-study.test.mjs`.
