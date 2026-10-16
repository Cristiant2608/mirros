"""Bounded binary control over RFC 6455; no input is replayed after a lost ACK."""
import asyncio
import contextlib
import json
import struct
import time
from wsproto import ConnectionType, WSConnection
from wsproto.events import AcceptConnection, BytesMessage, CloseConnection, Ping, Pong, Request
from wsproto.utilities import ProtocolError

PROTOCOL = 'mirros-control-v1'
MAX_MESSAGE = 520


def control_lock(server):
    if not hasattr(server, '_mirros_control_lock'):
        server._mirros_control_lock = asyncio.Lock()
    return server._mirros_control_lock


def decode_request(data):
    if len(data) < 6 or data[0] != 1:
        raise ValueError('Invalid control version/header')
    kind, sequence = data[1], struct.unpack_from('>I', data, 2)[0]
    if kind in (1, 2) and len(data) == 10:
        x, y = struct.unpack_from('>HH', data, 6)
        return sequence, '/touch', {'type': 'contact' if kind == 1 else 'release', 'x': x, 'y': y}
    if kind == 3 and len(data) >= 8:
        detach, count = data[6:8]
        if detach > 1 or len(data) != 8 + count * 2:
            raise ValueError('Invalid keyboard length/flags')
        usages = list(struct.unpack_from(f'>{count}H', data, 8))
        if any(usage > 255 for usage in usages) or (detach and usages):
            raise ValueError('Invalid keyboard usages')
        return sequence, '/key', {'usages': usages, 'detach': bool(detach)}
    raise ValueError('Invalid control command')


async def serve_control(server, reader, writer, headers, release):
    """One owner, sequential dispatch/ACKs, bounded reads and per-command timeout."""
    ws = WSConnection(ConnectionType.SERVER)
    owner = object()
    acquired = False
    try:
        ws.initiate_upgrade_connection([(k.encode('ascii'), v.encode('latin-1')) for k, v in headers.items()], '/control')
        request = next(ws.events())
        if not isinstance(request, Request) or PROTOCOL not in request.subprotocols:
            raise ValueError('Missing control subprotocol')
        # No await between testing and claiming the owner.
        if getattr(server, '_mirros_control_owner', None) is not None:
            writer.write(b'HTTP/1.1 409 Conflict\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
            await writer.drain()
            return
        server._mirros_control_owner = owner
        acquired = True
        writer.write(ws.send(AcceptConnection(subprotocol=PROTOCOL)))
        await writer.drain()
        message = bytearray()
        missed = 0
        while True:
            try:
                chunk = await asyncio.wait_for(reader.read(1024), 15)
            except asyncio.TimeoutError:
                missed += 1
                if missed > 2:
                    break
                writer.write(ws.send(Ping(payload=b'mirros')))
                await writer.drain()
                continue
            if not chunk:
                break
            ws.receive_data(chunk)
            for event in ws.events():
                if isinstance(event, CloseConnection):
                    with contextlib.suppress(ProtocolError):
                        writer.write(ws.send(event.response()))
                        await writer.drain()
                    return
                if isinstance(event, Ping):
                    writer.write(ws.send(event.response()))
                    await writer.drain()
                elif isinstance(event, Pong):
                    missed = 0
                elif isinstance(event, BytesMessage):
                    message.extend(event.data)
                    if len(message) > MAX_MESSAGE:
                        raise ValueError('Control message too large')
                    if not event.message_finished:
                        continue
                    sequence, path, data = decode_request(message)
                    message.clear()
                    started = time.perf_counter()
                    handler = server._handle_touch if path == '/touch' else server._handle_key
                    # Patched handlers share a lock with legacy HTTP commands.
                    code, _ = await asyncio.wait_for(handler(json.dumps(data).encode()), 2)
                    micros = min(0xffffffff, int((time.perf_counter() - started) * 1e6))
                    writer.write(ws.send(BytesMessage(data=struct.pack('>BIHI', 1, sequence, code, micros))))
                    await writer.drain()
                else:
                    raise ValueError('Binary messages required')
    except (ValueError, ProtocolError, ConnectionError, asyncio.TimeoutError):
        # Protocol errors terminate this channel, never fall through to HTTP parsing.
        pass
    finally:
        if acquired:
            async with control_lock(server):
                await release(server)
                if getattr(server, '_mirros_control_owner', None) is owner:
                    server._mirros_control_owner = None
        writer.close()
        with contextlib.suppress(ConnectionError):
            await writer.wait_closed()
