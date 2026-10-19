# English · öğrenci girişi ve öğretmen takibi

Gürkan Öztürk · Hüdavendigar Sosyal Gelişim Merkezi

Ana site: https://feanoria-web.github.io/ingilizce-dersler/

Öğrenci tek şifre alanına kendi adını veya ad-soyadını yazar. Büyük/küçük harf, Türkçe karakterler ve boşluklar eşitlenir. Aynı kısa ad birden fazla öğrenciyi gösteriyorsa tam ad istenir. A1, A2 ve B1 sınıfı rapor filtresidir; herkes aynı ders paneline erişir.

Öğretmen `admin.html` sayfasına ayrı, en az 12 karakterlik yönetici şifresiyle girer. Öğrenci şifresi yönetim yetkisi vermez. Yönetim panelinde giriş yapan/yapmayan öğrenciler, ilk ve son girişler, seçili dönemde açılan dersler, etkinlik geçmişi, yaklaşık aktif süre, CSV çıktısı ve öğrenci erişimi açma/kapatma bulunur. Tarihler İstanbul saatidir. "Hiç giriş yapmadı" tüm geçmişe bakar; tarih filtresi eski bir ziyaretçiyi hiç giriş yapmamış saymaz.

## Kayıtların anlamı

Sunucu giriş/çıkış, panel/derse giriş, etkinlik ekranı, cevap kontrol/göster, kelime anlamı açma, yerleşik ses kaydını oynatma/tamamlama ve tamamlandı işaretlerini kaydeder. Otomatik değerlendirilen sorularda soru, verilen cevap, doğru cevap, doğru/yanlış/boş sonucu ve deneme sayısı tutulur. Sonuçlar ders uygulamasının değerlendirmesinden gelir; resmî sınav veya değiştirilemez başarı kanıtı değildir. Öğretmen notları, değerlendirilmemiş serbest yazılar, parola, telefon ve kimlik bilgisi toplanmaz. Aktif süre yaklaşık bir kullanım ölçüsüdür: görünür sekme ve son etkileşim üzerinden en çok 30 saniyelik aralıklarla bildirilir. Gizli veya uzun süredir kullanılmayan sekme süre kazandırmaz. Adını bilen biri başka öğrenci adına girebilir.

Kesinti sırasında bekleyen en çok 300 olay yalnızca aynı öğrenci oturumuyla gönderilir. Sunucu alma zamanı ile varsa öğrenci cihazındaki zaman ayrı saklanır; cihaz zamanı kesin zaman kanıtı değildir. Çevrimdışı geçmişin tüm aktif süresi yeniden oluşturulmaz. Merkezi giriş ve takip internet bağlantısı ister. Eski bağımsız çevrimdışı ders dosyaları değişmez.

Canlı ders takibi 30 saniyede yenilenir. “Aktif etkileşim”, görünür ve odakta olan sayfada son 60 saniye içinde hareket gözlenen, son 75 saniyede güncel sinyal gönderen öğrenciyi ifade eder. Bir öğrencinin birden fazla kaydı aktif kişi sayısını artırmaz. Arka sekme, odak dışındaki pencere, hareketsizlik, çıkış veya sona ermiş oturum aktif sayılmaz. Bu durum bildirimi çevrimdışı kuyruğa alınmaz; eski olayların yüklenmesi kişiyi çevrimiçi göstermez.

## Sayfa, sekme ve hareketsizlik ayrıntıları

Her olayın bağlamında kendi sitemizdeki sayfa yolu ve başlığı, dersin ekran numarası/kimliği ve başlığı, varsa seçili iç bölüm, sayfanın görünürlüğü, pencere odağı, son etkileşim zamanı, etkileşimden beri geçen süre ve genel hareket türü tutulur. Fare/klavye/dokunma/kaydırma ayrılır; yazılan tuşun değeri, fare koordinatı, serbest notlar, şifreler, başka sitelerin adresleri ve diğer uygulamaların adı kaydedilmez.

- **Aktif etkileşim:** sayfa görünür, pencere odakta ve son hareket 60 saniyeden yeni.
- **Ön planda · etkileşim yok:** sayfa görünür ve odakta, 60 saniyeden beri hareket yok. Uzun okuma bu grupta olabilir.
- **Arka sekmede / pencere odağı başka yerde:** yalnız tarayıcının kendi görünürlük ve odak sinyali gösterilir.
- **Açık bırakılmış olabilir:** **5 dakika 30 saniye (330 saniye)** boyunca gerçek hareket görülmemiştir. Bu bir tahmindir; öğrencinin kesin dikkat veya çalışma kanıtı değildir.
- **Sinyal alınmıyor:** son güncel bildirim 75 saniyeden eskidir. Bağlantı kopması, tarayıcının uyuması ve kapanmış sayfa birbirinden kesin ayırt edilemez.
- **Sayfadan ayrıldı:** sayfa kapanma/geçiş bildirimi alınmıştır.

Sekmenin görünmesi/gizlenmesi, pencerenin odak kazanması/kaybetmesi, 60 saniyelik hareketsizlik, 330 saniyelik uzun hareketsizlik, gerçek hareketle geri dönüş ve sayfadan ayrılma zaman çizelgesinde ayrı olaylardır. Uzun hareketsizlik olayı her geçişte bir kez üretilir. Odak kazanmak, otomatik sayfa hareketi veya sekmenin yeniden görünmesi tek başına gerçek etkileşim sayılmaz. Tam sayfa geçişi yeni bir takip kaydı oluşturur; bunlar kesin açık tarayıcı sekmesi sayısı olarak yorumlanmaz.

Canlı bölüm son 30 dakikada sinyal gönderen sayfa/sekme kayıtlarını gösterir. Ayrılma kayıtları 75 saniye sonra bu bölümden düşer; kalıcı geçmiş ve ayrıntılı CSV silinmez. İstek sıra numarası, gecikmiş bir eski isteğin son ayrılma durumunu ezmesini önler. Yeni bağlamlı ve 75 saniyeden eski heartbeat tekrarları aktif süre kazandırmaz; aktif süreler görünür ve odakta geçirilen uygun önceki aralıklardan hesaplanır. Eski istemciler sınırlı ayrıntıyla desteklenir. Yeni ayrıntılar, açık ders sayfaları bir kez yenilendikten sonra birikmeye başlar; önceki kayıtlar geriye dönük zenginleştirilmez.

Ayrıntılı kayıtlar öğrenci, sınıf, tarih, olay ve sonuç ile filtrelenir. Soru bazında verilen/doğru cevaplar ve tekrar denemeleri görünür. CSV en fazla 10.000 kayıt içerir; daha büyük geçmiş için filtre daraltılır. Serbest konuşma/yazma otomatik doğru/yanlış olarak puanlanmaz. Eski sürümde tutulmayan cevap ayrıntıları sonradan üretilemez; ayrıntılar bu güncellemeden itibaren birikir. Derslerin değerlendirme bağlantıları `scripts/instrument-assessments.mjs` içinde, yalnız yayın kopyalarına uygulanır; kaynak grader değiştiğinde eşleşme denetimi hatayı bildirir.

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

Yeni eklenen dersler: A1 Ders 3 **Ben, ailem, ülkem · tekrar**, A2 Ders 4 **Duygular · evim · şehrim**, B1 Ders 5 **Evde hayat · sorunlar · talimatlar · mektup**. Kaynaklarda tarih belirtilmediği için tarih alanları boş bırakılmıştır.

## Kelime seçerek sözlük

Yayınlanan A1, A2 ve B1 derslerinde İngilizce bir kelimeyi veya en fazla beş kelimelik kısa ifadeyi seçmek, Türkçe anlamını ve İngilizce örneğini açar. Masaüstünde çift tıklama/metin seçme, telefonda uzun basarak seçme kullanılabilir. **Aa Sözlük** düğmesi ve arama alanı klavyeyle de kullanılabilir. `Escape`, kapatma düğmesi veya kutunun dışına dokunma sözlüğü kapatır; cevap yazılan alanlarda sözlük açılmaz.

Önce `word-lookup/common.json` içindeki ortak kelimeler ve dersin `LESSON.vocab` bankası kullanılır. Bu karşılıklar internet istemez. Bulunmayan ifadeler için yalnızca seçilen/aranan ifade [MyMemory](https://mymemory.translated.net/doc/spec.php) ve tek kelime örnekleri için [Free Dictionary API](https://dictionaryapi.dev/) hizmetlerine gönderilir; dersin çevre cümlesi, öğrenci adı, oturum anahtarı ve cevaplar gönderilmez. Çevrim içi karşılıklar otomatik çeviri niteliğindedir; hizmet kotası, kesinti veya örnek bulunamaması kutuda belirtilir. Sözlük örneği yoksa seçilen ders cümlesi ayrı bir “Dersten örnek” etiketiyle gösterilir. Arama belleği geçicidir, tarayıcı depolamasına yazılmaz.

`scripts/inject-word-lookup.mjs`, sözlük verisini ve sürümlü CSS/JS bağlantılarını yalnız yayın kopyalarına ekler. Böylece ileride eklenen A1/A2/B1 dersleri de aynı özelliği otomatik kazanır. Belirli bir derste kapatmak için `lesson-meta` içine `"wordLookup": false` eklenebilir. Soru, cevap, giriş ve yönetim yetkileri bu özellikten bağımsız çalışır.

## Mola sayfalarında özet döngüsü

A1, A2, B1 ve YDS derslerinde özet başlatma düğmesi yalnız mola sayfasında görünür. Molaya kadar işlenen sayfalardan istenenler seçilir; 10 veya 15 dakika boyunca kısa konu özetleri ve örnekler sırayla gösterilir. Döndürme aralığı 10, 15, 20 veya 30 saniye olabilir. Duraklatma, devam etme, sayfa seçimini değiştirme ve erken bitirme desteklenir. Mola ekranından ayrılınca gösterim kapanır ve sayaç durur. Sayfa seçimleri ders bazında bu cihazda saklanır; öğrenci yanıtları değişmez.

YDS'de konu anlatımının sonundaki **Mola sayfasına geç** bağlantısı kullanılır. Mola sayfasında işlenen son konu seçilebilir; yalnız bu konuya kadar olan özetler listelenir. Eski B1 ek çalışma kitabına iki blok arası mola sayfası eklenmiştir. Diğer derslerde mevcut mola ekranları kullanılır. Kaynak ders dosyaları yerine yayın kopyaları `scripts/inject-break-review.mjs` ile hazırlanır.

## Kontroller

```powershell
npm run build
npm run check:build
npm run check:yds
npm run test:access
node scripts/test-auth-client.cjs
node scripts/test-dashboard.cjs
```

API ve SQLite, tarayıcı giriş/rol/yönlendirme, yönetim paneli verileri ve çevrimdışı kuyruk için otomatik testler vardır. Sözlük için metin seçimi, klavye/telefon yerleşimi, Türkçe anlam ve örnekler, geç gelen yanıtların iptali ve çevrim içi hata durumları ayrıca kontrol edilir. Yeni dersler ve giriş akışı, gerçek öğrenci kayıtlarına dokunmadan bellek veritabanındaki sahte kullanıcıyla tarayıcıda doğrulanmıştır.

Teknik sınırlar için [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) ve [Cloudflare D1 limitleri](https://developers.cloudflare.com/d1/platform/limits/) esas alınmıştır. Workers PBKDF2 işlem sınırına uygun özet biçimi kullanılır ([Cloudflare workerd](https://github.com/cloudflare/workerd/pull/7550)). Cloudflare ücretsiz planının günlük kaynak limitleri vardır.
