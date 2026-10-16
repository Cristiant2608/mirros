"""Adaptación del visor del backend fijado, sin modificar sus archivos instalados."""

from importlib.resources import files
import asyncio
import logging
import json
import runpy
import sys


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


async def orientation_connection(server, reader, writer, original):
    line = await reader.readline()
    if line.split()[:2] != [b'GET', b'/orientation']:
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
    if getattr(screen_stream, '_ios_scrcpy_configured', False):
        return
    if sys.platform in ('win32', 'linux'):
        from ios_scrcpy.audio import AACELDDecoder
        screen_stream.AACELDDecoder = AACELDDecoder
        screen_stream.ScreenStreamServer._missing_audio_deps = staticmethod(lambda: [])

    marker = b'const decoderConfig = { codec, description, optimizeForLatency: true };'
    replacement = b'''const dimensions = iosScrcpyHevcDimensions(description);
    log('video size: ' + dimensions.codedWidth + 'x' + dimensions.codedHeight);
    const decoderConfig = { codec, description, ...dimensions, optimizeForLatency: true };'''
    source = screen_stream.VIEWER_JS_TEMPLATE
    if source.count(marker) != 1:
        raise RuntimeError('El visor del backend cambió; revisa la versión fijada de pymobiledevice3.')
    parser = files('ios_scrcpy').joinpath('assets/hevc_dimensions.js').read_bytes()
    screen_stream.VIEWER_JS_TEMPLATE = parser + b'\n' + source.replace(marker, replacement)
    original_worker = screen_stream.ScreenStreamServer._hid_worker
    async def ready_worker(server):
        await warm_input(server, original_worker)
    screen_stream.ScreenStreamServer._hid_worker = ready_worker
    original_connection = screen_stream.ScreenStreamServer._serve_connection
    async def with_orientation(server, reader, writer):
        return await orientation_connection(server, reader, writer, original_connection)
    screen_stream.ScreenStreamServer._serve_connection = with_orientation
    screen_stream._ios_scrcpy_configured = True


def main() -> None:
    configure_viewer()
    runpy.run_module('pymobiledevice3', run_name='__main__')


if __name__ == '__main__':
    main()
