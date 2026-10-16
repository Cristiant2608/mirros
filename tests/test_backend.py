import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from mirros.adapter import warm_input


class SessionHealthTests(unittest.IsolatedAsyncioTestCase):
    def server(self, *, closed=False, age=0):
        import asyncio
        connection = SimpleNamespace(reader=SimpleNamespace(at_eof=lambda: closed),
                                     writer=SimpleNamespace(is_closing=lambda: closed))
        return SimpleNamespace(_rsd=SimpleNamespace(service=connection),
                               _last_good_au_t=asyncio.get_running_loop().time() - age)

    async def test_closed_tunnel_is_unhealthy_even_with_a_cached_recent_frame(self):
        from mirros.adapter import session_health
        self.assertEqual(session_health(self.server(closed=True)),
                         {'healthy': False, 'reason': 'transport_closed'})

    async def test_no_video_progress_eventually_requests_a_fresh_session(self):
        from mirros.adapter import session_health
        self.assertTrue(session_health(self.server(age=5))['healthy'])
        self.assertEqual(session_health(self.server(age=21)),
                         {'healthy': False, 'reason': 'video_stalled'})

    async def test_health_endpoint_rejects_a_dead_transport(self):
        import asyncio
        from unittest.mock import Mock
        from mirros.adapter import orientation_connection
        server = self.server(closed=True)
        server._refuse_request = Mock(return_value=None)
        reader = asyncio.StreamReader()
        reader.feed_data(b'GET /health HTTP/1.1\r\nHost: localhost\r\n\r\n')
        reader.feed_eof()
        writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
        await orientation_connection(server, reader, writer, AsyncMock())
        body = writer.write.call_args.args[0]
        self.assertIn(b'503 Service Unavailable', body)
        self.assertIn(b'transport_closed', body)


class ClipboardPolicyTests(unittest.IsolatedAsyncioTestCase):
    async def test_clipboard_route_after_key_on_the_same_connection(self):
        import asyncio
        from unittest.mock import Mock, patch
        from mirros.adapter import orientation_connection
        from pymobiledevice3.remote.core_device.screen_stream import ScreenStreamServer
        reader = asyncio.StreamReader()
        reader.feed_data(b'POST /key HTTP/1.1\r\nHost: localhost\r\nContent-Length: 13\r\n\r\n{"usages":[]}GET /clipboard/state HTTP/1.1\r\nHost: localhost\r\n\r\n')
        reader.feed_eof()
        server = SimpleNamespace(_refuse_request=Mock(return_value=None),
                                 _read_body=ScreenStreamServer._read_body,
                                 _hid_queue=asyncio.Queue())
        writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
        original = AsyncMock()
        with patch('mirros.adapter.clipboard_revision', new=AsyncMock(return_value='fixture:6')):
            await orientation_connection(server, reader, writer, original)
        self.assertEqual(server._hid_queue.get_nowait(), ('/key', b'{"usages":[]}'))
        self.assertIn(b'"revision": "fixture:6"', writer.write.call_args.args[0])
        original.assert_not_awaited()

    async def test_revision_queries_metadata_without_materializing_content(self):
        from mirros.adapter import clipboard_revision
        from pymobiledevice3.remote.core_device.pasteboard_service import POLICY_ALL_PROMISED
        from unittest.mock import patch
        service = SimpleNamespace(get=AsyncMock(return_value={'pasteboard':{'metadata':{'nonce':'fixture','changeCount':5}}}))
        context = AsyncMock()
        context.__aenter__.return_value = service
        with patch('pymobiledevice3.remote.core_device.pasteboard_service.PasteboardService', return_value=context):
            self.assertEqual(await clipboard_revision(SimpleNamespace(_rsd='rsd')), 'fixture:5')
        service.get.assert_awaited_once_with(data_policy=POLICY_ALL_PROMISED)

    async def test_manual_pull_resolves_secondary_images(self):
        from mirros.adapter import read_device_clipboard
        from unittest.mock import patch
        content = ({}, SimpleNamespace(image=b'fixture'))
        with patch('pymobiledevice3.remote.core_device.pasteboard_service.read_pasteboard', new=AsyncMock(return_value=content)) as read:
            self.assertEqual(await read_device_clipboard('rsd'), content)
            read.assert_awaited_once_with('rsd', allow_full_pull=True)


class BackendContractTests(unittest.TestCase):
    def test_incompatible_backend_is_rejected_before_mutating_it(self):
        from mirros.adapter import check_backend_contract
        from unittest.mock import patch
        module = SimpleNamespace(ScreenStreamServer=SimpleNamespace(), VIEWER_JS_TEMPLATE=b'changed')
        with patch('mirros.adapter.version', return_value='11.32.0'):
            with self.assertRaisesRegex(RuntimeError, 'contrato'):
                check_backend_contract(module)

    def test_wrong_dependency_version_has_actionable_error(self):
        from mirros.adapter import check_backend_contract
        from unittest.mock import patch
        with patch('mirros.adapter.version', return_value='99.0.0'):
            with self.assertRaisesRegex(RuntimeError, 'Repite la instalación'):
                check_backend_contract(None)


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
        from mirros.audio import AACELDDecoder
        audio = AACELDDecoder()
        self.assertEqual(audio.decoder.extradata, bytes.fromhex('f8e65000'))
        self.assertEqual(audio.decoder.sample_rate, 48000)
        self.assertEqual(audio.decoder.layout.name, 'stereo')


class SafeKeyboardTests(unittest.IsolatedAsyncioTestCase):
    async def test_detach_cancels_the_old_keyboard_lease(self):
        from mirros.adapter import keyboard_request
        import asyncio
        lease = asyncio.create_task(asyncio.sleep(60))
        server = SimpleNamespace(_hid_lock=asyncio.Lock(), _uhs=None,
                                 _kb_service_id=None, _mirros_keyboard_lease=lease)
        await keyboard_request(server, b'{"usages":[],"detach":true}', AsyncMock())
        self.assertTrue(lease.cancelled())
        self.assertIsNone(server._mirros_keyboard_lease)

    async def test_empty_release_never_registers_an_external_keyboard(self):
        from mirros.adapter import keyboard_request
        original = AsyncMock()
        server = SimpleNamespace(_kb_service_id=None)
        self.assertEqual(await keyboard_request(server, b'{"usages":[]}', original), (200, b'ok'))
        original.assert_not_awaited()

    async def test_detach_releases_keys_and_closes_keyboard_transport(self):
        from mirros.adapter import keyboard_request
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
        from mirros.adapter import release_input
        import asyncio
        uhs = SimpleNamespace(send_keyboard=AsyncMock(), close=AsyncMock())
        server = SimpleNamespace(_hid_lock=asyncio.Lock(), _uhs=uhs, _kb_service_id=None)
        await release_input(server)
        uhs.close.assert_not_awaited()
        self.assertIs(server._uhs, uhs)
import asyncio
import unittest
from unittest.mock import patch
from mirros.adapter import orientation_connection

class OrientationEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_other_requests_keep_their_request_line_and_body(self):
        reader=asyncio.StreamReader(); reader.feed_data(b'POST /rotate HTTP/1.1\r\nContent-Length: 2\r\n\r\n{}'); reader.feed_eof()
        async def original(server, stream, writer):
            self.assertEqual(await stream.readline(),b'POST /rotate HTTP/1.1\r\n')
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
            with patch('mirros.adapter.read_orientation',new=AsyncMock(return_value='landscapeLeft')) as query:
                await orientation_connection(server,reader,writer,AsyncMock())
                data=writer.write.call_args.args[0]
                if refusal: query.assert_not_awaited();self.assertIn(b'403',data)
                else: query.assert_awaited_once();self.assertIn(b'"orientation": "landscapeLeft"',data)
            writer.close.assert_called_once()


class TapReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def test_delayed_hid_open_cannot_collapse_the_first_tap(self):
        import asyncio
        from mirros.adapter import touch_request
        import time
        times = []
        server = SimpleNamespace()
        async def original(_server, body):
            if b'contact' in body:
                await asyncio.sleep(.05)  # Slow service opening after window blur.
            times.append(time.perf_counter())
            return 200, b'ok'
        await touch_request(server, b'{"type":"contact","x":100,"y":200}', original)
        await touch_request(server, b'{"type":"release","x":100,"y":200}', original)
        self.assertGreaterEqual(times[1] - times[0], .035)
        self.assertIsNone(server._mirros_contact)
        self.assertIsNone(server._mirros_contact_at)

    async def test_moves_do_not_restart_the_minimum_contact_timer(self):
        import asyncio
        from mirros.adapter import touch_request
        server = SimpleNamespace()
        original = AsyncMock(return_value=(200, b'ok'))
        await touch_request(server, b'{"type":"contact","x":100,"y":200}', original)
        started = server._mirros_contact_at
        await touch_request(server, b'{"type":"contact","x":300,"y":400}', original)
        self.assertEqual(server._mirros_contact_at, started)
        self.assertEqual(server._mirros_contact, (300, 400))


class EarlyTimerTests(unittest.IsolatedAsyncioTestCase):
    async def test_early_timer_wake_rechecks_real_contact_duration(self):
        from unittest.mock import patch
        from mirros.adapter import touch_request
        server = SimpleNamespace(_mirros_contact=(100, 200), _mirros_contact_at=1.0)
        original = AsyncMock(return_value=(200, b'ok'))
        with patch('mirros.adapter.time.perf_counter', side_effect=[1.01, 1.02, 1.039, 1.04]), patch('mirros.adapter.asyncio.sleep', new_callable=AsyncMock) as sleep:
            await touch_request(server, b'{"type":"release","x":100,"y":200}', original)
        self.assertEqual(sleep.await_count, 3)
        original.assert_awaited_once()
        self.assertIsNone(server._mirros_contact_at)


class DisplayModeTests(unittest.IsolatedAsyncioTestCase):
    async def test_display_mode_default_and_toggle(self):
        from mirros.adapter import get_display_mode, set_display_mode
        server = SimpleNamespace(_hid_lock=asyncio.Lock(), _ensure_hid=AsyncMock(), _uhs=None,
                                 _indigo=SimpleNamespace(send_button=AsyncMock()))
        self.assertEqual(get_display_mode(server), {'mode': 'dual', 'keepAwake': True})
        result = await set_display_mode(server, 'aod')
        self.assertEqual(result, {'mode': 'aod', 'keepAwake': False})
        self.assertEqual(get_display_mode(server), {'mode': 'aod', 'keepAwake': False})
        result = await set_display_mode(server, 'dual')
        self.assertEqual(result, {'mode': 'dual', 'keepAwake': True})
        self.assertEqual(get_display_mode(server), {'mode': 'dual', 'keepAwake': True})

    async def test_display_mode_endpoints(self):
        from unittest.mock import Mock
        from mirros.adapter import orientation_connection
        server = SimpleNamespace(_mirros_display_mode='dual', _mirros_keep_awake=True,
                                 _refuse_request=Mock(return_value=None),
                                 _read_body=AsyncMock(return_value=b'{"mode":"aod"}'),
                                 _hid_lock=asyncio.Lock(), _ensure_hid=AsyncMock(), _uhs=None,
                                 _indigo=SimpleNamespace(send_button=AsyncMock()))
        # Test GET /display-mode
        reader = asyncio.StreamReader()
        reader.feed_data(b'GET /display-mode HTTP/1.1\r\nHost: localhost\r\n\r\n')
        reader.feed_eof()
        writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
        await orientation_connection(server, reader, writer, AsyncMock())
        self.assertIn(b'"mode": "dual"', writer.write.call_args.args[0])

        # Test POST /display-mode
        reader = asyncio.StreamReader()
        reader.feed_data(b'POST /display-mode HTTP/1.1\r\nHost: localhost\r\nContent-Length: 14\r\n\r\n{"mode":"aod"}')
        reader.feed_eof()
        writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
        await orientation_connection(server, reader, writer, AsyncMock())
        self.assertIn(b'"mode": "aod"', writer.write.call_args.args[0])
        self.assertIn(b'"keepAwake": false', writer.write.call_args.args[0])

    async def test_wake_endpoint(self):
        from unittest.mock import Mock
        from mirros.adapter import orientation_connection
        uhs = SimpleNamespace(send_touchscreen=AsyncMock())
        server = SimpleNamespace(_refuse_request=Mock(return_value=None),
                                 _hid_lock=asyncio.Lock(), _ensure_hid=AsyncMock(), _uhs=uhs)
        reader = asyncio.StreamReader()
        reader.feed_data(b'POST /wake HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\n\r\n')
        reader.feed_eof()
        writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
        await orientation_connection(server, reader, writer, AsyncMock())
        self.assertIn(b'"status": "ok"', writer.write.call_args.args[0])
        self.assertTrue(uhs.send_touchscreen.awaited)
