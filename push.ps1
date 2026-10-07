$ErrorActionPreference = 'Stop'
try {
    Set-Location -LiteralPath $PSScriptRoot
    $repoPath = $PSScriptRoot.Replace('\', '/')
    Write-Host "Repository: $PSScriptRoot"
    Write-Host 'Pushing committed main to origin...'

    # Prefer Git's usual credentials. Use the previously authenticated CLI when available.
    $ghCommand = Get-Command gh -ErrorAction SilentlyContinue
    $portableGh = Join-Path $env:TEMP 'codex-shoot-github-cli\bin\gh.exe'
    $ghPath = if ($ghCommand) { $ghCommand.Source } elseif (Test-Path -LiteralPath $portableGh) { $portableGh } else { $null }
    $gitOptions = @('-c', "safe.directory=$repoPath")
    if ($ghPath) {
        $helper = '!"' + $ghPath.Replace('\', '/') + '" auth git-credential'
        $gitOptions += @('-c', 'credential.helper=', '-c', "credential.helper=$helper")
    }
    & git @gitOptions push origin main
    if ($LASTEXITCODE -ne 0) { throw "Push failed (exit code $LASTEXITCODE)." }
    Write-Host 'Push completed.' -ForegroundColor Green
    & git -c "safe.directory=$repoPath" status --short --branch
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
    Read-Host 'Press Enter to close'
}
