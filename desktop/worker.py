"""Entrada empaquetable del transporte USB. No necesita Python instalado al distribuirse."""
import asyncio
import json
import multiprocessing
import os
import runpy
import sys


async def status():
    from pymobiledevice3.usbmux import list_devices
    from pymobiledevice3.lockdown import create_using_usbmux
    devices = await asyncio.wait_for(list_devices(), 4)
    result = []
    for device in devices:
        if device.connection_type != 'USB':
            continue
        info = {'udid': device.serial, 'name': 'iPhone', 'version': ''}
        try:
            async with await asyncio.wait_for(create_using_usbmux(serial=device.serial), 5) as lockdown:
                info.update(name=lockdown.all_values.get('DeviceName', 'iPhone'), version=lockdown.product_version)
        except Exception:
            pass
        result.append(info)
    print(json.dumps({'devices': result}, ensure_ascii=False), flush=True)


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if command == 'status':
        try:
            asyncio.run(status())
        except Exception as error:
            print(json.dumps({'devices': [], 'usb_error': type(error).__name__}), flush=True)
        return
    if command not in ('prepare', 'serve'):
        raise SystemExit(2)
    args = sys.argv[2:]
    if command == 'prepare':
        sys.argv = ['pymobiledevice3', 'mounter', 'auto-mount', *args]
    else:
        from ios_scrcpy.backend import configure_viewer
        configure_viewer()
        sys.argv = ['pymobiledevice3', 'developer', 'core-device', 'display', 'serve-web', *args]
    runpy.run_module('pymobiledevice3', run_name='__main__')


if __name__ == '__main__':
    multiprocessing.freeze_support()
    os.environ['PYTHONUTF8'] = '1'
    main()
