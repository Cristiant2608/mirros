param([string]$Python = (Join-Path $PSScriptRoot '.venv\Scripts\python.exe'))
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath $Python)) { throw 'Ejecuta setup.ps1 y crea el entorno Python primero.' }
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias de escritorio.' }
    & node node_modules/electron/install.js
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo descargar Electron.' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación de React.' }
    & npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas de gestos o video.' }
    & $Python -m pip install 'pyinstaller==6.22.3'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar PyInstaller.' }
    & $Python -m PyInstaller --noconfirm --distpath build/python-dist --workpath build/pyinstaller desktop/backend.spec
    if ($LASTEXITCODE -ne 0) { throw 'Falló el empaquetado del backend.' }
    if (-not (Test-Path -LiteralPath 'build/python-dist/mirros-backend/_internal/pytun_pmd3/wintun/bin/amd64/wintun.dll')) { throw 'Falta la biblioteca de transporte Wintun en el paquete.' }
    & build/python-dist/mirros-backend/mirros-backend.exe prepare --help
    if ($LASTEXITCODE -ne 0) { throw 'El backend empaquetado no puede preparar el iPhone.' }
    & build/python-dist/mirros-backend/mirros-backend.exe serve --help
    if ($LASTEXITCODE -ne 0) { throw 'El backend empaquetado no puede iniciar la transmisión.' }
    $env:ELECTRON_BUILDER_COMPRESSION_LEVEL = '5'
    & npm.cmd run pack:windows
    if ($LASTEXITCODE -ne 0) { throw 'Falló el empaquetado de Mirros.' }
    Write-Host 'Ejecutable creado en la carpeta Mirros-Windows junto al proyecto.'
} finally { Pop-Location }
