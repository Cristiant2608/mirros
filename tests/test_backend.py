import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from ios_scrcpy.backend import warm_input


class InputReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def test_services_are_open_before_processing_clicks(self):
        order = []
        async def connect():
            order.append('ready')
        async def worker(server):
            order.append('consume')
        await warm_input(SimpleNamespace(_ensure_hid=connect), worker)
        self.assertEqual(order, ['ready', 'consume'])

    async def test_transient_warmup_failure_keeps_lazy_input_recovery(self):
        server = SimpleNamespace(_ensure_hid=AsyncMock(side_effect=OSError('temporarily unavailable')))
        worker = AsyncMock()
        await warm_input(server, worker)
        worker.assert_awaited_once_with(server)


class AudioConfigurationTests(unittest.TestCase):
    def test_aac_eld_opens_with_480_sample_configuration(self):
        from ios_scrcpy.audio import AACELDDecoder
        audio = AACELDDecoder()
        self.assertEqual(audio.decoder.extradata, bytes.fromhex('f8e65000'))
        self.assertEqual(audio.decoder.sample_rate, 48000)
        self.assertEqual(audio.decoder.layout.name, 'stereo')


class SafeKeyboardTests(unittest.IsolatedAsyncioTestCase):
    async def test_empty_release_never_registers_an_external_keyboard(self):
        from ios_scrcpy.backend import keyboard_request
        original = AsyncMock()
        server = SimpleNamespace(_kb_service_id=None)
        self.assertEqual(await keyboard_request(server, b'{"usages":[]}', original), (200, b'ok'))
        original.assert_not_awaited()

    async def test_detach_releases_keys_and_closes_keyboard_transport(self):
        from ios_scrcpy.backend import keyboard_request
        import asyncio
        uhs = SimpleNamespace(send_keyboard=AsyncMock(), close=AsyncMock())
        server = SimpleNamespace(_hid_lock=asyncio.Lock(), _uhs=uhs, _kb_service_id=321)
        original = AsyncMock()
        await keyboard_request(server, b'{"usages":[],"detach":true}', original)
        uhs.send_keyboard.assert_awaited_once_with(321, [])
        uhs.close.assert_awaited_once()
        self.assertIsNone(server._kb_service_id)
        self.assertIsNone(server._uhs)
        original.assert_not_awaited()

    async def test_safe_release_without_a_keyboard_keeps_touch_transport_open(self):
        from ios_scrcpy.backend import release_input
        import asyncio
        uhs = SimpleNamespace(send_keyboard=AsyncMock(), close=AsyncMock())
        server = SimpleNamespace(_hid_lock=asyncio.Lock(), _uhs=uhs, _kb_service_id=None)
        await release_input(server)
        uhs.close.assert_not_awaited()
        self.assertIs(server._uhs, uhs)
import asyncio
import unittest
from unittest.mock import patch
from ios_scrcpy.backend import orientation_connection

class OrientationEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_other_requests_keep_their_request_line_and_body(self):
        reader=asyncio.StreamReader(); reader.feed_data(b'POST /touch HTTP/1.1\r\nContent-Length: 2\r\n\r\n{}'); reader.feed_eof()
        async def original(server, stream, writer):
            self.assertEqual(await stream.readline(),b'POST /touch HTTP/1.1\r\n')
            self.assertEqual(await stream.readline(),b'Content-Length: 2\r\n')
            self.assertEqual(await stream.readline(),b'\r\n')
            self.assertEqual(await stream.readexactly(2),b'{}')
        await orientation_connection(None,reader,None,original)

    async def test_safe_exit_cancels_serve_and_runs_its_cleanup(self):
        from types import SimpleNamespace
        from unittest.mock import Mock, AsyncMock
        cleaned = asyncio.Event()
        async def serve():
            try:
                await asyncio.Event().wait()
            finally:
                cleaned.set()
        task = asyncio.create_task(serve())
        await asyncio.sleep(0)
        server = SimpleNamespace(_mirros_serve_task=task, _refuse_request=Mock(return_value=None))
        reader = asyncio.StreamReader(); reader.feed_data(b'POST /session/end HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\n\r\n'); reader.feed_eof()
        writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
        await orientation_connection(server, reader, writer, AsyncMock())
        self.assertIn(b'200 OK', writer.write.call_args.args[0])
        await asyncio.wait_for(cleaned.wait(), 1)
        with self.assertRaises(asyncio.CancelledError):
            await task

    async def test_orientation_reports_readonly_state_and_rejects_foreign_origins(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, Mock
        for refusal in (None,b'HTTP/1.1 403 Forbidden\r\n\r\n'):
            reader=asyncio.StreamReader();reader.feed_data(b'GET /orientation HTTP/1.1\r\nHost: localhost\r\n\r\n');reader.feed_eof()
            writer=SimpleNamespace(write=Mock(),drain=AsyncMock(),close=Mock())
            server=SimpleNamespace(_refuse_request=Mock(return_value=refusal))
            with patch('ios_scrcpy.backend.read_orientation',new=AsyncMock(return_value='landscapeLeft')) as query:
                await orientation_connection(server,reader,writer,AsyncMock())
                data=writer.write.call_args.args[0]
                if refusal: query.assert_not_awaited();self.assertIn(b'403',data)
                else: query.assert_awaited_once();self.assertIn(b'"orientation": "landscapeLeft"',data)
            writer.close.assert_called_once()
