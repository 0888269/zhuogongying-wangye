param([string]$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path)
$ErrorActionPreference = 'Stop'
$bridgeData = Join-Path $env:LOCALAPPDATA 'FeishuCodexBridge'
New-Item -ItemType Directory -Path $bridgeData -Force | Out-Null
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $bridgeData /inheritance:r /grant:r "${identity}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict access to the configuration directory.' }
$configFile = Join-Path $bridgeData 'config.json'
if (Test-Path -LiteralPath $configFile) {
    throw "Configuration already exists at $configFile. Edit that file locally to update it."
}
Write-Host 'Create a self-built Feishu app at https://open.feishu.cn/app (see README.md).'
Write-Host 'Enable Bot, enable long-connection events, subscribe to im.message.receive_v1, and publish it to yourself.'
$appId = Read-Host 'Feishu App ID'
$secretInput = Read-Host 'Feishu App Secret (hidden)' -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretInput)
try { $appSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer) }
if ([string]::IsNullOrWhiteSpace($appId) -or [string]::IsNullOrWhiteSpace($appSecret)) { throw 'App ID and Secret are required.' }
$codexPath = (Get-Command codex -ErrorAction Stop).Source
$config = @{
    appId = $appId.Trim(); appSecret = $appSecret; domain = 'feishu';
    codexPath = $codexPath; defaultProject = 'website';
    projects = @{ website = (Resolve-Path -LiteralPath $ProjectPath).Path }
}
[IO.File]::WriteAllText($configFile, ($config | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
$appSecret = $null
Write-Host "Saved private configuration to $configFile"
Write-Host 'Starting the bridge. Pair from mobile or desktop Feishu using the code below.'
& (Join-Path $PSScriptRoot 'run.ps1') -Once
