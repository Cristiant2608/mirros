"""Software HEVC fallback for desktops without a WebCodecs HEVC decoder."""
import asyncio
import contextlib
import struct
import time
from fractions import Fraction
import av


class SoftwareDecoder:
    def __init__(self, description):
        self.decoder = av.CodecContext.create('hevc', 'r')
        self.decoder.extradata = description
        self.decoder.thread_count = 2
        self.decoder.open()
        self.encoder = None
        self.last_sent = 0

    def decode(self, packet):
        frames = self.decoder.decode(av.Packet(packet))
        if not frames or time.monotonic() - self.last_sent < 1 / 30:
            return None
        frame = frames[-1]
        scale = min(1, 1568 / max(frame.width, frame.height))
        width = max(2, int(frame.width * scale) // 2 * 2)
        height = max(2, int(frame.height * scale) // 2 * 2)
        if self.encoder is None or (self.encoder.width, self.encoder.height) != (width, height):
            self.encoder = av.CodecContext.create('mjpeg', 'w')
            self.encoder.width, self.encoder.height = width, height
            self.encoder.pix_fmt = 'yuvj420p'
            self.encoder.time_base = Fraction(1, 30)
            self.encoder.open()
        image = frame.reformat(width=width, height=height, format='yuvj420p')
        image.pts = None
        result = b''.join(bytes(value) for value in self.encoder.encode(image))
        self.last_sent = time.monotonic()
        return result or None


async def software_stream(server, writer):
    from pymobiledevice3.remote.core_device.screen_stream import _SubState, hevc_decoder_configuration_record
    await server._ensure_fresh_stream(force=False)
    if not server._init_sequence:
        writer.write(b'HTTP/1.1 503 Not Ready\r\nContent-Length: 0\r\n\r\n')
        await writer.drain()
        return
    queue = asyncio.Queue(maxsize=8)
    queue.put_nowait(server._init_sequence)
    state = _SubState()
    state.mark_needs_key(asyncio.get_running_loop().time())
    state.reset_on_key = True
    server._subscribers[queue] = state
    server._request_recovery_idr(reason='software-viewer')
    async def bootstrap():
        for attempt in range(3):
            await asyncio.sleep(1)
            if not state.needs_key or queue not in server._subscribers:
                return
            if attempt < 2:
                server._request_recovery_idr(reason='software-bootstrap')
            else:
                with contextlib.suppress(Exception):
                    await asyncio.wait_for(server._ensure_fresh_stream(force=True), 10)
    retry = asyncio.create_task(bootstrap())
    server._pli_tasks.add(retry)
    retry.add_done_callback(server._pli_tasks.discard)
    writer.write(b'HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nTransfer-Encoding: chunked\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n')
    await writer.drain()
    decoder = None
    try:
        while True:
            message = await asyncio.wait_for(queue.get(), 15)
            offset = 0
            while offset + 4 <= len(message):
                length = struct.unpack_from('>I', message, offset)[0]
                end = offset + 4 + length
                if length < 1 or end > len(message):
                    raise ValueError('Invalid video packet')
                kind, payload = message[offset + 4], message[offset + 5:end]
                offset = end
                if decoder is None or kind == 2:
                    description = hevc_decoder_configuration_record(server._vps_nal, server._sps_nal, server._pps_nal)
                    decoder = SoftwareDecoder(description)
                jpeg = await asyncio.to_thread(decoder.decode, payload)
                if jpeg:
                    packet = struct.pack('>I', len(jpeg)) + jpeg
                    writer.write(f'{len(packet):x}\r\n'.encode() + packet + b'\r\n')
                    await writer.drain()
    except (ConnectionError, asyncio.CancelledError, asyncio.TimeoutError):
        pass
    finally:
        retry.cancel()
        server._subscribers.pop(queue, None)
        with contextlib.suppress(Exception):
            writer.close()
