# English · İngilizce ders paneli

Gürkan Öztürk · Hüdavendigar Sosyal Gelişim Merkezi

A1, A2 ve B1 seviyeleri ile YDS hazırlık paneli üzerinden derslere ulaşılabilen, GitHub Pages ile yayımlanan ücretsiz statik site. Altı A2/B1 dersinin yanında YDS Grammar Studio yer alır; A1 yeni ders eklemeye hazırdır.

Site: https://feanoria-web.github.io/ingilizce-dersler/

## Sonradan ders eklemek

Yükleme GitHub'da **feanoria-web** hesabıyla yapılır. Ziyaretçi panelinde ders ekleme veya dosya yükleme alanı bulunmaz. Ders yayımlamak için GitHub'ın depo yazma yetkisi gereklidir.

1. GitHub'a **feanoria-web** hesabıyla giriş yapın ve [ders deposunu](https://github.com/feanoria-web/ingilizce-dersler) açın.
2. İlgili panelin klasörüne girin: `lessons/a1`, `lessons/a2`, `lessons/b1` veya `lessons/yds`.
3. **Add file → Upload files** ile tek dosya halinde hazırlanmış `.html` dersinizi yükleyin. Derslerimizde olduğu gibi resim, ses, CSS ve JavaScript dosyanın içinde olmalıdır.
4. **Commit changes** ile kaydedin.
5. **Actions → GitHub Pages** iş akışı tamamlandığında yeni ders otomatik olarak panelde görünür. İlk yükleme birkaç dakika sürebilir.

Bir derste değişiklik yapmak için depodaki ilgili HTML dosyasını güncelleyip kaydedin. Ders kaldırmak için o HTML dosyasını depodan silip kaydedin. Her dersin başlığı HTML dosyasının `<title>` alanından alınabilir.

## Klasör yapısı

```text
index.html                Ana panel
assets/                   Panel tasarımı, uygulama ve oluşturulan katalog
lessons/a1/               A1 dersleri
lessons/a2/               A2 dersleri
lessons/b1/               B1 dersleri
lessons/yds/              YDS hazırlık dersleri
yds-src/                  YDS uygulamasının şablonu, tasarımı ve özgün içerikleri
scripts/                  Katalog ve doğrulama araçları
.github/workflows/pages.yml  Otomatik yayın
```

Yeni bir HTML dosyasını ilgili `lessons/a1`, `lessons/a2`, `lessons/b1` veya `lessons/yds` klasörüne yüklemek yeterlidir. Başlık HTML'nin `<title>` alanından alınır. `lesson-meta` bilgisi varsa açıklama, ders numarası, tarih ve süre de kullanılır. Aynı dosya adı mevcut dersi günceller; yeni ders için farklı dosya adı kullanın.

## Yerelde açmak

Ana panel `index.html` dosyasına çift tıklanarak da açılabilir. Ders kataloğunun son yüklemeleri içermesi için Node.js 22 veya daha yeni bir sürümle:

```sh
npm run catalog
npm run check
node scripts/preview.mjs
```

Önizleme adresi: http://127.0.0.1:4173/ingilizce-dersler/

Yayın dosyalarını üretmek ve kontrol etmek için:

```sh
npm run build
npm run check:build
npm run check:yds
```

Bağımlılık kurulumu gerekmez. Katalog `lessons` klasöründeki HTML dosyalarından üretilir; `_site` yalnızca yayımlanacak dosyaları içerir. Depoya sonradan eklenen dersler, her `main` kaydında otomatik keşfedilir.

## YDS Grammar Studio

`lessons/yds/grammar-studio.html`, 12 ana üniteyi kapsayan bağımsız YDS çalışma sitesidir. 123 konu anlatımı, 230 açıklamalı soru, 12 akademik okuma ve 144 kelime/öbek kartı içerir. Ünite soruları, filtreli soru bankası, yanlış defteri, süreli çalışma testleri, kişisel notlar ve altı haftalık esnek çalışma rotası aynı uygulamada yer alır.

Kaynak konu haritası, Nesibe Sevgi Öndeş'in **English Grammar Inside and Out** kitabındaki 12 ünite ve ekler esas alınarak hazırlanmıştır. Türkçe anlatımlar, örnekler, sorular ve okumalar bu site için özgün olarak yazılmıştır.

YDS içeriğini değiştirmek için `yds-src/data/units-01-04.json`, `units-05-08.json` ve `units-09-12.json` dosyalarını düzenleyin. `yds-src/app.js`, `style.css` ve `template.html` uygulamayı yönetir. Her yayın öncesinde `npm run build`, bu kaynakları doğrulayıp tek HTML dosyasını yeniden üretir. Bu nedenle üretilmiş `grammar-studio.html` yerine kaynak dosyaları düzenleyin.

Çalışma işaretleri, cevaplar, notlar ve test sonuçları tarayıcıda saklanır. Başka cihazla eşitlenmez. Zamanlı test tekrar açılırken geçen süre korunur; süre dolduysa kaydedilen cevaplar değerlendirilir.

## GitHub Pages ayarı

Depo herkese açık olmalıdır. **Settings → Pages → Build and deployment → Source: GitHub Actions** seçilir. `.github/workflows/pages.yml` dosyası otomatik yayını yönetir. Aynı iş akışı **Actions → GitHub Pages → Run workflow** ile elle de başlatılabilir.

GitHub Free planında herkese açık depolar GitHub Pages kullanabilir: [GitHub Pages belgesi](https://docs.github.com/en/pages/getting-started-with-github-pages).

Ders içindeki cevaplar ve etkinlik kayıtları mevcut uygulamaların kullandığı biçimde tarayıcıda saklanır. Cihazlar arasında eşitlenmez.
