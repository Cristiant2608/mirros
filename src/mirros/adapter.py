"""Adaptación del visor del backend fijado, sin modificar sus archivos instalados."""

from importlib.resources import files
import asyncio
import logging
import json
import sys
import contextlib
import time
from importlib.metadata import version


def check_backend_contract(module):
    """Fail before patching anything when the pinned upstream contract changes."""
    if version('pymobiledevice3') != '11.32.0':
        raise RuntimeError('MirrOS requiere pymobiledevice3 11.32.0. Repite la instalación.')
    required = ('_hid_worker', '_serve_connection', '_handle_key', '_handle_touch',
                '_stop_hid', '_ensure_hid', '_missing_audio_deps', 'serve', '_keep_awake_loop')
    missing = [name for name in required if not callable(getattr(module.ScreenStreamServer, name, None))]
    marker = b'const decoderConfig = { codec, description, optimizeForLatency: true };'
    if missing or not callable(getattr(module, 'read_pasteboard', None)) or module.VIEWER_JS_TEMPLATE.count(marker) != 1:
        raise RuntimeError('El contrato del backend cambió; revisa el adaptador de MirrOS.')


async def read_device_clipboard(rsd):
    # Manual pulls may resolve an image inside a rich representation (e.g. Notes).
    # The upstream monitor retains its fast primary-type policy; no background reads.
    from pymobiledevice3.remote.core_device.pasteboard_service import read_pasteboard
    return await read_pasteboard(rsd, allow_full_pull=True)


async def clipboard_revision(server):
    from pymobiledevice3.remote.core_device.pasteboard_service import PasteboardService, POLICY_ALL_PROMISED
    async with PasteboardService(server._rsd) as service:
        snapshot = await service.get(data_policy=POLICY_ALL_PROMISED)
    metadata = (snapshot.get('pasteboard') or {}).get('metadata') or {}
    if 'nonce' not in metadata or 'changeCount' not in metadata:
        raise RuntimeError('iOS no informó el estado del portapapeles.')
    return f"{metadata['nonce']}:{metadata['changeCount']}"


async def release_input(server, release_touch=True):
    """Release held input, and drop the host keyboard connection without creating one."""
    async with server._hid_lock:
        uhs = server._uhs
        keyboard = server._kb_service_id
        if uhs is not None and keyboard is not None:
            with contextlib.suppress(Exception):
                await asyncio.wait_for(uhs.send_keyboard(keyboard, []), 1)
        point = getattr(server, '_mirros_contact', None) if release_touch else None
        if uhs is not None and point is not None:
            from pymobiledevice3.remote.core_device.hid_service import TOUCHSCREEN_STATE_RELEASE
            with contextlib.suppress(Exception):
                await asyncio.wait_for(uhs.send_touchscreen(TOUCHSCREEN_STATE_RELEASE, *point), 1)
        if release_touch:
            server._mirros_contact = None
            server._mirros_contact_at = None
        if uhs is not None and keyboard is not None:
            try:
                with contextlib.suppress(Exception):
                    await asyncio.wait_for(uhs.close(), 1)
            finally:
                server._uhs = None
                server._kb_service_id = None
        server._kb_service_id = None


async def touch_request(server, body, original):
    """Preserve a real tap dwell even when opening HID delayed the queued down."""
    try:
        data = json.loads(body)
    except (ValueError, TypeError):
        return await original(server, body)
    if not isinstance(data, dict):
        return await original(server, body)
    sent_at = getattr(server, '_mirros_contact_at', None)
    if data.get('type') == 'release' and sent_at is not None:
        # Windows asyncio clocks may wake timers early; check elapsed real time.
        while True:
            remaining = .04 - (time.perf_counter() - sent_at)
            if remaining <= 0:
                break
            await asyncio.sleep(max(.016, remaining))
    result = await original(server, body)
    if result[0] == 200:
        if data.get('type') == 'contact':
            if getattr(server, '_mirros_contact', None) is None:
                server._mirros_contact_at = time.perf_counter()
            server._mirros_contact = (data.get('x', 0), data.get('y', 0))
        else:
            server._mirros_contact = None
            server._mirros_contact_at = None
    return result


async def keyboard_request(server, body, original):
    try:
        data = json.loads(body)
        usages = [int(u) for u in data.get('usages', [])]
    except (TypeError, ValueError, AttributeError):
        return await original(server, body)
    previous = getattr(server, '_mirros_keyboard_lease', None)
    if previous is not None:
        previous.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await previous
        server._mirros_keyboard_lease = None
    if data.get('detach'):
        await release_input(server)
        return 200, b'ok'
    if not usages and server._kb_service_id is None:
        return 200, b'ok'
    result = await original(server, body)
    # A lost USB connection/window cannot leave a held key indefinitely.
    async def expire():
        await asyncio.sleep(5)
        await release_input(server, release_touch=False)
    server._mirros_keyboard_lease = asyncio.create_task(expire())
    return result


class PrefixedReader:
    """Return a peeked request line before delegating to the original stream."""
    def __init__(self, line, reader):
        self.line, self.reader = line, reader

    async def readline(self):
        if self.line is not None:
            line, self.line = self.line, None
            return line
        return await self.reader.readline()

    def __getattr__(self, name):
        return getattr(self.reader, name)


async def read_orientation(server):
    from pymobiledevice3.services.springboard import SpringBoardServicesService
    async with SpringBoardServicesService(server._rsd) as service:
        value = await service.get_interface_orientation()
    return {1: 'portrait', 2: 'portraitUpsideDown', 3: 'landscapeLeft', 4: 'landscapeRight'}[int(value)]


def session_health(server):
    """Cached codec data does not prove that the USB tunnel is still usable."""
    try:
        connection = server._rsd.service
        if connection.reader.at_eof() or connection.writer.is_closing():
            return {'healthy': False, 'reason': 'transport_closed'}
    except Exception:
        return {'healthy': False, 'reason': 'transport_closed'}
    last_frame = server._last_good_au_t or getattr(server, '_mirros_started', 0)
    age = asyncio.get_running_loop().time() - last_frame
    return {'healthy': age < 20, 'reason': 'ok' if age < 20 else 'video_stalled'}


def get_display_mode(server):
    mode = getattr(server, '_mirros_display_mode', 'dual')
    keep_awake = getattr(server, '_mirros_keep_awake', True)
    return {'mode': mode, 'keepAwake': keep_awake}


async def set_display_mode(server, mode: str):
    if mode not in ('dual', 'aod'):
        return {'status': 'error', 'message': 'Modo de pantalla no válido.'}
    if mode == 'aod':
        if getattr(server, '_mirros_display_mode', 'dual') != 'aod':
            try:
                from pymobiledevice3.remote.core_device.screen_stream import _NAMED_BUTTONS
                from pymobiledevice3.remote.core_device.hid_service import HID_BUTTON_STATE_DOWN, HID_BUTTON_STATE_UP
                usage_page, usage_code, hold_seconds = _NAMED_BUTTONS['lock']
                # _ensure_hid acquires _hid_lock itself (asyncio locks are not reentrant).
                await server._ensure_hid()
                async with server._hid_lock:
                    indigo = getattr(server, '_indigo', None)
                    if indigo is None:
                        raise RuntimeError('HID no disponible')
                    try:
                        await indigo.send_button(usage_page, usage_code, HID_BUTTON_STATE_DOWN)
                        await asyncio.sleep(hold_seconds)
                    finally:
                        await indigo.send_button(usage_page, usage_code, HID_BUTTON_STATE_UP)
            except Exception as error:
                logging.getLogger(__name__).warning('No se pudo enviar bloqueo para modo AOD: %s', error)
                return {'status': 'error', 'message': 'No se pudo solicitar reposo al iPhone.'}
        server._mirros_display_mode = 'aod'
        server._mirros_keep_awake = False
        return {'mode': 'aod', 'keepAwake': False}
    else:
        server._mirros_display_mode = 'dual'
        server._mirros_keep_awake = True
        event = getattr(server, '_mirros_keep_awake_event', None)
        if event is not None:
            event.set()
        return {'mode': 'dual', 'keepAwake': True}


async def wake_device(server):
    """Send a wake gesture. Authentication remains controlled by iOS."""
    try:
        await server._ensure_hid()
        async with server._hid_lock:
            uhs = getattr(server, '_uhs', None)
            if uhs is not None:
                from pymobiledevice3.remote.core_device.hid_service import (
                    TOUCHSCREEN_STATE_CONTACT,
                    TOUCHSCREEN_STATE_RELEASE,
                )
                start_x, start_y = 32768, 62000
                end_y = 15000
                steps = 8
                cur_y = start_y
                try:
                    await uhs.send_touchscreen(TOUCHSCREEN_STATE_CONTACT, start_x, start_y)
                    await asyncio.sleep(0.04)
                    for i in range(1, steps + 1):
                        cur_y = int(start_y + (end_y - start_y) * (i / steps))
                        await uhs.send_touchscreen(TOUCHSCREEN_STATE_CONTACT, start_x, cur_y)
                        await asyncio.sleep(0.015)
                finally:
                    await uhs.send_touchscreen(TOUCHSCREEN_STATE_RELEASE, start_x, cur_y)
            else:
                raise RuntimeError('HID no disponible')
    except Exception as error:
        logging.getLogger(__name__).warning('No se pudo despertar el dispositivo: %s', error)
        return {'status': 'error', 'message': 'No se pudo enviar el gesto al iPhone.'}
    return {'status': 'ok'}


async def orientation_connection(server, reader, writer, original):
    # Upstream consumes all subsequent HID requests on a persistent socket itself.
    # Dispatch them here so the next request can still reach MirrOS-only routes.
    while True:
        line = await reader.readline()
        request = line.split()[:2]
        hid = len(request) == 2 and request[0] == b'POST' and request[1] in (b'/key', b'/touch', b'/button')
        allowed_routes = (
            [b'GET', b'/control'],
            [b'GET', b'/orientation'],
            [b'POST', b'/session/end'],
            [b'GET', b'/frames.bin'],
            [b'GET', b'/health'],
            [b'GET', b'/clipboard/state'],
            [b'GET', b'/display-mode'],
            [b'POST', b'/display-mode'],
            [b'POST', b'/wake'],
        )
        if not hid and request not in allowed_routes:
            return await original(server, PrefixedReader(line, reader), writer)
        headers = {}
        while True:
            header = await reader.readline()
            if header in (b'\r\n', b''):
                break
            name, _, value = header.decode('latin-1').partition(':')
            headers[name.strip().lower()] = value.strip()
        if not hid:
            break
        refusal = server._refuse_request(headers)
        if refusal is not None:
            writer.write(refusal)
            await writer.drain()
            writer.close()
            return
        body = await server._read_body(reader, headers)
        server._hid_queue.put_nowait((request[1].decode(), body))
        keep_alive = headers.get('connection', '').lower() != 'close'
        connection = b'keep-alive' if keep_alive else b'close'
        writer.write(b'HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: ' + connection + b'\r\n\r\nok')
        await writer.drain()
        if not keep_alive:
            writer.close()
            return
    refusal = server._refuse_request(headers)
    if refusal is not None:
        writer.write(refusal)
    elif request == [b'GET', b'/control']:
        from mirros.control import serve_control
        return await serve_control(server, reader, writer, headers, release_input)
    elif request == [b'GET', b'/frames.bin']:
        from mirros.video import software_stream
        return await software_stream(server, writer)
    elif request == [b'POST', b'/session/end']:
        writer.write(b'HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok')
        task = getattr(server, '_mirros_serve_task', None)
        if task is not None:
            asyncio.get_running_loop().call_later(.1, task.cancel)
    elif request == [b'GET', b'/health']:
        health = session_health(server)
        body = json.dumps(health).encode()
        status = b'200 OK' if health['healthy'] else b'503 Service Unavailable'
        writer.write(b'HTTP/1.1 ' + status + b'\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: ' + str(len(body)).encode() + b'\r\nConnection: close\r\n\r\n' + body)
    elif request == [b'GET', b'/clipboard/state']:
        try:
            body = json.dumps({'revision': await asyncio.wait_for(clipboard_revision(server), 3)}).encode()
            status = b'200 OK'
        except Exception as error:
            logging.getLogger(__name__).warning('Clipboard state unavailable: %s: %s', type(error).__name__, error)
            body, status = b'{"error":"clipboard_unavailable"}', b'503 Service Unavailable'
        writer.write(b'HTTP/1.1 ' + status + b'\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: ' + str(len(body)).encode() + b'\r\nConnection: close\r\n\r\n' + body)
    elif request == [b'GET', b'/display-mode']:
        result = get_display_mode(server)
        body = json.dumps(result).encode()
        writer.write(b'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: ' + str(len(body)).encode() + b'\r\nConnection: close\r\n\r\n' + body)
    elif request == [b'POST', b'/display-mode']:
        raw_body = await server._read_body(reader, headers)
        try:
            data = json.loads(raw_body.decode('utf-8'))
            mode = data.get('mode')
        except Exception:
            mode = None
        result = await set_display_mode(server, mode)
        body = json.dumps(result).encode()
        status = b'400 Bad Request' if mode not in ('dual', 'aod') else b'503 Service Unavailable' if result.get('status') == 'error' else b'200 OK'
        writer.write(b'HTTP/1.1 ' + status + b'\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: ' + str(len(body)).encode() + b'\r\nConnection: close\r\n\r\n' + body)
    elif request == [b'POST', b'/wake']:
        result = await wake_device(server)
        body = json.dumps(result).encode()
        status = b'503 Service Unavailable' if result.get('status') == 'error' else b'200 OK'
        writer.write(b'HTTP/1.1 ' + status + b'\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: ' + str(len(body)).encode() + b'\r\nConnection: close\r\n\r\n' + body)
    else:
        try:
            orientation = await asyncio.wait_for(read_orientation(server), 3)
            body = json.dumps({'orientation': orientation}).encode()
            status = b'200 OK'
        except Exception:
            body, status = b'{"orientation":null}', b'503 Service Unavailable'
        writer.write(b'HTTP/1.1 ' + status + b'\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: ' + str(len(body)).encode() + b'\r\nConnection: close\r\n\r\n' + body)
    await writer.drain()
    writer.close()


async def warm_input(server, worker):
    """Open HID before the first click; preserve upstream lazy recovery on failure."""
    try:
        await asyncio.wait_for(server._ensure_hid(), timeout=3)
    except Exception:
        logging.getLogger(__name__).debug('HID warm-up deferred until first input', exc_info=True)
    await worker(server)


def configure_viewer() -> None:
    from pymobiledevice3.remote.core_device import screen_stream
    if getattr(screen_stream, '_mirros_configured', False):
        return
    check_backend_contract(screen_stream)
    screen_stream.read_pasteboard = read_device_clipboard
    if sys.platform in ('win32', 'linux'):
        from mirros.audio import AACELDDecoder
        screen_stream.AACELDDecoder = AACELDDecoder
        screen_stream.ScreenStreamServer._missing_audio_deps = staticmethod(lambda: [])

    marker = b'const decoderConfig = { codec, description, optimizeForLatency: true };'
    replacement = b'''const dimensions = iosScrcpyHevcDimensions(description);
    log('video size: ' + dimensions.codedWidth + 'x' + dimensions.codedHeight);
    const decoderConfig = { codec, description, ...dimensions, optimizeForLatency: true };'''
    source = screen_stream.VIEWER_JS_TEMPLATE
    if source.count(marker) != 1:
        raise RuntimeError('El visor del backend cambió; revisa la versión fijada de pymobiledevice3.')
    parser = files('mirros').joinpath('assets/hevc_dimensions.js').read_bytes()
    screen_stream.VIEWER_JS_TEMPLATE = parser + b'\n' + source.replace(marker, replacement)
    original_worker = screen_stream.ScreenStreamServer._hid_worker
    async def ready_worker(server):
        await warm_input(server, original_worker)
    screen_stream.ScreenStreamServer._hid_worker = ready_worker
    original_connection = screen_stream.ScreenStreamServer._serve_connection
    async def with_orientation(server, reader, writer):
        return await orientation_connection(server, reader, writer, original_connection)
    screen_stream.ScreenStreamServer._serve_connection = with_orientation
    original_key = screen_stream.ScreenStreamServer._handle_key
    async def safe_key(server, body):
        from mirros.control import control_lock
        async with control_lock(server):
            return await keyboard_request(server, body, original_key)
    screen_stream.ScreenStreamServer._handle_key = safe_key
    original_touch = screen_stream.ScreenStreamServer._handle_touch
    async def tracked_touch(server, body):
        from mirros.control import control_lock
        async with control_lock(server):
            return await touch_request(server, body, original_touch)
    screen_stream.ScreenStreamServer._handle_touch = tracked_touch
    original_stop = screen_stream.ScreenStreamServer._stop_hid
    async def safe_stop(server):
        lease = getattr(server, '_mirros_keyboard_lease', None)
        if lease is not None and lease is not asyncio.current_task():
            lease.cancel()
        await release_input(server)
        await original_stop(server)
    screen_stream.ScreenStreamServer._stop_hid = safe_stop
    async def controlled_keep_awake(server):
        assertion_timeout = 300
        refresh_interval = 120
        event = getattr(server, '_mirros_keep_awake_event', None)
        if event is None:
            event = asyncio.Event()
            server._mirros_keep_awake_event = event
        try:
            while True:
                if getattr(server, '_mirros_keep_awake', True):
                    try:
                        from pymobiledevice3.services.power_assertion import PowerAssertionService
                        svc = PowerAssertionService(server._rsd)
                        async with svc.create_power_assertion(
                            "PreventUserIdleSystemSleep",
                            "pymobiledevice3.serve-web",
                            assertion_timeout,
                            "MirrOS keeping device awake for screen mirroring",
                        ):
                            pass
                    except Exception:
                        logging.getLogger(__name__).debug("keep-awake renew failed", exc_info=True)
                event.clear()
                try:
                    await asyncio.wait_for(event.wait(), timeout=refresh_interval)
                except asyncio.TimeoutError:
                    pass
                except asyncio.CancelledError:
                    return
        except asyncio.CancelledError:
            return
        except Exception:
            logging.getLogger(__name__).warning("keep-awake loop crashed", exc_info=True)
    screen_stream.ScreenStreamServer._keep_awake_loop = controlled_keep_awake
    original_serve = screen_stream.ScreenStreamServer.serve
    async def cancellable_serve(server):
        server._mirros_started = asyncio.get_running_loop().time()
        server._mirros_serve_task = asyncio.current_task()
        return await original_serve(server)
    screen_stream.ScreenStreamServer.serve = cancellable_serve
    screen_stream._mirros_configured = True
