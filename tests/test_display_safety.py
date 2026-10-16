"""Regressions for real HID lock acquisition in display controls."""
import asyncio
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from mirros.adapter import set_display_mode, wake_device


class DisplaySafetyTests(unittest.IsolatedAsyncioTestCase):
    def server(self):
        lock = asyncio.Lock()
        async def ensure():
            async with lock:
                pass
        return SimpleNamespace(_hid_lock=lock, _ensure_hid=ensure,
                               _indigo=SimpleNamespace(send_button=AsyncMock()),
                               _uhs=SimpleNamespace(send_touchscreen=AsyncMock()))

    async def test_aod_can_initialize_a_keyboard_that_takes_the_real_lock(self):
        server = self.server()
        with patch.dict('pymobiledevice3.remote.core_device.screen_stream._NAMED_BUTTONS', {'lock':(12,48,0)}):
            await asyncio.wait_for(set_display_mode(server, 'aod'), 0.3)
        self.assertEqual(server._indigo.send_button.await_count, 2)

    async def test_wake_can_initialize_hid_without_reentering_its_lock(self):
        server = self.server()
        await asyncio.wait_for(wake_device(server), 0.5)
        self.assertGreater(server._uhs.send_touchscreen.await_count, 1)

    async def test_failed_lock_does_not_publish_aod_and_releases_button(self):
        server = self.server()
        server._indigo.send_button.side_effect = [RuntimeError('transport lost'), None]
        result = await set_display_mode(server, 'aod')
        self.assertEqual(result['status'], 'error')
        self.assertEqual(server._indigo.send_button.await_count, 2)
        self.assertFalse(hasattr(server, '_mirros_display_mode'))

    async def test_failed_swipe_still_releases_contact(self):
        server = self.server()
        server._uhs.send_touchscreen.side_effect = [RuntimeError('transport lost'), None]
        result = await wake_device(server)
        self.assertEqual(result['status'], 'error')
        self.assertEqual(server._uhs.send_touchscreen.await_count, 2)

    async def test_invalid_mode_never_changes_device_state(self):
        server = self.server()
        server._mirros_display_mode = 'aod'
        result = await set_display_mode(server, 'invalid')
        self.assertEqual(result['status'], 'error')
        self.assertEqual(server._mirros_display_mode, 'aod')
        server._indigo.send_button.assert_not_awaited()

    async def test_cancellation_still_releases_contact(self):
        server = self.server()
        server._uhs.send_touchscreen.side_effect = [asyncio.CancelledError(), None]
        with self.assertRaises(asyncio.CancelledError):
            await wake_device(server)
        self.assertEqual(server._uhs.send_touchscreen.await_count, 2)
