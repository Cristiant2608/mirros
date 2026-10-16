#!/usr/bin/env bash
# Asistente de configuración para iOS-Scrcpy en Linux (Arch/CachyOS)
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_PATH="$PROJECT_DIR/bin/ios-scrcpy"
LOCAL_BIN="$HOME/.local/bin"

echo "=========================================================="
echo "          Configurador de iOS-Scrcpy para Linux           "
echo "=========================================================="

# 1. Comprobar usbmuxd
echo -e "\n[*] Comprobando servicio usbmuxd..."
if ! command -v usbmuxd &> /dev/null; then
    echo "[!] usbmuxd no está instalado."
    echo "    Por favor ejecuta en tu terminal:"
    echo "    👉 sudo pacman -S --needed usbmuxd"
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
if [ ! -d "$PROJECT_DIR/.venv" ]; then
    echo "[*] Creando .venv e instalando dependencias..."
    python3 -m venv "$PROJECT_DIR/.venv"
else
    echo "[+] Entorno virtual existente en $PROJECT_DIR/.venv"
fi
"$PROJECT_DIR/.venv/bin/python" -m pip install -e "$PROJECT_DIR"

# 4. Enlace simbólico en ~/.local/bin
mkdir -p "$LOCAL_BIN"
ln -sf "$BIN_PATH" "$LOCAL_BIN/ios-scrcpy"
echo "[+] Enlace global creado: $LOCAL_BIN/ios-scrcpy"

echo -e "\n=========================================================="
echo "  ¡Listo! Puedes ejecutar 'ios-scrcpy' desde tu terminal. "
echo "=========================================================="
