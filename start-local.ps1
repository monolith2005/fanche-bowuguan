param([switch]$ResetKeys)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $workspace

$secretDirectory = Join-Path $env:LOCALAPPDATA 'FailureMuseum\secrets'
$arkSecretFile = Join-Path $secretDirectory 'ark-key.dpapi'
$redfoxSecretFile = Join-Path $secretDirectory 'redfox-key.dpapi'

if ($ResetKeys) {
  Remove-Item -LiteralPath $arkSecretFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $redfoxSecretFile -Force -ErrorAction SilentlyContinue
  Write-Host '已清除本机加密保存的 API Key。' -ForegroundColor Yellow
}

function Convert-SecureValueToPlain([Security.SecureString]$SecureValue) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Set-ProcessSecret([string]$EnvironmentName, [string]$SecretFile, [string]$PromptText) {
  if ([Environment]::GetEnvironmentVariable($EnvironmentName, 'Process')) { return }
  $secureValue = $null
  if (Test-Path -LiteralPath $SecretFile) {
    try {
      $encryptedValue = (Get-Content -LiteralPath $SecretFile -Raw -Encoding utf8).Trim()
      $secureValue = $encryptedValue | ConvertTo-SecureString
      Write-Host "$EnvironmentName 已从本机加密凭据加载。" -ForegroundColor DarkGray
    }
    catch {
      Write-Host "$EnvironmentName 的加密凭据无法读取，将重新配置。" -ForegroundColor Yellow
    }
  }
  if (-not $secureValue) {
    Write-Host $PromptText -ForegroundColor Cyan
    $secureValue = Read-Host $EnvironmentName -AsSecureString
    $plainValue = Convert-SecureValueToPlain $secureValue
    if (-not $plainValue) { return }
    New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
    $secureValue | ConvertFrom-SecureString | Set-Content -LiteralPath $SecretFile -Encoding utf8
    Write-Host "$EnvironmentName 已使用当前 Windows 账户加密保存。" -ForegroundColor Green
    [Environment]::SetEnvironmentVariable($EnvironmentName, $plainValue, 'Process')
    return
  }
  $plainValue = Convert-SecureValueToPlain $secureValue
  if ($plainValue) { [Environment]::SetEnvironmentVariable($EnvironmentName, $plainValue, 'Process') }
}

Set-ProcessSecret 'ARK_API_KEY' $arkSecretFile '请输入火山方舟 API Key。输入不会显示；将使用当前 Windows 账户加密保存。'
Set-ProcessSecret 'REDFOX_API_KEY' $redfoxSecretFile '请输入 Redfox 抖音检索 API Key。输入不会显示；将使用当前 Windows 账户加密保存。'

$env:ARK_MODEL = if ($env:ARK_MODEL) { $env:ARK_MODEL } else { 'doubao-seed-2-0-lite-260428' }
Write-Host '正在启动翻车博物馆：http://127.0.0.1:5173/web/' -ForegroundColor Green
Write-Host "方舟模型：$env:ARK_MODEL" -ForegroundColor DarkGray
Write-Host "加密凭据目录：$secretDirectory" -ForegroundColor DarkGray
Write-Host '保持此窗口开启；按 Ctrl+C 停止服务。' -ForegroundColor DarkGray
python local_server.py
