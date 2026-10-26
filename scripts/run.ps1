$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repo '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { $python = 'python' }
$backend = Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','backend.app.main:app') -WorkingDirectory $repo -WindowStyle Hidden -PassThru
try {
    Set-Location (Join-Path $repo 'frontend')
    & npm.cmd run dev
} finally {
    if ($backend -and -not $backend.HasExited) { Stop-Process -Id $backend.Id -Force }
}
