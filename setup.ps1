param([string]$Python)
$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
if (-not $Python) {
    foreach ($candidate in @('py', 'python', 'python3')) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($command -and $command.Source -notlike '*WindowsApps*') {
            $Python = $command.Source
            break
        }
    }
}
$venvPython = Join-Path $projectDirectory '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) {
    if (-not $Python) { throw 'Instala Python 3.10+ o pasa -Python C:\ruta\python.exe.' }
    & $Python -m venv (Join-Path $projectDirectory '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el entorno virtual.' }
}
& $venvPython -m pip install -e $projectDirectory
if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación de dependencias.' }
& $venvPython -m pip check
if ($LASTEXITCODE -ne 0) { throw 'Hay dependencias incompatibles en el entorno.' }
& (Join-Path $projectDirectory 'mirros.cmd') --diagnose
if ($LASTEXITCODE -ne 0) { Write-Warning 'Revisa el servicio USB de Apple antes de conectar el iPhone.' }
Write-Host 'Listo. Conecta el iPhone y ejecuta .\mirros.cmd'
