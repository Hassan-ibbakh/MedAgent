$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $repo '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
    & python -m venv (Join-Path $repo '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'La création du venv a échoué.' }
}
& $venvPython -m pip install -r (Join-Path $repo 'backend\requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'L’installation des dépendances Python a échoué.' }
Push-Location (Join-Path $repo 'frontend')
try {
    & npm.cmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'L’installation npm a échoué. Vérifiez l’accès au registre npm.' }
} finally { Pop-Location }
