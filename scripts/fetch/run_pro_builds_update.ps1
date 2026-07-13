$ErrorActionPreference = "Stop"

$required = @("STARROCKS_HOST", "STARROCKS_PORT", "STARROCKS_USER", "STARROCKS_PASSWORD")
foreach ($name in $required) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
        throw "Missing required environment variable: $name"
    }
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$logDir = Join-Path $root ".cache\pro-builds-logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$log = Join-Path $logDir "update-$stamp.log"

Push-Location $root
try {
    & python "scripts/fetch/update_pro_builds.py" 2>&1 | Tee-Object -FilePath $log
    if ($LASTEXITCODE -ne 0) {
        throw "Professional-build update failed with exit code $LASTEXITCODE; see $log"
    }
}
finally {
    Pop-Location
}
