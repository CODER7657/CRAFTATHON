param(
    [string]$EnvFile = "D:/craftathon/backend-ai/.env",
    [string]$NodeName = "worker-local@$env:COMPUTERNAME",
    [string]$Pool = "solo",
    [string]$LogLevel = "INFO"
)

$ErrorActionPreference = "Stop"

function Set-EnvFromFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        throw "Env file not found: $Path"
    }

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            return
        }

        $name, $value = $line.Split("=", 2)
        $name = $name.Trim()
        $value = $value.Trim()

        if ($value.StartsWith('"') -and $value.EndsWith('"') -and $value.Length -ge 2) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        if ($name) {
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

function Ensure-RedisTlsFlag {
    param([string]$Url)

    if (-not $Url) {
        return $Url
    }

    if ($Url -like "rediss://*" -and $Url -notmatch "ssl_cert_reqs=") {
        if ($Url.Contains("?")) {
            return "$Url&ssl_cert_reqs=CERT_NONE"
        }
        return "$Url?ssl_cert_reqs=CERT_NONE"
    }

    return $Url
}

Set-Location "D:/craftathon/backend-ai"
Set-EnvFromFile -Path $EnvFile

$env:PYTHONPATH = "D:/craftathon/backend-ai"
$env:CELERY_BROKER_URL = Ensure-RedisTlsFlag -Url $env:CELERY_BROKER_URL
$env:CELERY_RESULT_BACKEND = Ensure-RedisTlsFlag -Url $env:CELERY_RESULT_BACKEND

Write-Host "Starting Celery worker..."
Write-Host "Node name: $NodeName"
Write-Host "Broker: $env:CELERY_BROKER_URL"

& "D:/craftathon/backend-ai/.venv/Scripts/python.exe" -m celery -A app.celery_app:celery worker --loglevel=$LogLevel --pool=$Pool -n $NodeName
