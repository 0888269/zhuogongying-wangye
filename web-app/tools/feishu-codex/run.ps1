param([switch]$Once)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules/@larksuiteoapi/node-sdk'))) {
    throw 'Dependencies are missing. Run npm.cmd ci in this directory first.'
}
do {
    & node (Join-Path $PSScriptRoot 'src/main.mjs')
    if ($Once -or $LASTEXITCODE -eq 0) { break }
    Write-Host 'Bridge stopped unexpectedly; retrying in 10 seconds.'
    Start-Sleep -Seconds 10
} while ($true)
