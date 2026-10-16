# English · öğrenci girişi ve öğretmen takibi

Gürkan Öztürk · Hüdavendigar Sosyal Gelişim Merkezi

Ana site: https://feanoria-web.github.io/ingilizce-dersler/

Öğrenci tek şifre alanına kendi adını veya ad-soyadını yazar. Büyük/küçük harf, Türkçe karakterler ve boşluklar eşitlenir. Aynı kısa ad birden fazla öğrenciyi gösteriyorsa tam ad istenir. A1, A2 ve B1 sınıfı rapor filtresidir; herkes aynı ders paneline erişir.

Öğretmen `admin.html` sayfasına ayrı, en az 12 karakterlik yönetici şifresiyle girer. Öğrenci şifresi yönetim yetkisi vermez. Yönetim panelinde giriş yapan/yapmayan öğrenciler, ilk ve son girişler, seçili dönemde açılan dersler, etkinlik geçmişi, yaklaşık aktif süre, CSV çıktısı ve öğrenci erişimi açma/kapatma bulunur. Tarihler İstanbul saatidir. "Hiç giriş yapmadı" tüm geçmişe bakar; tarih filtresi eski bir ziyaretçiyi hiç giriş yapmamış saymaz.

## Kayıtların anlamı

Sunucu giriş, panel/derse giriş, ders içi etkinlik ekranı, cevap kontrol/göster, kelime anlamı açma ve tamamlandı işaretlerini kaydeder. Cevapların içeriği, yazılan notlar, telefon ve kimlik bilgisi toplanmaz. Aktif süre yaklaşık bir kullanım ölçüsüdür: görünür sekme ve son etkileşim üzerinden en çok 30 saniyelik aralıklarla bildirilir. Gizli veya uzun süredir kullanılmayan sekme süre kazandırmaz. Bu kayıtlar tek başına yoklama, başarı veya kimlik doğrulama kanıtı değildir; adını bilen biri başka öğrenci adına girebilir.

Kesinti sırasında bekleyen en çok 300 olay yalnızca aynı öğrenci oturumuyla gönderilir. Sunucu alma zamanını kaydeder; çevrimdışı geçmişin kesin saatini veya tüm süresini yeniden oluşturmaz. Merkezi giriş ve takip internet bağlantısı ister. Eski bağımsız çevrimdışı ders dosyaları değişmez.

## GitHub Pages ve veri gizliliği

GitHub Pages statik dosyaları sunar; merkezi kayıt Cloudflare Worker + D1 üzerindedir. GitHub'daki HTML dersleri ve JavaScript kaynakları herkese açıktır. Giriş ekranı bir kullanım/öğrenci tanıma kapısıdır; statik dosyalar için sunucu erişim kontrolü değildir. Tam korumalı ders dosyaları istenirse derslerin de yetki kontrolü yapılan bir sunucuya taşınması gerekir.

Öğrenci listesi yalnızca `private/roster.json` ve D1 içindedir. `private/`, SQLite, kurulum özetleri ve özel aktarım SQL dosyaları Git'e ve `_site` yayın klasörüne girmez. Tarayıcıya ad listesi veya yönetici şifresi gömülmez. Yönetici şifresi tuzlu PBKDF2 özeti olarak saklanır; oturum anahtarlarının sunucuda yalnızca SHA-256 özeti tutulur. Tarayıcı oturumu sessionStorage'dadır. CSV ve rapor endpointleri sunucuda yönetici yetkisi ister.

## Yerelde açmak

Node.js 22.13 veya üzeri gerekir. Mevcut bilgisayarda Codex'in Node çalışma zamanı da kullanılabilir.

1. `Baslat.cmd` dosyasını çalıştırın. İlk açılışta `Kurulum.ps1` gizli bir yönetici şifresi belirletir.
2. Terminalin yazdığı http://127.0.0.1:8787/ adresini açın.
3. Öğrenci adıyla giriş yapın; öğretmen için `/admin.html` kullanın.

Tarayıcıda ilk yönetici kurulumunun alternatifi: yerel sunucu açıkken `/setup.html`. Bu endpoint yalnız yerel sunucuda ve ilk kurulumda çalışır, Cloudflare'da yoktur. Şifreyi değiştirmek yönetim panelinden yapılır; diğer yönetici oturumları kapanır.

Yerel `private/activity.sqlite` ve Cloudflare D1 ayrı veritabanlarıdır. Yerel deneme hareketleri canlı kayıtları doldurmaz. Özel klasörünüzü bilgisayar yedeğinde saklayın, GitHub'a yüklemeyin.

## Cloudflare kurulumu / tekrar yayın

İlk veritabanı ve Worker hesabınızda oluşturulmuştur; gerçek D1 kimliği `backend/wrangler.jsonc` içindedir. Bunlar parola değildir. Şifre/anahtar bu dosyaya yazılmaz.

Resmî Wrangler ile hesabınıza giriş yapın, sonra `backend` klasöründe:

```powershell
npx wrangler@4 login --scopes account:read user:read workers:write workers_scripts:write d1:write
npx wrangler@4 d1 migrations apply english-student-access --remote
npx wrangler@4 deploy
```

Yerelde oluşturulan yönetici özetini gizli stdin akışıyla Cloudflare'a vermek için proje kökünde (hash'i ekrana yazdırmayın):

```powershell
node backend/export-admin-hash.mjs | npx wrangler@4 secret put ADMIN_PASSWORD_HASH --config backend/wrangler.jsonc
```

Öğrenci listesi ilk kez aktarılmıştır. Yeni listeyi aynı kimlikleri koruyarak yeniden aktarmak için `Kurulum.ps1 -Islem OgrencileriAktar -ServisAdresi https://KENDI-WORKER-ADRESINIZ` kullanılır. Mevcut bir öğrencinin kapatılmış erişimi yeniden içe aktarımla kendiliğinden açılmaz. Görsellerde reddedilmiş/bekleyen üç kayıt aktarılmaz.

`assets/access-config.js` içindeki `apiBase`, yalnızca Worker HTTPS adresidir. Parola, ad listesi ve erişim anahtarı eklenmez. Bağlantı eksikken genel site girişe kapalı kalır; GitHub Actions da bağlantısız sürümü yayımlamayı durdurur.

## Ders eklemek

Kendi HTML dersinizi `lessons/a1`, `lessons/a2`, `lessons/b1` veya `lessons/yds` klasörüne yükleyin. GitHub Pages iş akışı katalog üretir ve yayın kopyasına giriş/takip scriptlerini ekler. Kaynak HTML'nin çevrimdışı içeriği yeniden yazılmaz. Ders dosyasının `<title>` ve isteğe bağlı `lesson-meta` JSON bilgileri kullanılır. YDS değişiklikleri `yds-src/` içinden yapılır. Eski yerel ders hazırlama aracı `lesson-upload.html` dosyasında saklanmıştır; yayınlanmaz.

## Kontroller

```powershell
npm run build
npm run check:build
npm run check:yds
npm run test:access
node scripts/test-auth-client.cjs
node scripts/test-dashboard.cjs
```

API ve SQLite, tarayıcı giriş/rol/yönlendirme, yönetim paneli verileri ve çevrimdışı kuyruk için otomatik testler vardır. Kullanıcı arayüzü otomasyonu bu oturumda kullanılamadığından görsel tarayıcı kontrolü yapılmamıştır.

Teknik sınırlar için [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) ve [Cloudflare D1 limitleri](https://developers.cloudflare.com/d1/platform/limits/) esas alınmıştır. Workers PBKDF2 işlem sınırına uygun özet biçimi kullanılır ([Cloudflare workerd](https://github.com/cloudflare/workerd/pull/7550)). Cloudflare ücretsiz planının günlük kaynak limitleri vardır.
