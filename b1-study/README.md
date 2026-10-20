# B1 son ders: ayrıntılı çalışma rehberi

Bu klasör `lessons/b1/day-05.html` dersine yayımlama sırasında eklenen özgün Türkçe açıklamaları içerir. İlk dersin ekranları, bölüm sıraları, soru kimlikleri ve öğrenci cevap kayıtları değiştirilmez. Üç JSON dosyasındaki bölümler `scripts/b1-study.mjs` ile doğrulanır; görüntüleme `assets/b1-study.js` ve `assets/b1-study.css` tarafından yapılır.

Her `chapter.screenId` asıl dersin bir öğretim ekranına bağlanır. Her kalıp anlam, ayrıntılı açıklama, cümle formülü, Türkçeli örnek ve kendi kendine deneme içerir. `sentenceNotes` dersteki örnekleri ayrıca çözümler. Kelime defterindeki `sourceTerms` değerleri ilk sözlüğün özgün başlıklarını korur; böylece birleşik maddeler ayrı ayrı açıklansa bile 87 kaynak öğenin kapsamı doğrulanır.

Metin alanları düz metindir; HTML yazılmaz. Örnekler İngilizce `en` ve Türkçe `tr` çiftleri içerir. Yanlış örnekler yalnız `mistakes.wrong` alanında, açıkça düzeltmeyle birlikte gösterilir. Küçük denemelerin cevapları öğrenci açana kadar kapalıdır; bunlar asıl dersin puanlanan soruları yerine geçmez. Açıklama, çeviri, ses veya cevap açılması mevcut yardım kaydına bildirilir; notlandırılmış cevap üretilmez.

Rehber yardımları `english:learning-event` üzerinden `study:` konu kimliğiyle kaydedilir. Özgün quiz sorularının yardım/cevap açıldı durumunu değiştirmez; rehberin mini cevabı, farklı bir sorunun cevabı gösterilmiş gibi ilişkilendirilmez.

Doğrulama: `npm run build`, `npm run check:build`, `node --test tests/b1-study.test.mjs` ve mevcut testler.

Özellikle iki görüşü dengeleme kullanımının kontrolünde [Cambridge English Grammar Today](https://dictionary.cambridge.org/grammar/british-grammar/prepositions-on-the-one-hand-on-the-other-hand) ve [Oxford Learner’s Dictionaries: hand](https://www.oxfordlearnersdictionaries.com/us/definition/english/hand_1) başvuruları kullanılmıştır. İki olumlu fakat yarışan tercih dengelenebilir; aynı seçeneğin iki sıradan avantajını listelemek için `and` / `also` daha doğal olur. Örnek ve Türkçe açıklamalar bu ders için özgün olarak hazırlanmıştır.
