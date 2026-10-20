# Hüdavendigar English Android uygulaması

Uygulama, mevcut ders sitesini Android tarayıcısının güvenli altyapısıyla açar. Ders dosyaları APK içine kopyalanmaz. GitHub Pages yayını tamamlanınca ana menü açılışta, görünür duruma dönüşte ve görünürken her 60 saniyede yeni dersleri kontrol eder. Seçili seviye ve arama korunur; açık ders kendiliğinden yenilenmez. Her ders için yeni APK yayımlamak gerekmez.

Site adresi: https://feanoria-web.github.io/ingilizce-dersler/index.html

Giriş, öğretmen paneli, dersler, sözlük, mola özetleri ve etkinlik kayıtları mevcut siteden çalışır. Uygulama bunlar için ayrı bir kullanıcı hesabı veya ayrı bir kayıt sistemi oluşturmaz. İnternet bağlantısı ve güncel, Trusted Web Activity destekleyen bir tarayıcı gerekir. Doğrulama tamamlanmadığında site güvenli bir tarayıcı sekmesinde açılır. Çevrimdışı ders erişimi garanti edilmez.

Ana ekran simgesine uzun basıldığında A1, A2, B1 ve YDS kısayolları kullanılabilir. Mevcut ders ekranının yeniden açılış ve arka plandan dönüş davranışı Google'ın resmî `LauncherActivity` ve kısayol etkinlikleriyle yönetilir. Uygulama kamera, mikrofon, konum, bildirim veya dosya depolama izni istemez.

## Derleme

- JDK 17.
- Android SDK Platform 36 ve Android SDK Build Tools 36.1.0.
- Gradle 8.13; Android Gradle Plugin 8.13.2.
- Android Browser Helper 2.7.4.
- Android 8.0 / API 26 ve üzeri cihazlar.

Android Studio'da bu `android` klasörünü proje olarak açın. SDK konumunu kendi bilgisayarınızda Android Studio üzerinden veya Git'e eklenmeyen `local.properties` dosyasında belirtin. Gradle bağımlılıkları ilk derlemede internetten indirilir.

Bu klasörde, Gradle Wrapper dosyaları mevcutsa:

```powershell
.\gradlew.bat :app:assembleRelease :app:bundleRelease :app:lintRelease
```

Gradle Wrapper kaynaklarla birlikte bulunur. `gradle-wrapper.properties` dosyasındaki SHA-256 doğrulamasını koruyun.

Çıktılar:

- Doğrudan kurulum için `app/build/outputs/apk/release/` altında APK.
- Google Play'e yüklemek için `app/build/outputs/bundle/release/app-release.aab`.
- Denetim raporu: `app/build/reports/lint-results-release.html`.

## İmzalama

APK'nın kurulabilmesi ve AAB'nin Play Console'a yüklenebilmesi için yayımlama anahtarıyla imzalanması gerekir. Dört ortam değişkenini güvenli yerel ortamda tanımlayın:

```text
ENGLISH_KEYSTORE           Anahtar dosyasının mutlak yolu
ENGLISH_KEY_ALIAS          Anahtar adı
ENGLISH_KEYSTORE_PASSWORD  Anahtar deposu parolası
ENGLISH_KEY_PASSWORD       Anahtar parolası
```

Bu değişkenlerin hiçbiri tanımlı değilse release çıktıları imzasız oluşturulur. Yalnız bir kısmı tanımlıysa yanlış anahtarla derleme yapılmasını önlemek için derleme durur. Parolaları ve anahtar dosyalarını kaynak koda veya GitHub'a eklemeyin. Anahtar dosyasını ve parolaları güvenli biçimde yedekleyin; doğrudan dağıtılan APK'nın sonraki sürümlerini aynı anahtarla imzalamak gerekir.

## Site ile uygulama doğrulaması

Android paketi `io.github.feanoriaweb.english` olarak sabittir. Uygulamanın site bildirimi `app/src/main/res/values/strings.xml` içindedir. Karşı yöndeki Digital Asset Links dosyası, alan adının kökünde aşağıdaki adresten HTTPS 200 yanıtıyla sunulmalıdır:

```text
https://feanoria-web.github.io/.well-known/assetlinks.json
```

Bu adres, proje sitesi içindeki `/ingilizce-dersler/.well-known/assetlinks.json` adresinden farklıdır. Tam ekran tarayıcı doğrulaması için alan adı kökündeki dosya gerekir. APK'nın imzalama sertifikasının SHA-256 parmak izi bu dosyada belirtilmelidir. Android'in uygulamaya yönlendirdiği bağlantılar yalnız `/ingilizce-dersler/` yolu ile sınırlandırılmıştır.

Google Play App Signing kullanılırsa Play'in **uygulama imzalama sertifikası**, yerel yükleme anahtarından farklı olabilir. Play Console > Uygulama bütünlüğü bölümündeki uygulama imzalama sertifikasının SHA-256 parmak izini de site dosyasına ekleyin. Doğrudan kurulan APK'lar desteklenmeye devam edecekse yerel yayımlama sertifikasının parmak izini kaldırmayın. Parola veya özel anahtar siteye yüklenmez; yalnız sertifika parmak izi yayımlanır.

## Google Play

AAB hazırlanması uygulamanın Google Play'de yayımlandığı anlamına gelmez. Play Console'da mağaza kaydı, gizlilik politikası, veri güvenliği beyanı, içerik derecelendirmesi ve hesabın gerektirdiği test/yayımlama adımları tamamlanmalıdır. Uygulama mevcut sitenin öğrenci girişini ve öğrenme etkinliği kayıtlarını kullandığından, mağaza beyanı ve gizlilik metni bu mevcut işleyişi de kapsamalıdır.

Destek: gurkangr698@gmail.com

## Kaynaklar

- [Google Android Browser Helper](https://github.com/GoogleChrome/android-browser-helper)
- [Resmî temel TWA örneği](https://github.com/GoogleChrome/android-browser-helper/tree/main/demos/twa-basic)
- [AGP 8.13 uyumluluk bilgileri](https://developer.android.com/build/releases/agp-8-13-0-release-notes)
- [Digital Asset Links başlangıç bilgileri](https://developers.google.com/digital-asset-links/v1/getting-started)

Uygulama kendi WebView ekranını, JavaScript köprüsünü veya ayrı bir veri toplama hizmetini içermez. Google Android Browser Helper bağımlılığı Apache License 2.0 kapsamında dağıtılır.
