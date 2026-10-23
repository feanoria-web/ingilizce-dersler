# A1 dördüncü ders: ayrıntılı çalışma rehberi

Bu klasör `lessons/a1/day-04.html` dersine yayımlama sırasında eklenen özgün Türkçe açıklamaları içerir. Yapı ve görüntüleme son B1 dersiyle (`b1-study/`) aynıdır: içerik `scripts/b1-study.mjs` ile doğrulanır, `assets/b1-study.js` ve `assets/b1-study.css` ile gösterilir. Hangi dersin hangi klasörü kullandığı `STUDY_LESSONS` içinde tanımlıdır.

Dört bölüm dosyası (`block-1.json` … `block-4.json`) dersin dört bölümüne karşılık gelir. Her `chapter.screenId` dersin bir öğretim ekranına bağlanır. Ek etkinlik (oyun) ekranları bu derste ayrı anlatım gerektirmez. Her kalıpta anlam, ayrıntılı açıklama, cümle formülü, Türkçeli ve gerekçeli örnekler, sık hatalar ve kendini dene soruları vardır. Kelime defterindeki `sourceTerms` değerleri dersin ifade bankasındaki başlıkları birebir kapsar.

`concise.json` her ekranın kısa girişini ve her kalıbın 3–4 maddelik özetini içerir. İlk açılışta özet, bir örnek ve bir küçük deneme görünür; uzun açıklamalar ve diğer örnekler ayrı açılır.

Metin alanları düz metindir; HTML yazılmaz. Kazanımlar MEB yetişkin A1 programından alınmıştır (sınıf komutları, talimatlar, okul tabelaları, okul diyaloğu, 20–100 sayılar, saat, günlük işler ve saatleri, sıklık zarfları, önce / sonra, fiil çekimi, okuma ve yazma).

Doğrulama: `npm run build`, `npm run check:build`, `node --test tests/b1-study.test.mjs tests/a1-study.test.mjs`.
