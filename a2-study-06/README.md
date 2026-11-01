# A2 altıncı ders: ayrıntılı çalışma rehberi

Bu klasör `lessons/a2/day-06.html` dersine yayımlama sırasında eklenen özgün Türkçe açıklamaları içerir. Yapı ve görüntüleme son B1 dersiyle (`b1-study/`) aynıdır: içerik `scripts/b1-study.mjs` ile doğrulanır, `assets/b1-study.js` ve `assets/b1-study.css` ile gösterilir. Hangi dersin hangi klasörü kullandığı `STUDY_LESSONS` içinde tanımlıdır.

Dört bölüm dosyası (`block-1.json` … `block-4.json`) dersin dört bölümüne karşılık gelir. 2 Kasım: zıt anlamlı sıfatlar, sıfat ve zarf, geniş zamanla genel gerçekler, Türkiye okuması (blok 1); zaman ifadeleri, sıklık zarfları, hafta sonu, boşluklu diyalog (blok 2). 3 Kasım: günlük tabelalar, mustn't / can't, don't have to, kurallar (blok 3); sorunlar ve tavsiye, tavsiye kartları, olasılık, tavsiye e-postası (blok 4).

Her `chapter.screenId` dersin bir öğretim ekranına bağlanır. Ek etkinlik (oyun) ekranları ayrı anlatım gerektirmez. Her kalıpta anlam, ayrıntılı açıklama, cümle formülü, Türkçeli ve gerekçeli örnekler, sık hatalar ve kendini dene soruları vardır. `sentenceNotes` dersteki cümleleri tek tek açıklar. Kelime defterindeki `sourceTerms` değerleri dersin ifade bankasındaki başlıkları birebir kapsar.

`concise.json` her ekranın kısa girişini ve her kalıbın 3 maddelik özetini içerir. İlk açılışta özet, bir örnek ve bir küçük deneme görünür; uzun açıklamalar ve diğer örnekler ayrı açılır.

Metin alanları düz metindir; HTML yazılmaz. Kazanımlar MEB yetişkin A2 programından alınmıştır. Fotokopi materyali yoktur; bütün alıştırmalar ekrandadır. Ders, önceki A2 dersinin cümlelerini tekrar etmez (testte denetlenir).

Doğrulama: `npm run build`, `npm run check:build`, `node --test tests/b1-study.test.mjs tests/a2-day06-study.test.mjs`.
