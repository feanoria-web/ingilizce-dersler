param([ValidateSet('Yerel','OgrencileriAktar')][string]$Islem='Yerel',[string]$ServisAdresi='')
$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
$taskNode=(Get-Command node -ErrorAction SilentlyContinue).Source
if(-not $taskNode){$taskNode=Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'}
if(-not(Test-Path -LiteralPath $taskNode)){throw 'Node.js 22.13 veya üzerini kurun.'}
if($Islem -eq 'OgrencileriAktar' -and -not $ServisAdresi){$ServisAdresi=Read-Host 'Kayıt servisi HTTPS adresi'}
$taskSecure=Read-Host 'Yönetici şifresi (en az 12 karakter)' -AsSecureString
$taskPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecure)
try {
  $taskPassword=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPtr)
  if($Islem -eq 'Yerel'){
    $taskConfirm=Read-Host 'Yönetici şifresini tekrar yazın' -AsSecureString
    $taskConfirmPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskConfirm)
    try {if($taskPassword -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskConfirmPtr)){throw 'Şifreler aynı değil.'}}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskConfirmPtr)}
  }
  $taskJson=@{password=$taskPassword;apiBase=$ServisAdresi}|ConvertTo-Json -Compress
  $taskMode=if($Islem -eq 'Yerel'){'setup'}else{'import'}
  $taskJson | & $taskNode (Join-Path $taskRoot 'backend/manage.mjs') $taskMode
  if($LASTEXITCODE -ne 0){throw 'Kurulum tamamlanamadı.'}
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPtr)
  $taskPassword=$null;$taskJson=$null
}
