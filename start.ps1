$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
$bundledPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
Write-Host 'ORBIT: http://localhost:8000  (Ctrl+C to stop)'
if ($pythonCommand) {
    & $pythonCommand.Source -m http.server 8000 --bind 127.0.0.1
} elseif (Test-Path -LiteralPath $bundledPython) {
    & $bundledPython -m http.server 8000 --bind 127.0.0.1
} else {
    throw 'Python is not installed. Use any static HTTP server, or host these files on GitHub Pages.'
}
