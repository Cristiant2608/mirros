"""Adaptación del visor del backend fijado, sin modificar sus archivos instalados."""

from importlib.resources import files
import asyncio
import logging
import json
import sys
import contextlib
from importlib.metadata import version


def check_backend_contract(module):
    """Fail before patching anything when the pinned upstream contract changes."""
    if version('pymobiledevice3') != '11.32.0':
        raise RuntimeError('MirrOS requiere pymobiledevice3 11.32.0. Repite la instalación.')
    required = ('_hid_worker', '_serve_connection', '_handle_key', '_handle_touch',
                '_stop_hid', '_ensure_hid', '_missing_audio_deps', 'serve')
    missing = [name for name in required if not callable(getattr(module.ScreenStreamServer, name, None))]
    marker = b'const decoderConfig = { codec, description, optimizeForLatency: true };'
    if missing or module.VIEWER_JS_TEMPLATE.count(marker) != 1:
        raise RuntimeError('El contrato del backend cambió; revisa el adaptador de MirrOS.')


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
        if uhs is not None and keyboard is not None:
            try:
                with contextlib.suppress(Exception):
                    await asyncio.wait_for(uhs.close(), 1)
            finally:
                server._uhs = None
                server._kb_service_id = None
        server._kb_service_id = None


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


async def orientation_connection(server, reader, writer, original):
    line = await reader.readline()
    request = line.split()[:2]
    if request not in ([b'GET', b'/orientation'], [b'POST', b'/session/end'], [b'GET', b'/frames.bin'], [b'GET', b'/health']):
        return await original(server, PrefixedReader(line, reader), writer)
    headers = {}
    while True:
        header = await reader.readline()
        if header in (b'\r\n', b''):
            break
        name, _, value = header.decode('latin-1').partition(':')
        headers[name.strip().lower()] = value.strip()
    refusal = server._refuse_request(headers)
    if refusal is not None:
        writer.write(refusal)
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
        return await keyboard_request(server, body, original_key)
    screen_stream.ScreenStreamServer._handle_key = safe_key
    original_touch = screen_stream.ScreenStreamServer._handle_touch
    async def tracked_touch(server, body):
        result = await original_touch(server, body)
        if result[0] == 200:
            data = json.loads(body)
            server._mirros_contact = (data.get('x', 0), data.get('y', 0)) if data.get('type') == 'contact' else None
        return result
    screen_stream.ScreenStreamServer._handle_touch = tracked_touch
    original_stop = screen_stream.ScreenStreamServer._stop_hid
    async def safe_stop(server):
        lease = getattr(server, '_mirros_keyboard_lease', None)
        if lease is not None and lease is not asyncio.current_task():
            lease.cancel()
        await release_input(server)
        await original_stop(server)
    screen_stream.ScreenStreamServer._stop_hid = safe_stop
    original_serve = screen_stream.ScreenStreamServer.serve
    async def cancellable_serve(server):
        server._mirros_started = asyncio.get_running_loop().time()
        server._mirros_serve_task = asyncio.current_task()
        return await original_serve(server)
    screen_stream.ScreenStreamServer.serve = cancellable_serve
    screen_stream._mirros_configured = True
