# English · İngilizce ders paneli

Gürkan Öztürk · Hüdavendigar Sosyal Gelişim Merkezi

A1, A2 ve B1 seviyeleri üzerinden derslere ulaşılabilen, GitHub Pages ile yayımlanan ücretsiz statik site. Mevcut altı dersin görselleri, sesleri ve etkileşimli etkinlikleri korunmuştur. A1 yeni ders eklemeye hazırdır.

Site: https://feanoria-web.github.io/ingilizce-dersler/

## Sonradan ders eklemek

1. Sitede **Ders ekle** sayfasını açın.
2. Seviyeyi, ders başlığını ve diğer bilgileri girip tek dosya halinde hazırlanmış `.html` dersinizi seçin. Derslerimizde olduğu gibi resim, ses, CSS ve JavaScript dosyanın içinde olmalıdır.
3. **Ders dosyasını hazırla**, ardından **Hazır dosyayı indir** düğmesiyle yeni HTML dosyasını indirin. Bu adım bilgisayarınızda gerçekleşir.
4. Sayfadaki **GitHub'a yükle** bağlantısıyla ilgili seviyenin klasörünü açın. İndirdiğiniz dosyayı sürükleyip bırakın, **Commit changes** ile kaydedin. GitHub hesabında depo için yazma yetkisi gerekir.
5. **Actions → GitHub Pages** iş akışı tamamlandığında yeni ders otomatik olarak panelde görünür. İlk yükleme birkaç dakika sürebilir.

Panel, GitHub şifresi veya erişim anahtarı istemez. Dosya hazırlamak yayına yüklemek değildir; GitHub'da dosyayı kaydetmek gerekir. Bir derste değişiklik yapmak için depodaki ilgili HTML dosyasını güncelleyip kaydedin. Ders kaldırmak için o HTML dosyasını depodan silip kaydedin.

## Klasör yapısı

```text
index.html                Ana panel
admin.html                Yeni ders dosyası hazırlama
assets/                   Panel tasarımı, uygulama ve oluşturulan katalog
lessons/a1/               A1 dersleri
lessons/a2/               A2 dersleri
lessons/b1/               B1 dersleri
scripts/                  Katalog ve doğrulama araçları
.github/workflows/pages.yml  Otomatik yayın
```

Yeni bir HTML dosyasını doğrudan ilgili `lessons/a1`, `lessons/a2` veya `lessons/b1` klasörüne yüklemek de yeterlidir. Başlık HTML'nin `<title>` alanından alınır. **Ders ekle** sayfası kullanıldığında açıklama, ders numarası, tarih ve süre de dosyaya eklenir. Aynı dosya adı mevcut dersi günceller; yeni ders için farklı dosya adı kullanın.

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
