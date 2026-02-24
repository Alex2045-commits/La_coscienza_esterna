param(
    [switch]$Staged,
    [string[]]$Paths
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-PhpFilesToCheck {
    param(
        [switch]$OnlyStaged,
        [string[]]$ExplicitPaths
    )

    if ($ExplicitPaths -and $ExplicitPaths.Count -gt 0) {
        return $ExplicitPaths
    }

    if ($OnlyStaged) {
        $insideGit = $false
        try {
            $inside = git rev-parse --is-inside-work-tree 2>$null
            $insideGit = ($LASTEXITCODE -eq 0 -and "$inside".Trim() -eq "true")
        } catch {
            $insideGit = $false
        }

        if (-not $insideGit) {
            return @()
        }

        $staged = git diff --cached --name-only --diff-filter=ACMR
        if (-not $staged) {
            return @()
        }

        return $staged -split "`n" |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -and $_.ToLowerInvariant().EndsWith('.php') -and (Test-Path -LiteralPath $_) }
    }

    return Get-ChildItem -Path . -Recurse -File -Filter *.php |
        ForEach-Object { $_.FullName }
}

function Has-Utf8Bom {
    param([string]$FilePath)

    if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
        return $false
    }

    $fs = [System.IO.File]::Open($FilePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
        if ($fs.Length -lt 3) {
            return $false
        }

        $bytes = New-Object byte[] 3
        [void]$fs.Read($bytes, 0, 3)
        return ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
    } finally {
        $fs.Dispose()
    }
}

$files = Get-PhpFilesToCheck -OnlyStaged:$Staged -ExplicitPaths $Paths
if (-not $files -or $files.Count -eq 0) {
    Write-Host "No PHP files to check."
    exit 0
}

$violations = @()
foreach ($file in $files) {
    if (Has-Utf8Bom -FilePath $file) {
        $violations += $file
    }
}

if ($violations.Count -gt 0) {
    Write-Host ""
    Write-Host "ERROR: UTF-8 BOM found in PHP file(s). Commit blocked." -ForegroundColor Red
    $violations | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "Fix by re-saving each file as UTF-8 (without BOM)." -ForegroundColor Cyan
    exit 1
}

Write-Host "OK: no UTF-8 BOM found in checked PHP files."
exit 0
