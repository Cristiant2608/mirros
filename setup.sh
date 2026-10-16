#!/usr/bin/env bash
# Asistente de configuración para MirrOS en Linux
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_PATH="$PROJECT_DIR/bin/mirros"
LOCAL_BIN="$HOME/.local/bin"

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
if [ ! -x "$PROJECT_DIR/.venv/bin/python" ]; then
    echo "[*] Creando .venv e instalando dependencias..."
    python3 -m venv "$PROJECT_DIR/.venv"
else
    echo "[+] Entorno virtual existente en $PROJECT_DIR/.venv"
fi
"$PROJECT_DIR/.venv/bin/python" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else "MirrOS requiere Python 3.10+.")'
"$PROJECT_DIR/.venv/bin/python" -m pip install -e "$PROJECT_DIR"
"$PROJECT_DIR/.venv/bin/python" -m pip check

# 4. Enlace simbólico en ~/.local/bin
mkdir -p "$LOCAL_BIN"
ln -sf "$BIN_PATH" "$LOCAL_BIN/mirros"
ln -sf "$BIN_PATH" "$LOCAL_BIN/ios-scrcpy"
echo "[+] Enlace global creado: $LOCAL_BIN/mirros"

echo -e "\n=========================================================="
echo "   ¡Listo! Puedes ejecutar 'mirros' desde tu terminal.    "
echo "=========================================================="

case ":$PATH:" in
    *":$LOCAL_BIN:"*) ;;
    *) echo "Añade $LOCAL_BIN al PATH de tu shell para usar mirros." ;;
esac
