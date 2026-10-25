# B1 altıncı ders: ayrıntılı çalışma rehberi

Bu klasör `lessons/b1/day-06.html` dersine yayımlama sırasında eklenen özgün Türkçe açıklamaları içerir. Yapı ve görüntüleme B1 beşinci ders (`b1-study/`) ile aynıdır: içerik `scripts/b1-study.mjs` ile doğrulanır, `assets/b1-study.js` ve `assets/b1-study.css` ile gösterilir. Hangi dersin hangi klasörü kullandığı `STUDY_LESSONS` içinde tanımlıdır.

Ders dört güne yayılır ve dört bölüm dosyası (`block-1.json` … `block-4.json`) bu günlere karşılık gelir: 26 Ekim (telefon, plan, yerleri ve olayları anlatmak, cihaz açıklamak), 27 Ekim (dinlemede ana noktalar, fikir ve gerekçe, kısa konuşma, söyleşi), 28 Ekim (acil notlar, satıcıyla konuşmak, karşılaştırmak, gıda etiketleri, canlandırma) ve 2 Kasım (alışveriş tercihleri, tavsiye, forum yazısı, birlikte karar vermek, kapanış).

Her `chapter.screenId` dersin bir öğretim ekranına bağlanır; ek etkinlik (oyun) ekranları ayrı anlatım gerektirmez. Her konuda üç kalıp vardır: anlam, ayrıntılı açıklama, cümle formülü, Türkçeli ve gerekçeli örnekler (bazılarında kelime öbeği çözümlemesi), sık hatalar, benzer ifadelerle fark ve kendini dene soruları. `sentenceNotes` dersteki cümleleri tek tek çözümler. Kelime defterindeki `sourceTerms` değerleri dersin ifade bankasındaki 94 başlığı birebir kapsar.

`concise.json` her ekranın kısa girişini ve her kalıbın 3–4 maddelik özetini içerir. İlk açılışta özet, bir örnek ve bir küçük deneme görünür; uzun açıklamalar ve diğer örnekler ayrı açılır.

Metin alanları düz metindir; HTML yazılmaz. Kazanımlar MEB yetişkin B1 programının 26 Ekim, 27 Ekim, 28 Ekim ve 2 Kasım satırlarından alınmıştır.

Doğrulama: `npm run build`, `npm run check:build`, `node --test tests/b1-study.test.mjs tests/b1-day06-study.test.mjs`.
