param(
  [string]$SdkPath = $env:ANDROID_HOME,
  [string]$GradlePath,
  [string]$SigningDirectory,
  [string]$OutputDirectory,
  [switch]$RequireExistingSigning
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $projectRoot
$gradleConfig = Get-Content -LiteralPath (Join-Path $projectRoot 'android\app\build.gradle') -Raw
$versionMatch = [regex]::Match($gradleConfig, "versionName\s+'(\d+\.\d+\.\d+)'")
if (!$versionMatch.Success) { throw 'Gradle dosyasında geçerli sürüm numarası bulunamadı.' }
$versionName = $versionMatch.Groups[1].Value
if (!$SdkPath) { $SdkPath = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'AppData\Local\Android\Sdk' }
if (!$SigningDirectory) { $SigningDirectory = Join-Path $workspaceRoot 'Android-Imza-Yedegi' }
if (!$OutputDirectory) { $OutputDirectory = Join-Path $workspaceRoot 'Android-Uygulama' }
if (!$env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Java\jdk-17' }
if (!(Test-Path -LiteralPath (Join-Path $SdkPath 'platforms\android-36\android.jar'))) { throw 'Android SDK API 36 bulunamadı. -SdkPath ile SDK klasörünü belirtin.' }
$env:ANDROID_HOME = $SdkPath
$env:GRADLE_USER_HOME = Join-Path $workspaceRoot 'tmp\android-toolchain\gradle-home'
$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
if (!(Test-Path -LiteralPath $keytool)) { throw 'Java 17 JDK bulunamadı. JAVA_HOME değerini ayarlayın.' }
New-Item -ItemType Directory -Force -Path $SigningDirectory,$OutputDirectory | Out-Null
$credentialsPath = Join-Path $SigningDirectory 'signing-private.json'
$keystore = Join-Path $SigningDirectory 'hudavendigar-english-release.jks'
if ($RequireExistingSigning -and (!(Test-Path -LiteralPath $credentialsPath) -or !(Test-Path -LiteralPath $keystore))) {
  throw 'Güncelleme aynı anahtarla imzalanmalı; mevcut yayın anahtarı veya parola dosyası bulunamadı.'
}
if (!(Test-Path -LiteralPath $credentialsPath)) {
  if (Test-Path -LiteralPath $keystore) { throw 'Anahtar var ancak parola dosyası eksik. Mevcut anahtarın üzerine yazılmayacak.' }
  $random = New-Object byte[] 36
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($random)
  $secret = [Convert]::ToBase64String($random)
  @{ alias = 'english-release'; password = $secret } | ConvertTo-Json | Set-Content -LiteralPath $credentialsPath -Encoding utf8
}
$signing = Get-Content -LiteralPath $credentialsPath -Raw | ConvertFrom-Json
$env:ENGLISH_KEYSTORE = $keystore
$env:ENGLISH_KEY_ALIAS = $signing.alias
$env:ENGLISH_KEYSTORE_PASSWORD = $signing.password
$env:ENGLISH_KEY_PASSWORD = $signing.password
try {
  if (!(Test-Path -LiteralPath $keystore)) {
    & $keytool -genkeypair -keystore $keystore -storetype JKS -alias $env:ENGLISH_KEY_ALIAS -storepass:env ENGLISH_KEYSTORE_PASSWORD -keypass:env ENGLISH_KEY_PASSWORD -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Gurkan Ozturk, OU=English Lessons' -noprompt
    if ($LASTEXITCODE -ne 0) { throw 'Yayın anahtarı oluşturulamadı.' }
  }
  if (!$GradlePath) { $GradlePath = Join-Path $projectRoot 'android\gradlew.bat' }
  & $GradlePath -p (Join-Path $projectRoot 'android') --no-daemon --console=plain assembleRelease bundleRelease lintRelease
  if ($LASTEXITCODE -ne 0) { throw 'Android derlemesi başarısız.' }
  $apkPath = Join-Path $OutputDirectory ('Hudavendigar-English-'+$versionName+'.apk')
  $bundlePath = Join-Path $OutputDirectory ('Hudavendigar-English-'+$versionName+'.aab')
  Copy-Item -LiteralPath (Join-Path $projectRoot 'android\app\build\outputs\apk\release\app-release.apk') -Destination $apkPath
  Copy-Item -LiteralPath (Join-Path $projectRoot 'android\app\build\outputs\bundle\release\app-release.aab') -Destination $bundlePath
  & $keytool -exportcert -keystore $keystore -alias $env:ENGLISH_KEY_ALIAS -storepass:env ENGLISH_KEYSTORE_PASSWORD -file (Join-Path $OutputDirectory 'signing-certificate.der')
  if ($LASTEXITCODE -ne 0) { throw 'Genel sertifika dışa aktarılamadı.' }
  $fingerprint = (Get-FileHash -LiteralPath (Join-Path $OutputDirectory 'signing-certificate.der') -Algorithm SHA256).Hash -replace '(..)(?=.)','$1:'
  @(@{ relation = @('delegate_permission/common.handle_all_urls'); target = @{ namespace = 'android_app'; package_name = 'io.github.feanoriaweb.english'; sha256_cert_fingerprints = @($fingerprint) } }) | ConvertTo-Json -Depth 6 -AsArray | Set-Content -LiteralPath (Join-Path $OutputDirectory 'assetlinks.json') -Encoding utf8
  Get-FileHash -LiteralPath $apkPath,$bundlePath -Algorithm SHA256 | Select-Object @{ Name='File'; Expression={ Split-Path -Leaf $_.Path } },Hash | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputDirectory ('SHA256-'+$versionName+'.json')) -Encoding utf8
  Write-Output ('APK ve AAB hazır: '+$OutputDirectory)
  Write-Output ('Genel sertifika SHA-256: '+$fingerprint)
} finally {
  Remove-Item Env:ENGLISH_KEYSTORE,Env:ENGLISH_KEY_ALIAS,Env:ENGLISH_KEYSTORE_PASSWORD,Env:ENGLISH_KEY_PASSWORD -ErrorAction SilentlyContinue
}
