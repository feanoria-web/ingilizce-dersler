# B1 yedinci ders: ayrıntılı çalışma rehberi

Bu klasör `lessons/b1/day-07.html` dersine yayımlama sırasında eklenen özgün Türkçe açıklamaları içerir. Yapı ve görüntüleme önceki B1 dersleriyle (`b1-study/`, `b1-study-06/`) aynıdır: içerik `scripts/b1-study.mjs` ile doğrulanır, `assets/b1-study.js` ve `assets/b1-study.css` ile gösterilir. Hangi dersin hangi klasörü kullandığı `STUDY_LESSONS` içinde tanımlıdır.

Ders iki güne yayılır. Dört bölüm dosyası (`block-1.json` … `block-4.json`) dersin dört bölümüne karşılık gelir:

- 3 Kasım
  - Blok 1: pazarlık, kasada ödeme, internetten alışveriş basamakları, mağazada memnuniyet ve şikâyet.
  - Blok 2: şikâyet e-postası ve yorumlar, anket, Atatürk'ün hayatı, Cumhuriyet yılları ve miras, günün kapanışı.
- 4 Kasım
  - Blok 3: moda ve eğilimler, moda ve reklamlar, kültür-teknoloji-tüketim, kibarca katılmak ve katılmamak.
  - Blok 4: teklifi kabul ve ret, kıyafet tavsiyesi, sınıf tartışması, tavsiye mesajı, kapanış.

Her `chapter.screenId` dersin bir öğretim ekranına bağlanır; ek etkinlik (oyun) ekranları ayrı anlatım gerektirmez. Her konuda üç kalıp vardır. Her kalıpta şunlar bulunur:

- anlam ve ayrıntılı açıklama;
- cümle formülü;
- Türkçeli ve gerekçeli örnekler (bazılarında kelime öbeği çözümlemesi);
- sık hatalar;
- kendini dene soruları.

`sentenceNotes` dersteki cümleleri tek tek çözümler. Kelime defterindeki `sourceTerms` değerleri dersin ifade bankasındaki 102 başlığı birebir kapsar.

`concise.json` her ekranın kısa girişini ve her kalıbın 3–4 maddelik özetini içerir. İlk açılışta özet, bir örnek ve bir küçük deneme görünür; uzun açıklamalar ve diğer örnekler ayrı açılır.

Metin alanları düz metindir; HTML yazılmaz. Kazanımlar MEB yetişkin B1 programının 3 ve 4 Kasım satırlarından ve bir önceki satırın 6. derste işlenmemiş kazanımlarından alınmıştır: pazarlık, ödeme, internetten alışveriş ve Atatürk'ün hayatı. Ürün etiketleri ve alışveriş tercihleri 6. derste işlendiği için tekrar edilmez. Fotokopi materyali yoktur; bütün alıştırmalar ekrandadır. Ders, önceki B1 dersinin cümlelerini tekrar etmez (testte denetlenir).

Doğrulama: `npm run build`, `npm run check:build`, `node --test tests/b1-study.test.mjs tests/b1-day07-study.test.mjs`.
