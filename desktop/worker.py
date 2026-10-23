"""Entrada empaquetable del transporte USB. No necesita Python instalado al distribuirse."""
import asyncio
import json
import multiprocessing
import os
import runpy
import sys


async def status():
    from mirros.device import inspect_connected_devices
    result = await inspect_connected_devices(reveal_developer_mode=True)
    print(json.dumps({'devices': result}, ensure_ascii=False), flush=True)


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if command == 'status':
        try:
            asyncio.run(status())
        except Exception as error:
            print(json.dumps({'devices': [], 'usb_error': type(error).__name__}), flush=True)
        return
    if command == 'diagnostics':
        from mirros.diagnostics import collect_report
        print(json.dumps(collect_report(probe_usb=True), ensure_ascii=False), flush=True)
        return
    if command not in ('prepare', 'serve'):
        raise SystemExit(2)
    args = sys.argv[2:]
    if command == 'prepare':
        sys.argv = ['pymobiledevice3', 'mounter', 'auto-mount', *args]
    else:
        from mirros.backend import configure_viewer
        configure_viewer()
        sys.argv = ['pymobiledevice3', 'developer', 'core-device', 'display', 'serve-web', *args]
    runpy.run_module('pymobiledevice3', run_name='__main__')


if __name__ == '__main__':
    multiprocessing.freeze_support()
    os.environ['PYTHONUTF8'] = '1'
    main()
