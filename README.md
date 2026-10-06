# English · İngilizce ders paneli

Gürkan Öztürk · Hüdavendigar Sosyal Gelişim Merkezi

A1, A2 ve B1 seviyeleri ile YDS hazırlık paneli üzerinden derslere ulaşılabilen, GitHub Pages ile yayımlanan ücretsiz statik site. Mevcut altı dersin görselleri, sesleri ve etkileşimli etkinlikleri korunmuştur. A1 ve YDS yeni ders eklemeye hazırdır.

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
```

Bağımlılık kurulumu gerekmez. Katalog `lessons` klasöründeki HTML dosyalarından üretilir; `_site` yalnızca yayımlanacak dosyaları içerir. Depoya sonradan eklenen dersler, her `main` kaydında otomatik keşfedilir.

## GitHub Pages ayarı

Depo herkese açık olmalıdır. **Settings → Pages → Build and deployment → Source: GitHub Actions** seçilir. `.github/workflows/pages.yml` dosyası otomatik yayını yönetir. Aynı iş akışı **Actions → GitHub Pages → Run workflow** ile elle de başlatılabilir.

GitHub Free planında herkese açık depolar GitHub Pages kullanabilir: [GitHub Pages belgesi](https://docs.github.com/en/pages/getting-started-with-github-pages).

Ders içindeki cevaplar ve etkinlik kayıtları mevcut uygulamaların kullandığı biçimde tarayıcıda saklanır. Cihazlar arasında eşitlenmez.
