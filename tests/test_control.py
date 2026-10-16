import asyncio
import json
import struct
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from wsproto import WSConnection, ConnectionType
from wsproto.events import Request, AcceptConnection, BytesMessage, CloseConnection
from mirros.control import decode_request, serve_control, PROTOCOL
from mirros.adapter import orientation_connection


class ControlProtocolTests(unittest.TestCase):
    def test_touch_and_keyboard_cross_language_layout(self):
        self.assertEqual(decode_request(bytes.fromhex('0101000000071234ffff')),
                         (7, '/touch', {'type': 'contact', 'x': 4660, 'y': 65535}))
        self.assertEqual(decode_request(bytes.fromhex('010300000008000200e30019')),
                         (8, '/key', {'usages': [227, 25], 'detach': False}))

    def test_rejects_bad_version_length_flags_and_usage(self):
        for packet in ('', '0201000000071234ffff', '0101000000071234',
                       '01030000000800020100', '01030000000800010100',
                       '01030000000801010019'):
            with self.subTest(packet=packet), self.assertRaises(ValueError):
                decode_request(bytes.fromhex(packet))


class ControlSocketTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.released = asyncio.Event()
        self.calls = []
        async def handle(body):
            self.calls.append(json.loads(body))
            await asyncio.sleep(.001)
            return 200, b'ok'
        self.server = SimpleNamespace(_handle_touch=handle, _handle_key=handle,
                                      _refuse_request=lambda headers: None)
        async def release(_server):
            self.released.set()
        async def connection(reader, writer):
            from unittest.mock import patch
            with patch('mirros.adapter.release_input', release):
                await orientation_connection(self.server, reader, writer, AsyncMock())
        self.listener = await asyncio.start_server(connection, '127.0.0.1', 0)
        self.reader, self.writer = await asyncio.open_connection('127.0.0.1', self.listener.sockets[0].getsockname()[1])
        self.ws = WSConnection(ConnectionType.CLIENT)
        self.writer.write(self.ws.send(Request(host='localhost', target='/control', subprotocols=[PROTOCOL])))
        await self.writer.drain()
        self.ws.receive_data(await asyncio.wait_for(self.reader.read(4096), 1))
        self.assertIsInstance(next(self.ws.events()), AcceptConnection)

    async def asyncTearDown(self):
        self.writer.close()
        await self.writer.wait_closed()
        await asyncio.wait_for(self.released.wait(), 1)
        self.listener.close()
        await self.listener.wait_closed()

    async def receive(self):
        self.ws.receive_data(await asyncio.wait_for(self.reader.read(4096), 1))
        return list(self.ws.events())

    async def test_fragmented_commands_ack_after_ordered_dispatch(self):
        payload = bytes.fromhex('0101000000071234ffff')
        self.writer.write(self.ws.send(BytesMessage(data=payload[:4], message_finished=False)))
        self.writer.write(self.ws.send(BytesMessage(data=payload[4:], message_finished=True)))
        self.writer.write(self.ws.send(BytesMessage(data=bytes.fromhex('0102000000081234ffff'))))
        await self.writer.drain()
        replies = []
        while len(replies) < 2:
            replies.extend(e.data for e in await self.receive() if isinstance(e, BytesMessage))
        self.assertEqual([struct.unpack('>BIHI', data)[:3] for data in replies], [(1, 7, 200), (1, 8, 200)])
        self.assertEqual([d['type'] for d in self.calls], ['contact', 'release'])

    async def test_oversized_fragmented_message_closes_and_releases(self):
        self.writer.write(self.ws.send(BytesMessage(data=b'x' * 400, message_finished=False)))
        self.writer.write(self.ws.send(BytesMessage(data=b'x' * 400, message_finished=True)))
        await self.writer.drain()
        self.assertEqual(await asyncio.wait_for(self.reader.read(4096), 1), b'')
        await asyncio.wait_for(self.released.wait(), 1)
        self.assertEqual(self.calls, [])

    async def test_closed_client_releases_held_input(self):
        self.writer.write(self.ws.send(CloseConnection(code=1000)))
        await self.writer.drain()
        await self.receive()
        await asyncio.wait_for(self.released.wait(), 1)
