#!/usr/bin/env bash
# Asistente de configuración para MirrOS en Linux
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_PATH="$PROJECT_DIR/bin/mirros"
DESKTOP_BIN_PATH="$PROJECT_DIR/bin/mirros-desktop"
LOCAL_BIN="$HOME/.local/bin"
APPLICATIONS_DIR="$HOME/.local/share/applications"

echo "=========================================================="
echo "            Configurador de MirrOS para Linux             "
echo "=========================================================="

# 1. Comprobar usbmuxd
echo -e "\n[*] Comprobando servicio usbmuxd..."
if ! command -v usbmuxd &> /dev/null; then
    echo "[!] usbmuxd no está instalado."
    echo "    Por favor ejecuta en tu terminal:"
    echo "    Arch/CachyOS: sudo pacman -S --needed usbmuxd"
    echo "    Debian/Ubuntu: sudo apt install usbmuxd"
    echo "    Fedora: sudo dnf install usbmuxd"
    echo "    👉 sudo systemctl enable --now usbmuxd"
else
    echo "[+] usbmuxd está instalado."
    if systemctl is-active --quiet usbmuxd 2>/dev/null; then
        echo "[+] El servicio usbmuxd está activo."
    else
        echo "[!] El servicio usbmuxd está inactivo. Inícialo con:"
        echo "    👉 sudo systemctl start usbmuxd"
    fi
fi

# 2. Comprobar navegador (Chromium/Chrome)
echo -e "\n[*] Comprobando navegador compatible..."
if command -v chromium &> /dev/null; then
    echo "[+] Chromium encontrado en: $(command -v chromium)"
elif command -v google-chrome &> /dev/null; then
    echo "[+] Chrome encontrado en: $(command -v google-chrome)"
else
    echo "[!] Se recomienda instalar Chromium para el modo de ventana limpia: sudo pacman -S chromium"
fi

# 3. Entorno virtual Python y dependencias
echo -e "\n[*] Verificando entorno virtual de Python..."
if command -v uv &> /dev/null; then
    echo "[+] uv detectado: acelerando entorno virtual y dependencias..."
    if [ ! -x "$PROJECT_DIR/.venv/bin/python" ]; then
        echo "[*] Creando .venv con uv..."
        uv venv "$PROJECT_DIR/.venv"
    else
        echo "[+] Entorno virtual existente en $PROJECT_DIR/.venv"
    fi
    "$PROJECT_DIR/.venv/bin/python" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else "MirrOS requiere Python 3.10+.")'
    uv pip install -e "$PROJECT_DIR" --python "$PROJECT_DIR/.venv/bin/python"
    uv pip check --python "$PROJECT_DIR/.venv/bin/python"
else
    echo "[*] uv no detectado; utilizando python3 estándar..."
    if [ ! -x "$PROJECT_DIR/.venv/bin/python" ]; then
        echo "[*] Creando .venv e instalando dependencias..."
        python3 -m venv "$PROJECT_DIR/.venv"
    else
        echo "[+] Entorno virtual existente en $PROJECT_DIR/.venv"
    fi
    "$PROJECT_DIR/.venv/bin/python" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else "MirrOS requiere Python 3.10+.")'
    "$PROJECT_DIR/.venv/bin/python" -m pip install -e "$PROJECT_DIR"
    "$PROJECT_DIR/.venv/bin/python" -m pip check
fi

# 4. Enlace simbólico en ~/.local/bin y acceso en el menú de aplicaciones
mkdir -p "$LOCAL_BIN"
ln -sf "$BIN_PATH" "$LOCAL_BIN/mirros"
ln -sf "$BIN_PATH" "$LOCAL_BIN/ios-scrcpy"
if [ -f "$DESKTOP_BIN_PATH" ]; then
    chmod +x "$DESKTOP_BIN_PATH"
    ln -sf "$DESKTOP_BIN_PATH" "$LOCAL_BIN/mirros-desktop"
fi
echo "[+] Enlace global creado: $LOCAL_BIN/mirros"

mkdir -p "$APPLICATIONS_DIR"
LAUNCHER_EXEC="$BIN_PATH"
if [ -f "$DESKTOP_BIN_PATH" ]; then
    LAUNCHER_EXEC="$DESKTOP_BIN_PATH"
fi
cat > "$APPLICATIONS_DIR/mirros.desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=MirrOS
GenericName=Pantalla y control de iPhone
Comment=Pantalla, audio y control de iPhone por USB
Exec=$LAUNCHER_EXEC
Icon=$PROJECT_DIR/desktop/icon.png
Terminal=false
Categories=Utility;
StartupWMClass=mirros
Keywords=iPhone;iOS;USB;Screen;Mirror;scrcpy;
EOF
chmod 644 "$APPLICATIONS_DIR/mirros.desktop"
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database "$APPLICATIONS_DIR" 2>/dev/null || true
fi
echo "[+] Acceso directo en el menú creado: $APPLICATIONS_DIR/mirros.desktop"

echo -e "\n=========================================================="
echo "   ¡Listo! Puedes abrir 'MirrOS' desde el menú de apps    "
echo "   o ejecutar 'mirros' / 'mirros-desktop' en terminal.    "
echo "=========================================================="

case ":$PATH:" in
    *":$LOCAL_BIN:"*) ;;
    *) echo "Añade $LOCAL_BIN al PATH de tu shell para usar mirros." ;;
esac
