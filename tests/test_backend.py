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

    async def test_aod_mode_keeps_session_healthy_while_tunnel_is_open(self):
        from mirros.adapter import session_health
        active_aod = self.server(age=25)
        active_aod._mirros_display_mode = 'aod'
        self.assertEqual(session_health(active_aod),
                         {'healthy': True, 'reason': 'aod_idle'})
        closed_aod = self.server(closed=True, age=25)
        closed_aod._mirros_display_mode = 'aod'
        self.assertEqual(session_health(closed_aod),
                         {'healthy': False, 'reason': 'transport_closed'})

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

    async def test_read_orientation_reuses_springboard_connection_and_caches_in_aod(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, patch
        from mirros.adapter import read_orientation, close_orientation
        first = SimpleNamespace(connect=AsyncMock(), close=AsyncMock(),
                                get_interface_orientation=AsyncMock(side_effect=[1, OSError('dropped')]))
        second = SimpleNamespace(connect=AsyncMock(), close=AsyncMock(),
                                 get_interface_orientation=AsyncMock(return_value=3))
        server = SimpleNamespace(_rsd='rsd')
        with patch('pymobiledevice3.services.springboard.SpringBoardServicesService', side_effect=[first, second]) as factory:
            self.assertEqual(await read_orientation(server), 'portrait')
            self.assertEqual(factory.call_count, 1)
            first.connect.assert_awaited_once()
            # Next call fails on first, reconnects on second
            self.assertEqual(await read_orientation(server), 'landscapeLeft')
            self.assertEqual(factory.call_count, 2)
            first.close.assert_awaited_once()
            # In AOD mode, cached orientation is returned without querying SpringBoard
            server._mirros_display_mode = 'aod'
            self.assertEqual(await read_orientation(server), 'landscapeLeft')
            self.assertEqual(second.get_interface_orientation.await_count, 1)
            # If _rsd is rebound in dual mode, old SpringBoard connection is replaced
            server._mirros_display_mode = 'dual'
            server._rsd = 'new_rsd'
            third = SimpleNamespace(connect=AsyncMock(), close=AsyncMock(),
                                    get_interface_orientation=AsyncMock(return_value=4))
            factory.side_effect = [third]
            self.assertEqual(await read_orientation(server), 'landscapeRight')
            second.close.assert_awaited_once()
            third.connect.assert_awaited_once()
            await close_orientation(server)
            third.close.assert_awaited_once()


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
        self.assertEqual(server._indigo.send_button.await_count, 2)  # DOWN and UP
        # Idempotent call: does not send button again
        result2 = await set_display_mode(server, 'aod')
        self.assertEqual(result2, {'mode': 'aod', 'keepAwake': False})
        self.assertEqual(server._indigo.send_button.await_count, 2)
        # Switch to dual: signals keep_awake_event
        event = asyncio.Event()
        server._mirros_keep_awake_event = event
        result = await set_display_mode(server, 'dual')
        self.assertEqual(result, {'mode': 'dual', 'keepAwake': True})
        self.assertTrue(event.is_set())
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

    async def test_app_switcher_endpoint(self):
        from unittest.mock import Mock
        from mirros.adapter import orientation_connection
        uhs = SimpleNamespace(send_touchscreen=AsyncMock())
        server = SimpleNamespace(_refuse_request=Mock(return_value=None),
                                 _hid_lock=asyncio.Lock(), _ensure_hid=AsyncMock(), _uhs=uhs)
        reader = asyncio.StreamReader()
        reader.feed_data(b'POST /app-switcher HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\n\r\n')
        reader.feed_eof()
        writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
        await orientation_connection(server, reader, writer, AsyncMock())
        body = writer.write.call_args.args[0]
        self.assertIn(b'"status": "ok"', body)
        self.assertIn(b'"method": "gesture"', body)
        self.assertTrue(uhs.send_touchscreen.awaited)

    async def test_apps_endpoint(self):
        from unittest.mock import Mock, patch
        from mirros.adapter import orientation_connection
        server = SimpleNamespace(_refuse_request=Mock(return_value=None),
                                 _rsd='dummy_rsd')
        apps_fixture = [{'name': 'TestApp', 'bundle_id': 'com.test.app', 'version': '1.0'}]
        with patch('mirros.adapter.list_device_apps', new=AsyncMock(return_value=apps_fixture)):
            reader = asyncio.StreamReader()
            reader.feed_data(b'GET /apps HTTP/1.1\r\nHost: localhost\r\n\r\n')
            reader.feed_eof()
            writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
            await orientation_connection(server, reader, writer, AsyncMock())
            body = writer.write.call_args.args[0]
            self.assertIn(b'200 OK', body)
            self.assertIn(b'com.test.app', body)

    async def test_launch_app_endpoint_validates_and_launches(self):
        from unittest.mock import Mock, patch
        from mirros.adapter import orientation_connection
        server = SimpleNamespace(_refuse_request=Mock(return_value=None),
                                 _read_body=AsyncMock(return_value=b'{"bundle_id":"com.test.app"}'),
                                 _rsd='dummy_rsd')
        with patch('mirros.adapter.launch_device_app', new=AsyncMock(return_value={'status': 'ok', 'bundle_id': 'com.test.app'})) as launch:
            reader = asyncio.StreamReader()
            reader.feed_data(b'POST /apps/launch HTTP/1.1\r\nHost: localhost\r\nContent-Length: 28\r\n\r\n{"bundle_id":"com.test.app"}')
            reader.feed_eof()
            writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
            await orientation_connection(server, reader, writer, AsyncMock())
            launch.assert_awaited_once_with(server, 'com.test.app')
            self.assertIn(b'200 OK', writer.write.call_args.args[0])

        server._read_body = AsyncMock(return_value=b'{"bundle_id":"bad id"}')
        reader = asyncio.StreamReader()
        reader.feed_data(b'POST /apps/launch HTTP/1.1\r\nHost: localhost\r\nContent-Length: 22\r\n\r\n{"bundle_id":"bad id"}')
        reader.feed_eof()
        writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
        await orientation_connection(server, reader, writer, AsyncMock())
        self.assertIn(b'400 Bad Request', writer.write.call_args.args[0])

    async def test_diagnostics_endpoint_returns_allowlisted_report(self):
        from unittest.mock import Mock, patch
        from mirros.adapter import orientation_connection
        server = SimpleNamespace(_refuse_request=Mock(return_value=None))
        with patch('mirros.diagnostics.collect_report', return_value={'schema_version': 1, 'usb': {'status': 'ok', 'device_count': 1}}):
            reader = asyncio.StreamReader()
            reader.feed_data(b'GET /diagnostics HTTP/1.1\r\nHost: localhost\r\n\r\n')
            reader.feed_eof()
            writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
            await orientation_connection(server, reader, writer, AsyncMock())
            body = writer.write.call_args.args[0]
            self.assertIn(b'200 OK', body)
            self.assertIn(b'"schema_version": 1', body)

    async def test_guarded_fresh_stream_prevents_aod_restart_storm_and_media_pause_restart(self):
        from unittest.mock import Mock
        from mirros.adapter import guarded_fresh_stream
        original = AsyncMock()
        req_idr = Mock()
        server = SimpleNamespace(_mirros_display_mode='aod', _mirros_media_paused=False, _last_good_au_t=0.0, _request_recovery_idr=req_idr)
        await guarded_fresh_stream(server, original, force=True)
        original.assert_not_awaited()
        self.assertGreater(server._last_good_au_t, 0.0)
        req_idr.assert_called_once_with(reason='aod_watchdog_idr')

        await guarded_fresh_stream(server, original, force=False)
        original.assert_awaited_once_with(server, force=False)

        server._mirros_media_paused = True
        with self.assertRaises(RuntimeError):
            await guarded_fresh_stream(server, original, force=False)

    async def test_wake_device_from_aod_restores_dual_mode_and_requests_idr(self):
        from unittest.mock import Mock, patch
        from mirros.adapter import wake_device
        uhs = SimpleNamespace(send_touchscreen=AsyncMock())
        indigo = SimpleNamespace(send_button=AsyncMock())
        server = SimpleNamespace(
            _hid_lock=asyncio.Lock(),
            _ensure_hid=AsyncMock(),
            _uhs=uhs,
            _indigo=indigo,
            _mirros_display_mode='aod',
            _mirros_keep_awake=False,
            _consecutive_restarts=4,
            _last_good_au_t=0.0,
            _active_service=object(),
            _request_recovery_idr=Mock(),
            _ensure_fresh_stream=AsyncMock(),
        )
        with patch('asyncio.sleep', new=AsyncMock()):
            await wake_device(server)
        self.assertEqual(server._mirros_display_mode, 'dual')
        self.assertTrue(server._mirros_keep_awake)
        self.assertEqual(server._consecutive_restarts, 0)
        self.assertEqual(indigo.send_button.await_count, 2)
        server._request_recovery_idr.assert_called_once_with(reason='wake')

    async def test_aod_interaction_triggers_idr_and_updates_health_time(self):
        from unittest.mock import Mock
        from mirros.adapter import touch_request
        server = SimpleNamespace(
            _mirros_display_mode='aod',
            _last_good_au_t=0.0,
            _request_recovery_idr=Mock(),
        )
        original = AsyncMock(return_value=(200, b'ok'))
        body = b'{"type":"contact","x":100,"y":200}'
        result = await touch_request(server, body, original)
        self.assertEqual(result, (200, b'ok'))
        self.assertGreater(server._last_good_au_t, 0.0)
        server._request_recovery_idr.assert_called_once_with(reason='aod_interaction')

    async def test_aod_key_press_triggers_idr(self):
        from unittest.mock import Mock
        from mirros.adapter import keyboard_request
        server = SimpleNamespace(
            _mirros_display_mode='aod',
            _kb_service_id=1,
            _last_good_au_t=0.0,
            _request_recovery_idr=Mock(),
        )
        original = AsyncMock(return_value=(200, b'ok'))
        body = b'{"usages":[30]}'
        result = await keyboard_request(server, body, original)
        self.assertEqual(result, (200, b'ok'))
        self.assertGreater(server._last_good_au_t, 0.0)
        server._request_recovery_idr.assert_called_once_with(reason='aod_key')

    async def test_media_state_endpoint_releases_and_resumes_or_reports_9022(self):
        from unittest.mock import Mock, patch
        from pymobiledevice3.exceptions import CoreDeviceError
        from mirros.adapter import orientation_connection, session_health
        rsd = SimpleNamespace(service=SimpleNamespace(
            reader=SimpleNamespace(at_eof=Mock(return_value=False)),
            writer=SimpleNamespace(is_closing=Mock(return_value=False)),
        ))
        server = SimpleNamespace(
            _refuse_request=Mock(return_value=None),
            _read_body=AsyncMock(return_value=b'{"paused":true}'),
            _rsd=rsd,
            _stream_lock=asyncio.Lock(),
            _audio_lock=asyncio.Lock(),
            _stop_active_stream=AsyncMock(),
            _stop_audio_stream=AsyncMock(),
            _ensure_fresh_stream=AsyncMock(),
            _consecutive_restarts=3,
            _last_good_au_t=0.0,
        )
        with patch('pymobiledevice3.remote.core_device.display_service.DisplayService.stop_all_streams', new=AsyncMock()) as stop_all:
            reader = asyncio.StreamReader()
            reader.feed_data(b'POST /media-state HTTP/1.1\r\nHost: localhost\r\nContent-Length: 15\r\n\r\n{"paused":true}')
            reader.feed_eof()
            writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
            await orientation_connection(server, reader, writer, AsyncMock())
            stop_all.assert_awaited_once_with(rsd)
            self.assertTrue(server._mirros_media_paused)
            self.assertEqual(session_health(server), {'healthy': True, 'reason': 'media_paused'})
            self.assertIn(b'"paused": true', writer.write.call_args.args[0])

        server._read_body = AsyncMock(return_value=b'{"paused":false}')
        server._ensure_fresh_stream = AsyncMock(side_effect=CoreDeviceError('Camera or microphone is in use', code=9022))
        reader = asyncio.StreamReader()
        reader.feed_data(b'POST /media-state HTTP/1.1\r\nHost: localhost\r\nContent-Length: 16\r\n\r\n{"paused":false}')
        reader.feed_eof()
        writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
        await orientation_connection(server, reader, writer, AsyncMock())
        body = writer.write.call_args.args[0]
        self.assertIn(b'409 Conflict', body)
        self.assertIn(b'"code": "media_in_use"', body)
        self.assertTrue(server._mirros_media_paused)

    async def test_style_endpoint_gets_and_sets_appearance(self):
        from unittest.mock import Mock, patch
        from mirros.adapter import orientation_connection
        server = SimpleNamespace(_refuse_request=Mock(return_value=None), _rsd='dummy_rsd')
        with patch('mirros.adapter.get_ios_style', new=AsyncMock(return_value={'style': 'dark'})):
            reader = asyncio.StreamReader()
            reader.feed_data(b'GET /style HTTP/1.1\r\nHost: localhost\r\n\r\n')
            reader.feed_eof()
            writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
            await orientation_connection(server, reader, writer, AsyncMock())
            self.assertIn(b'"style": "dark"', writer.write.call_args.args[0])

        server._read_body = AsyncMock(return_value=b'{"style":"invalid"}')
        reader = asyncio.StreamReader()
        reader.feed_data(b'POST /style HTTP/1.1\r\nHost: localhost\r\nContent-Length: 19\r\n\r\n{"style":"invalid"}')
        reader.feed_eof()
        writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
        await orientation_connection(server, reader, writer, AsyncMock())
        self.assertIn(b'400 Bad Request', writer.write.call_args.args[0])


class SensorAutoPauseTests(unittest.IsolatedAsyncioTestCase):
    def test_classify_sensor_log_detects_camera_open_and_close(self):
        from mirros.adapter import classify_sensor_log
        self.assertEqual(classify_sensor_log('cameracaptured', 'MediaSafetyNet state: Cam(Hot: com.apple.camera) Mic(Cold:)'), 'hot')
        # os_trace entrega la ruta completa del ejecutable.
        self.assertEqual(classify_sensor_log('/usr/libexec/cameracaptured', 'MediaSafetyNet state: Cam(Cold:)'), 'cold')
        self.assertEqual(classify_sensor_log('/usr/sbin/audiomxd', 'Client com.apple.camera is now Foreground'), 'hot')
        self.assertEqual(classify_sensor_log('cameracaptured', 'MediaSafetyNet state: Cam(Cold:) Mic(Hot: com.apple.VoiceMemos)'), 'hot')
        self.assertEqual(classify_sensor_log('audiomxd', 'Client com.apple.camera (pid 12) is now Background'), 'cold')
        self.assertIsNone(classify_sensor_log('cameracaptured', 'Looking for com.apple.camera in the Main Display layout'))
        self.assertEqual(classify_sensor_log('audiomxd', 'Client com.apple.VoiceMemos (pid 9) is now Foreground'), 'hot')
        self.assertIsNone(classify_sensor_log('audiomxd', 'Client com.apple.Music is now Background'))
        self.assertIsNone(classify_sensor_log('SpringBoard', 'Cam(Hot: x)'))
        self.assertIsNone(classify_sensor_log('', ''))

    def media_server(self):
        from unittest.mock import Mock
        rsd = SimpleNamespace(service=SimpleNamespace(
            reader=SimpleNamespace(at_eof=Mock(return_value=False)),
            writer=SimpleNamespace(is_closing=Mock(return_value=False)),
        ))
        return SimpleNamespace(
            _refuse_request=Mock(return_value=None),
            _rsd=rsd,
            _stream_lock=asyncio.Lock(),
            _audio_lock=asyncio.Lock(),
            _stop_active_stream=AsyncMock(),
            _stop_audio_stream=AsyncMock(),
            _ensure_fresh_stream=AsyncMock(),
            _consecutive_restarts=0,
            _last_good_au_t=0.0,
        )

    async def test_guarded_fresh_stream_auto_pauses_on_9022(self):
        from unittest.mock import patch
        from pymobiledevice3.exceptions import CoreDeviceError
        from mirros.adapter import guarded_fresh_stream, get_media_state
        server = self.media_server()
        original = AsyncMock(side_effect=CoreDeviceError('Camera or microphone is in use', code=9022))
        with patch('pymobiledevice3.remote.core_device.display_service.DisplayService.stop_all_streams', new=AsyncMock()) as stop_all:
            with self.assertRaises(CoreDeviceError):
                await guarded_fresh_stream(server, original, force=True)
            # La pausa se marca al instante para frenar el watchdog.
            self.assertEqual(get_media_state(server), {'paused': True, 'reason': 'auto_sensor'})
            await server._mirros_auto_pause_task
            stop_all.assert_awaited_once_with(server._rsd)
        # Reintentos posteriores del watchdog no vuelven a tocar el dispositivo.
        with self.assertRaises(RuntimeError):
            await guarded_fresh_stream(server, original, force=True)
        self.assertEqual(original.await_count, 1)

    async def test_launch_camera_app_pauses_capture_before_launch(self):
        from unittest.mock import patch
        from mirros.adapter import launch_device_app
        server = self.media_server()
        order = []
        service = SimpleNamespace(launch_application=AsyncMock(side_effect=lambda *a, **k: order.append('launch')))
        context = AsyncMock()
        context.__aenter__.return_value = service
        async def stop_all(_rsd):
            order.append('stop')
        with patch('pymobiledevice3.remote.core_device.display_service.DisplayService.stop_all_streams', new=stop_all), \
             patch('pymobiledevice3.remote.core_device.app_service.AppServiceService', return_value=context):
            result = await launch_device_app(server, 'com.apple.camera')
        self.assertEqual(result['status'], 'ok')
        self.assertTrue(result['media_paused'])
        self.assertEqual(order, ['stop', 'launch'])
        self.assertEqual(server._mirros_media_pause_reason, 'auto_sensor')

    async def test_launch_regular_app_keeps_capture_running(self):
        from unittest.mock import patch
        from mirros.adapter import launch_device_app
        server = self.media_server()
        context = AsyncMock()
        context.__aenter__.return_value = SimpleNamespace(launch_application=AsyncMock())
        with patch('pymobiledevice3.remote.core_device.app_service.AppServiceService', return_value=context):
            result = await launch_device_app(server, 'com.test.app')
        self.assertFalse(result['media_paused'])
        self.assertFalse(getattr(server, '_mirros_media_paused', False))

    async def test_media_state_exit_app_presses_home_then_resumes(self):
        from unittest.mock import Mock, patch
        from mirros.adapter import orientation_connection
        server = self.media_server()
        server._mirros_media_paused = True
        server._mirros_media_pause_reason = 'auto_sensor'
        order = []
        server._indigo = SimpleNamespace(send_button=AsyncMock(side_effect=lambda *a: order.append('button')))
        server._ensure_fresh_stream = AsyncMock(side_effect=lambda **k: order.append('resume'))
        server._read_body = AsyncMock(return_value=b'{"paused":false,"exit_app":true}')
        reader = asyncio.StreamReader()
        reader.feed_data(b'POST /media-state HTTP/1.1\r\nHost: localhost\r\nContent-Length: 32\r\n\r\n{"paused":false,"exit_app":true}')
        reader.feed_eof()
        writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
        with patch('mirros.adapter.asyncio.sleep', new=AsyncMock()):
            await orientation_connection(server, reader, writer, AsyncMock())
        body = writer.write.call_args.args[0]
        self.assertIn(b'200 OK', body)
        self.assertEqual(order, ['button', 'button', 'resume'])
        self.assertFalse(server._mirros_media_paused)
        self.assertIsNone(server._mirros_media_pause_reason)

    async def test_sensor_loop_pauses_on_hot_and_resumes_on_cold(self):
        from unittest.mock import patch
        from mirros import adapter
        server = self.media_server()
        entries = [
            SimpleNamespace(filename='cameracaptured', message='MediaSafetyNet state: Cam(Hot: com.apple.camera)'),
            SimpleNamespace(filename='cameracaptured', message='MediaSafetyNet state: Cam(Cold:)'),
        ]
        done = asyncio.Event()

        class FakeTrace:
            def __init__(self, _rsd):
                pass
            async def __aenter__(self):
                return self
            async def __aexit__(self, *exc):
                return False
            async def syslog(self, **_kwargs):
                for entry in entries:
                    yield entry
                    if 'Hot' in entry.message:
                        # Simula el paso del tiempo entre abrir y cerrar Cámara.
                        server._mirros_media_paused_at -= 5
                done.set()
                await asyncio.Event().wait()

        real_sleep = asyncio.sleep
        with patch('pymobiledevice3.services.os_trace.OsTraceService', FakeTrace), \
             patch('pymobiledevice3.remote.core_device.display_service.DisplayService.stop_all_streams', new=AsyncMock()), \
             patch('mirros.adapter.asyncio.sleep', new=lambda *_a, **_k: real_sleep(0)):
            task = asyncio.create_task(adapter.sensor_activity_loop(server))
            await asyncio.wait_for(done.wait(), 1)
            for _ in range(20):
                if not getattr(server, '_mirros_media_paused', True):
                    break
                await real_sleep(0)
            task.cancel()
            await task
        server._stop_active_stream.assert_awaited()
        server._ensure_fresh_stream.assert_awaited_with(force=True)
        self.assertFalse(server._mirros_media_paused)

    async def test_camera_frame_and_shutter_endpoints(self):
        from unittest.mock import Mock, patch
        from mirros.adapter import orientation_connection
        server = self.media_server()
        server._mirros_media_paused = True

        # Test GET /camera-frame
        with patch('mirros.adapter.camera_snapshot', new=AsyncMock(return_value=(b'fake_jpeg_bytes', 'image/jpeg'))):
            reader = asyncio.StreamReader()
            reader.feed_data(b'GET /camera-frame HTTP/1.1\r\nHost: localhost\r\n\r\n')
            reader.feed_eof()
            writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
            await orientation_connection(server, reader, writer, AsyncMock())
            body = writer.write.call_args.args[0]
            self.assertIn(b'200 OK', body)
            self.assertIn(b'Content-Type: image/jpeg', body)
            self.assertIn(b'fake_jpeg_bytes', body)

        # Test POST /camera-shutter
        with patch('mirros.adapter.press_button_indigo', new=AsyncMock(return_value=True)) as press_btn:
            reader = asyncio.StreamReader()
            reader.feed_data(b'POST /camera-shutter HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\n\r\n')
            reader.feed_eof()
            writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
            await orientation_connection(server, reader, writer, AsyncMock())
            press_btn.assert_awaited_once_with(server, 'volume-down')
            body = writer.write.call_args.args[0]
            self.assertIn(b'200 OK', body)
            self.assertIn(b'"status": "ok"', body)

        # Test POST /button while media is paused redirects to press_button_indigo
        with patch('mirros.adapter.press_button_indigo', new=AsyncMock(return_value=True)) as press_btn:
            btn_body = b'{"name": "volume-down", "state": "press"}'
            server._read_body = AsyncMock(return_value=btn_body)
            reader = asyncio.StreamReader()
            reader.feed_data(b'POST /button HTTP/1.1\r\nHost: localhost\r\nContent-Length: ' + str(len(btn_body)).encode() + b'\r\n\r\n' + btn_body)
            reader.feed_eof()
            writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
            await orientation_connection(server, reader, writer, AsyncMock())
            await asyncio.sleep(0.01)
            press_btn.assert_awaited_once_with(server, 'volume-down')
            body = writer.write.call_args.args[0]
            self.assertIn(b'200 OK', body)
