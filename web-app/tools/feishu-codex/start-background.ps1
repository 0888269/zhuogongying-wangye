$ErrorActionPreference = 'Stop'
$bridgeData = Join-Path $env:LOCALAPPDATA 'FeishuCodexBridge'
if (-not (Test-Path -LiteralPath (Join-Path $bridgeData 'state.json'))) {
    throw 'Run setup.ps1 and pair your Feishu account before starting in the background.'
}
$state = Get-Content -LiteralPath (Join-Path $bridgeData 'state.json') -Raw | ConvertFrom-Json
if (-not $state.owner) { throw 'Pair your Feishu account first.' }
$shellPath = (Get-Process -Id $PID).Path
$scriptPath = Join-Path $PSScriptRoot 'run.ps1'
$process = Start-Process -FilePath $shellPath -ArgumentList @('-NoProfile', '-File', "`"$scriptPath`"") -WindowStyle Hidden -PassThru
Write-Host "Background supervisor started (PID $($process.Id)). Keep this PC awake and online."
