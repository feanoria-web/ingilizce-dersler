# English · öğrenci girişi ve öğretmen takibi

Gürkan Öztürk · Hüdavendigar Sosyal Gelişim Merkezi

Ana site: https://feanoria-web.github.io/ingilizce-dersler/

## Android uygulaması

`android/` mevcut siteyi Chrome ve diğer uyumlu tarayıcıların Trusted Web Activity altyapısıyla açar. Seslendirme, sözlük, indirme, giriş, loglar ve mola özetleri aynı siteden çalışır. Güncel ders listesi ana menü açıldığında, tekrar ön plana geldiğinde ve görünürken her 60 saniyede ağdan kontrol edilir; seçili seviye, arama ve ekran konumu korunur. Ders çalışırken otomatik sayfa yenilenmez. Yeni ders için APK veya Play sürümü çıkarmak gerekmez; GitHub Pages yayınının tamamlanması gerekir.

Web manifesti ve service worker yalnız `ingilizce-dersler/` kapsamında çalışır. Dersler, katalog, giriş ve API yanıtları service worker önbelleğine yazılmaz. Yalnız bağlantı mesajı çevrimdışı gösterilir. Android 8.0 ve üzeri ile güncel, TWA destekleyen bir tarayıcı gerekir. Öğrenci girişinin ayrı tarayıcı sekmeleriyle otomatik paylaşılacağı varsayılmaz.

İmzalı APK/AAB üretimi: `scripts/build-android.ps1`; yapılandırma ve Play imzalama açıklamaları: `android/README.md`. Betik özel anahtar ve parolayı depo dışındaki `Android-Imza-Yedegi` klasöründe saklar, uygulamaya veya GitHub'a koymaz. Güncellemeler için bu yedeği koruyun. CI yalnız deneme APK'sını ve imzasız AAB'yi doğrular; mağazaya yayın yapmaz. Mağaza metni `android-store/MAGAZA-METNI.md`, herkese açık gizlilik ve veri silme iletişimi `privacy.html` içindedir.

Tam ekran site doğrulaması `https://feanoria-web.github.io/.well-known/assetlinks.json` adresindedir; ayrı `feanoria-web.github.io` deposu kök dosyayı yayımlar. Play farklı uygulama imzalama anahtarı kullanırsa o sertifikanın parmak izi de mevcut listeye eklenmelidir.

## Telefon görünümü ve yükleme

Yayın kopyalarına `scripts/build-mobile.mjs` ile ortak mobil düzen ve ders ailesine uygun CSS eklenir. 15 mevcut ders, seviye menüsü, giriş ve öğretmen raporları 320–760 piksel genişliklerde daha büyük dokunma alanları ve okunabilir formlar kullanır. Ders yapısına göre üst araçlar kaydırılır ve alt ders çubuğu iki sıraya yerleşir. Sözlük ve panel bağlantısı telefonlarda mevcut üst araç çubuğuna taşınır; soruların üstünü örtmez. Aynı düğmeler ve olay bağlantıları korunur, masaüstüne dönünce eski yerlerine geri dönerler. Geniş tablolar kendi alanında kayar; masaüstü ve yazdırma düzeni mobil kuralların dışında kalır. Bağımsız kaynak derslerin stilleri değiştirilmez.

8 KB üzerindeki gömülü resim, ses, PDF ve Word belgeleri yalnız yayın sırasında SHA-256 adlarıyla `assets/media/` altına çıkarılır. Dosyaların baytları değişmez, aynı içerikler birleştirilir ve göreli bağlantılar korunur. Böylece örneğin A2 ek çalışmanın başlangıç HTML'si yaklaşık 7,1 MB'den 0,21 MB'ye düşer; ekler gerektiğinde yüklenir. Yeni içerik yeni bir dosya adresi alır. Yalnız bu içerik adresli herkese açık medya normal HTTP önbelleğini kullanabilir; ders HTML'si, katalog, giriş ve rapor yanıtları eski sürümden sunulmaz. Service worker'ın çevrimdışı deposunda yine yalnız bağlantı mesajı vardır.

YDS kelime kartı çevirmek tüm kelime listesini yeniden oluşturmaz; aramalar 150 ms bekletilerek Android klavyede gereksiz yeniden çizim azaltılır. Dokunarak kaydırmada aynı takip hesabını defalarca çalıştırmamak için hareket sinyalleri saniyede bir örneklenir; ilk gerçek hareketle hareketsizlikten dönüş hemen kaydedilir, 330 saniye eşiği ve mevcut kayıt yapısı korunur.

## YDS hap bilgi atölyesi

YDS Grammar Studio içindeki “Hap bilgi” alanı mevcut 12 üniteyi ve ilk soru bankasını koruyarak ek çalışma sunar. Yeni içerik `yds-src/data/capsules-01-06.json` ve `capsules-07-12.json` dosyalarındadır. Her kart kısa açıklama, yapı, bağlam ipucu, kurallar, açıklamalı İngilizce–Türkçe örnekler, sık hatalar ve çözüm yaklaşımı içerir. Ayrıntılar açılır bölümlerde tutulur. Karttan ilgili yeni sorulara geçilebilir; sorular ilk banka ile aynı cevap kontrolü, yanlış defteri ve süreli test akışını kullanır. Doğru cevap ve seçenek gerekçeleri kontrol işleminden sonra gösterilir.

Kapsam için Nesibe Sevgi Öndeş’in *English Grammar Inside and Out* kitabının 12 üniteli konu haritası ve kullanıcı tarafından sağlanan 20 sayfalık Pegem ön izleme PDF’si incelenmiştir. İkinci dosyanın ilk bölümünde *YDS Çıkmış Sorular* (2025), ikinci bölümünde Sibel Yücel’in *YDS–YÖKDİL Grammar Book* (8. baskı, 2023) ön izlemesi bulunur. Anlatımlar, örnekler ve ek sorular bu site için özgün hazırlanır; kitap PDF’leri ve çıkmış sorular yayımlanmaz. Çalışma testleri resmî sınav veya puan tahmini değildir.

`scripts/build-yds.mjs` ek içerikte kimlikleri, mevcut ünite/konu bağlantılarını, kart–soru eşleşmelerini ve beş seçeneğin açıklamalarını doğrular. Kaynak JSON düzenlendikten sonra `npm run build`, `npm run check:build`, `npm run check:yds` ve `npm run test:access` çalıştırılır. Üretilen `lessons/yds/grammar-studio.html` tek başına düzenlenmez. Kitap inceleme notları yalnız Git’e alınmayan `private/yds-research/` klasöründedir.

## Öğrenci girişi ve kayıtlar

Öğrenci tek şifre alanına kendi adını veya ad-soyadını yazar. Büyük/küçük harf, Türkçe karakterler ve boşluklar eşitlenir. Aynı kısa ad birden fazla öğrenciyi gösteriyorsa tam ad istenir. A1, A2 ve B1 sınıfı rapor filtresidir; herkes aynı ders paneline erişir.

Öğretmen `admin.html` sayfasına ayrı, en az 12 karakterlik yönetici şifresiyle girer. Öğrenci şifresi yönetim yetkisi vermez. Yönetim panelinde giriş yapan/yapmayan öğrenciler, ilk ve son girişler, seçili dönemde açılan dersler, etkinlik geçmişi, yaklaşık aktif süre, CSV çıktısı ve öğrenci erişimi açma/kapatma bulunur. Tarihler İstanbul saatidir. "Hiç giriş yapmadı" tüm geçmişe bakar; tarih filtresi eski bir ziyaretçiyi hiç giriş yapmamış saymaz.

## Öğretmen rehberleri

`teacher-guides.html` mevcut yönetici şifresiyle açılır. Yönetim panelinden veya yönetici oturumuyla açılan dersin üstündeki “Öğretmen rehberi” bağlantısından erişilir. Öğrenci oturumları bu bağlantıyı görmez. Rehber metinleri, gözlem notları ve öğretmen cevap anahtarları herkese açık ders HTML’sinde veya yayın medyasında bulunmaz; D1’deki ayrı rehber tablolarından, her istekte yönetici oturumu doğrulandıktan sonra alınır. Yanıtlar önbelleğe alınmaz. Oturum bitişi, çıkış ve sayfadan ayrılma özel içeriği ekrandan temizler.

Yeni, öğretmen notları içeren bir ders yayımlamadan önce `node scripts/extract-teacher-guides.mjs --apply` çalıştırılır. Kaynak yedekleri ve çıkarılan rehberler Git’e girmeyen `private/teacher-guides-original/` ile `private/teacher-guides.json` altında korunur. Ardından `node scripts/prepare-teacher-guides-import.mjs` ile özel SQL hazırlanır ve `npx --yes wrangler@4 d1 execute english-student-access --remote --config backend/wrangler.jsonc --file private/teacher-guides-import.sql` ile mevcut özel tablolara aktarılır. İlk kurulumda önce `0005_teacher_guides.sql` geçişi uygulanmalıdır. SQL aktarımı yalnız rehber tablolarını değiştirir. Öğrenci içeriği düzenlenen mevcut derslerde öğretmen metinleri yeniden eklenirse yayın denetimi durur; öğretmen metinleri özel rehber kaynağında düzenlenmelidir.

Yayın denetimi yeni veya daha önce ayrılmış derslere yanlışlıkla öğretmen verisi gömülmesini reddeder. Yerel yedekleri Git’e veya yayın klasörüne eklemeyin. Bu erişim kontrolü güncel uygulama ve yayın dosyalarına uygulanır; daha önce yayımlanmış kopyalar ile Git geçmişini silmez.

`support.html` iletişim ve kullanım yardımını içerir. Ayrıntılı gizlilik bilgilendirmesi ayrı `privacy.html` sayfasındadır.

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

## Öğrenme analizi ve ayrıntılı loglar

Yönetimdeki **Öğrenme analizi** bölümü öğrenci, grup ve tarih filtreleriyle soru/tekrar sürelerini, sistemdeki gerçek ilk denemeyi, doğruya dönüşü, gözlenen yardım kullanımını, tekrar eden konu hatalarını, sayfa sürelerini, zaman çizelgesini, mola seçimlerini, sözlükte aranan kelimeleri ve kaldığı yeri gösterir. Açılan, puanlanan yanıt verilen ve kullanıcı tarafından tamamlandı işaretlenen sayfalar ayrı sayılır. Mola ve kaynak sayfaları dersin tamamlanma paydasına katılmaz.

Soru metni gerçekten ekranda görünür olduğunda zamanlama başlar; yalnız ekran açılışı biliniyorsa süre **ekran süresi** olarak etiketlenir. Aktif süre, bu aralıkta sayfanın ön planda, odakta ve yakın zamanda etkileşim almış olduğu gözlenen süredir; soruya bakıldığının veya bağımsız çözümün kanıtı değildir. İpucu/çeviri/yanıt açılması ve değerlendirmeden sonra gösterilen doğru yanıt sonraki denemelerin yardım geçmişine taşınır. Yardım durumu öğrenci ve ders bazında bu cihazda saklanır. İlk deneme, sistemde kayıtlı ilk denemedir; eski veya gözlenemeyen yardım/süre bilgileri bilinmiyor kalır.

Sözlük kayıtları yalnız açıkça aranan veya seçilen İngilizce ifadeyi ve arama sonucunu içerir; çevre cümlesi, yazılmakta olan cevaplar ve öğretmen notları alınmaz. Mola kaydı seçilen özetleri, seçilen süreyi, duraklatmaları ve süre dolması/erken kapatma/ayrılma nedenini içerir. Sayfa ve soru süreleri toplam katılım süresine yeniden eklenmez. Ayrıntılar CSV'de de bulunur; analiz API'si yalnız yöneticiye açıktır.

Yeni metadata `backend/migrations/0004_learning_insights.sql` ile eklenen tabloda saklanır. `/api/admin/learning` en fazla 40.000 dönem kaydını ve 40.000 gerçek ilk denemeyi tarar; zaman çizelgesi son 300 olayla sınırlıdır. Sınıra ulaşılırsa panel tarih/öğrenci filtresini daraltmayı söyler. Güncellemeler kaynak HTML yerine yayın kopyalarına uygulanır; mevcut açık ders sayfaları yeni izleme kodunu almak için bir kez yenilenmelidir.

## Sınav sonuçları sayfasına erişim

Yönetimdeki **Sonuçlara erişim** sekmesi, etkin öğrencilerden “Sınav sonuçlarım” sayfasını açanları ve henüz kayıtlı açılışı bulunmayanları gösterir. İlk/son açılış, açılış sayısı ve öğrenci/grup/durum filtreleri bulunur. Bu izleme devreye alındıktan sonraki açılışları kapsar; geçmişe görüntüleme kaydı eklenmez.

Giriş doğrulandıktan ve sonuçlar başarıyla ekrana yerleştirildikten sonra, sayfa görünür ve pencere odaktaysa `POST /api/exam-results/view` çağrılır. Arka sekme, başarısız sonuç yüklemesi ve öğretmen önizlemesi kayıt oluşturmaz. Yeniden gönderimler aynı sayfa UUID’sini kullanır; sunucu, öğrenci kimliğini oturumdan ve zamanı kendi saatinden alır. Kayıt tüm soruların okunduğu anlamına gelmez. `exam_results_view` olayı ayrıntılı log ve CSV’de de yer alır; rapor API’si yalnız yöneticiye açıktır.

İlk yayın için `backend/migrations/0007_exam_result_views.sql` geçişi uygulanır, Worker ve site birlikte güncellenir. Hesaplara giriş yöntemi bu özellik tarafından değiştirilmez.

## Çevrim içi sınava girme

Özel `exam.json` dosyasında `"online": true` olan yayımlanmış bir sınavda sonucu bulunmayan öğrenci, “Sınav sonuçlarım” sayfasında **Sınava gir** düğmesini görür. `GET /api/exams/<kimlik>/paper` aynı soruları ve seçenekleri verir; cevap anahtarı, açıklamalar ve sınıf sonuçları gönderimden önce gelmez. Yazma bölümü B1/YDS öğrencilerinde B, diğerlerinde A setinden sorulur. Yarım kalan cevaplar yalnız bu cihazda saklanır ve **Sınava devam et** ile sürdürülür.

`POST /api/exams/<kimlik>/submit` tek gönderim kabul eder: test kısmı sunucuda puanlanır, yazma kısmı “öğretmen değerlendirmesi bekleniyor” olarak kaydedilir. Sonucu olan öğrenci aynı sınava yeniden giremez. Kâğıt sonuçlarını yeniden aktarmak çevrim içi gönderimleri silmez. Yazma geri bildirimi eklemek için gönderim `"source": "online"` ile `results.json` dosyasına alınıp aktarım yeniden yapılır.

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
