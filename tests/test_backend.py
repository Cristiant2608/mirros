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
