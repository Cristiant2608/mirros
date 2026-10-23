"""Adaptación del visor del backend fijado, sin modificar sus archivos instalados."""

from importlib.resources import files
import asyncio
import logging
import json
import sys
import contextlib
import posixpath
import time
from urllib.parse import urlsplit, parse_qs
from importlib.metadata import version


def check_backend_contract(module):
    """Fail before patching anything when the pinned upstream contract changes."""
    if version('pymobiledevice3') != '11.32.0':
        raise RuntimeError('MirrOS requiere pymobiledevice3 11.32.0. Repite la instalación.')
    required = ('_hid_worker', '_serve_connection', '_handle_key', '_handle_touch',
                '_stop_hid', '_ensure_hid', '_missing_audio_deps', 'serve', '_keep_awake_loop')
    missing = [name for name in required if not callable(getattr(module.ScreenStreamServer, name, None))]
    marker = b'const decoderConfig = { codec, description, optimizeForLatency: true };'
    if missing or not callable(getattr(module, 'read_pasteboard', None)) or module.VIEWER_JS_TEMPLATE.count(marker) != 1:
        raise RuntimeError('El contrato del backend cambió; revisa el adaptador de MirrOS.')


async def read_device_clipboard(rsd):
    # Manual pulls may resolve an image inside a rich representation (e.g. Notes).
    # The upstream monitor retains its fast primary-type policy; no background reads.
    from pymobiledevice3.remote.core_device.pasteboard_service import read_pasteboard
    return await read_pasteboard(rsd, allow_full_pull=True)


async def clipboard_revision(server):
    from pymobiledevice3.remote.core_device.pasteboard_service import PasteboardService, POLICY_ALL_PROMISED
    async with PasteboardService(server._rsd) as service:
        snapshot = await service.get(data_policy=POLICY_ALL_PROMISED)
    metadata = (snapshot.get('pasteboard') or {}).get('metadata') or {}
    if 'nonce' not in metadata or 'changeCount' not in metadata:
        raise RuntimeError('iOS no informó el estado del portapapeles.')
    return f"{metadata['nonce']}:{metadata['changeCount']}"


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
            server._mirros_contact_at = None
        if uhs is not None and keyboard is not None:
            try:
                with contextlib.suppress(Exception):
                    await asyncio.wait_for(uhs.close(), 1)
            finally:
                server._uhs = None
                server._kb_service_id = None
        server._kb_service_id = None


async def touch_request(server, body, original):
    """Preserve a real tap dwell even when opening HID delayed the queued down."""
    try:
        data = json.loads(body)
    except (ValueError, TypeError):
        return await original(server, body)
    if not isinstance(data, dict):
        return await original(server, body)
    sent_at = getattr(server, '_mirros_contact_at', None)
    if data.get('type') == 'release' and sent_at is not None:
        # Windows asyncio clocks may wake timers early; check elapsed real time.
        while True:
            remaining = .04 - (time.perf_counter() - sent_at)
            if remaining <= 0:
                break
            await asyncio.sleep(max(.016, remaining))
    result = await original(server, body)
    if result[0] == 200:
        if data.get('type') == 'contact':
            if getattr(server, '_mirros_contact', None) is None:
                server._mirros_contact_at = time.perf_counter()
            server._mirros_contact = (data.get('x', 0), data.get('y', 0))
        else:
            server._mirros_contact = None
            server._mirros_contact_at = None
    return result


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


async def close_orientation(server):
    service = getattr(server, '_mirros_springboard', None)
    server._mirros_springboard = None
    server._mirros_springboard_rsd = None
    if service is not None:
        with contextlib.suppress(Exception):
            await asyncio.wait_for(service.close(), 1)


async def read_orientation(server):
    if getattr(server, '_mirros_display_mode', 'dual') == 'aod':
        cached = getattr(server, '_mirros_last_orientation', None)
        if cached:
            return cached
    lock = getattr(server, '_mirros_orientation_lock', None)
    if lock is None:
        lock = asyncio.Lock()
        server._mirros_orientation_lock = lock
    async with lock:
        from pymobiledevice3.services.springboard import SpringBoardServicesService
        service = getattr(server, '_mirros_springboard', None)
        current_rsd = getattr(server, '_rsd', None)
        if service is not None and getattr(server, '_mirros_springboard_rsd', current_rsd) is not current_rsd:
            await close_orientation(server)
            service = None
        for attempt in range(2):
            try:
                if service is None:
                    service = SpringBoardServicesService(current_rsd)
                    await service.connect()
                    server._mirros_springboard = service
                    server._mirros_springboard_rsd = current_rsd
                value = await service.get_interface_orientation()
                orientation = {1: 'portrait', 2: 'portraitUpsideDown', 3: 'landscapeLeft', 4: 'landscapeRight'}[int(value)]
                server._mirros_last_orientation = orientation
                return orientation
            except Exception:
                await close_orientation(server)
                service = None
                if attempt == 1:
                    raise


def session_health(server):
    """Cached codec data does not prove that the USB tunnel is still usable."""
    from mirros.diagnostics import record_diagnostic_error
    try:
        connection = server._rsd.service
        if connection.reader.at_eof() or connection.writer.is_closing():
            record_diagnostic_error('transport_closed')
            return {'healthy': False, 'reason': 'transport_closed'}
    except Exception:
        record_diagnostic_error('transport_closed')
        return {'healthy': False, 'reason': 'transport_closed'}
    if getattr(server, '_mirros_media_paused', False):
        return {'healthy': True, 'reason': 'media_paused'}
    last_frame = server._last_good_au_t or getattr(server, '_mirros_started', 0)
    age = asyncio.get_running_loop().time() - last_frame
    if age >= 20 and getattr(server, '_mirros_display_mode', 'dual') == 'aod':
        return {'healthy': True, 'reason': 'aod_idle'}
    if age >= 20:
        record_diagnostic_error('video_stalled')
    return {'healthy': age < 20, 'reason': 'ok' if age < 20 else 'video_stalled'}


def get_display_mode(server):
    mode = getattr(server, '_mirros_display_mode', 'dual')
    keep_awake = getattr(server, '_mirros_keep_awake', True)
    return {'mode': mode, 'keepAwake': keep_awake}


async def set_display_mode(server, mode: str):
    if mode not in ('dual', 'aod'):
        return {'status': 'error', 'message': 'Modo de pantalla no válido.'}
    if mode == 'aod':
        if getattr(server, '_mirros_display_mode', 'dual') != 'aod':
            try:
                from pymobiledevice3.remote.core_device.screen_stream import _NAMED_BUTTONS
                from pymobiledevice3.remote.core_device.hid_service import HID_BUTTON_STATE_DOWN, HID_BUTTON_STATE_UP
                usage_page, usage_code, hold_seconds = _NAMED_BUTTONS['lock']
                # _ensure_hid acquires _hid_lock itself (asyncio locks are not reentrant).
                await server._ensure_hid()
                async with server._hid_lock:
                    indigo = getattr(server, '_indigo', None)
                    if indigo is None:
                        raise RuntimeError('HID no disponible')
                    try:
                        await indigo.send_button(usage_page, usage_code, HID_BUTTON_STATE_DOWN)
                        await asyncio.sleep(hold_seconds)
                    finally:
                        await indigo.send_button(usage_page, usage_code, HID_BUTTON_STATE_UP)
            except Exception as error:
                from mirros.diagnostics import record_diagnostic_error
                record_diagnostic_error('aod_failed')
                logging.getLogger(__name__).warning('No se pudo enviar bloqueo para modo AOD: %s', error)
                return {'status': 'error', 'message': 'No se pudo solicitar reposo al iPhone.'}
        server._mirros_display_mode = 'aod'
        server._mirros_keep_awake = False
        return {'mode': 'aod', 'keepAwake': False}
    else:
        server._mirros_display_mode = 'dual'
        server._mirros_keep_awake = True
        event = getattr(server, '_mirros_keep_awake_event', None)
        if event is not None:
            event.set()
        return {'mode': 'dual', 'keepAwake': True}


async def wake_device(server):
    """Send a wake gesture. Authentication remains controlled by iOS."""
    was_aod = getattr(server, '_mirros_display_mode', 'dual') == 'aod'
    try:
        await server._ensure_hid()
        async with server._hid_lock:
            indigo = getattr(server, '_indigo', None)
            if was_aod and indigo is not None:
                from pymobiledevice3.remote.core_device.screen_stream import _NAMED_BUTTONS
                from pymobiledevice3.remote.core_device.hid_service import HID_BUTTON_STATE_DOWN, HID_BUTTON_STATE_UP
                usage_page, usage_code, _ = _NAMED_BUTTONS['home']
                with contextlib.suppress(Exception):
                    await indigo.send_button(usage_page, usage_code, HID_BUTTON_STATE_DOWN)
                    await asyncio.sleep(0.04)
                    await indigo.send_button(usage_page, usage_code, HID_BUTTON_STATE_UP)
                    await asyncio.sleep(0.08)
            uhs = getattr(server, '_uhs', None)
            if uhs is not None:
                from pymobiledevice3.remote.core_device.hid_service import (
                    TOUCHSCREEN_STATE_CONTACT,
                    TOUCHSCREEN_STATE_RELEASE,
                )
                start_x, start_y = 32768, 62000
                end_y = 15000
                steps = 8
                cur_y = start_y
                try:
                    await uhs.send_touchscreen(TOUCHSCREEN_STATE_CONTACT, start_x, start_y)
                    await asyncio.sleep(0.04)
                    for i in range(1, steps + 1):
                        cur_y = int(start_y + (end_y - start_y) * (i / steps))
                        await uhs.send_touchscreen(TOUCHSCREEN_STATE_CONTACT, start_x, cur_y)
                        await asyncio.sleep(0.015)
                finally:
                    await uhs.send_touchscreen(TOUCHSCREEN_STATE_RELEASE, start_x, cur_y)
            else:
                raise RuntimeError('HID no disponible')
    except Exception as error:
        from mirros.diagnostics import record_diagnostic_error
        record_diagnostic_error('wake_failed')
        logging.getLogger(__name__).warning('No se pudo despertar el dispositivo: %s', error)
        return {'status': 'error', 'message': 'No se pudo enviar el gesto al iPhone.'}
    server._mirros_display_mode = 'dual'
    server._mirros_keep_awake = True
    event = getattr(server, '_mirros_keep_awake_event', None)
    if event is not None:
        event.set()
    server._consecutive_restarts = 0
    with contextlib.suppress(Exception):
        server._last_good_au_t = asyncio.get_running_loop().time()
    if not getattr(server, '_mirros_media_paused', False):
        if getattr(server, '_active_service', None) is not None and callable(getattr(server, '_request_recovery_idr', None)):
            with contextlib.suppress(Exception):
                server._request_recovery_idr(reason='wake')
        elif callable(getattr(server, '_ensure_fresh_stream', None)):
            asyncio.create_task(server._ensure_fresh_stream(force=True))
    return {'status': 'ok', 'mode': 'dual', 'keepAwake': True}


SENSOR_BUNDLE_IDS = frozenset({
    'com.apple.camera',
    'com.apple.VoiceMemos',
    'com.apple.Magnifier',
    'com.apple.facetime',
    'net.whatsapp.WhatsApp',
    'com.burbn.instagram',
    'ph.telegra.Telegraph',
    'us.zoom.videomeetings',
    'com.google.Meet',
    'com.skype.skype',
    'com.microsoft.teams',
})


def classify_sensor_log(filename: str, message: str):
    """Clasifica eventos de os_trace de cámara o micrófono en 'hot', 'cold' o None."""
    if not filename or not message:
        return None
    # os_trace entrega la ruta completa del ejecutable (p. ej. /usr/libexec/cameracaptured).
    filename = posixpath.basename(filename)
    if filename == 'cameracaptured':
        # Solo el estado MediaSafetyNet es fiable; "Looking for ... in the Main Display layout"
        # se registra con cualquier cambio de pantalla (incluso bloqueada) y no indica uso real.
        if 'MediaSafetyNet state:' not in message:
            return None
        if 'Cam(Hot:' in message or 'Mic(Hot:' in message:
            return 'hot'
        if 'Cam(Cold:' in message and 'Mic(Hot:' not in message:
            return 'cold'
        if 'Mic(Cold:' in message and 'Cam(Hot:' not in message:
            return 'cold'
    elif filename == 'audiomxd':
        if 'is now Foreground' in message and any(f'Client {bundle_id}' in message for bundle_id in SENSOR_BUNDLE_IDS):
            return 'hot'
        # Notas de Voz u otras apps liberan el micrófono al pasar a segundo plano o terminar.
        if 'is now Background' in message and any(f'Client {bundle_id}' in message for bundle_id in SENSOR_BUNDLE_IDS):
            return 'cold'
    return None


async def press_button_indigo(server, button_name: str) -> bool:
    """Envía un botón de hardware mediante IndigoHIDService incluso cuando DisplayService está detenido."""
    from pymobiledevice3.remote.core_device.hid_service import (
        HID_BUTTON_STATE_DOWN,
        HID_BUTTON_STATE_UP,
        IndigoHIDService,
    )
    from pymobiledevice3.remote.core_device.screen_stream import _NAMED_BUTTONS

    button_info = _NAMED_BUTTONS.get(button_name)
    if not button_info:
        return False
    usage_page, usage_code, _ = button_info
    indigo = getattr(server, '_indigo', None)
    if indigo is not None:
        try:
            await indigo.send_button(usage_page, usage_code, HID_BUTTON_STATE_DOWN)
            await asyncio.sleep(0.05)
            await indigo.send_button(usage_page, usage_code, HID_BUTTON_STATE_UP)
            return True
        except Exception:
            logging.getLogger(__name__).debug('Reintentando botón %s con sesión IndigoHID dedicada', button_name, exc_info=True)
    try:
        async with IndigoHIDService(server._rsd) as temp_indigo:
            await temp_indigo.send_button(usage_page, usage_code, HID_BUTTON_STATE_DOWN)
            await asyncio.sleep(0.05)
            await temp_indigo.send_button(usage_page, usage_code, HID_BUTTON_STATE_UP)
        return True
    except Exception as error:
        logging.getLogger(__name__).warning('No se pudo enviar botón %s por IndigoHID: %s', button_name, error)
        return False


async def press_home_indigo(server) -> bool:
    """Envía el botón Inicio mediante IndigoHIDService incluso cuando DisplayService está detenido."""
    return await press_button_indigo(server, 'home')


def _is_media_9022(error: BaseException) -> bool:
    if getattr(error, 'code', None) == 9022:
        return True
    try:
        from pymobiledevice3.remote.core_device.display_service import is_media_in_use_error
        if is_media_in_use_error(error):
            return True
    except Exception:
        pass
    msg = str(error)
    return '9022' in msg or 'in use' in msg.lower() or 'in_use' in msg.lower()


def get_media_state(server):
    paused = bool(getattr(server, '_mirros_media_paused', False))
    reason = getattr(server, '_mirros_media_pause_reason', 'manual') if paused else None
    return {'paused': paused, 'reason': reason}


async def set_media_state(server, paused: bool, *, reason: str = 'manual', exit_app: bool = False):
    """Pausa o reanuda la observación remota de CoreDevice para liberar cámara y micrófono en el iPhone."""
    from mirros.diagnostics import record_diagnostic_error
    if not isinstance(paused, bool):
        return {'status': 'error', 'message': 'Estado multimedia no válido.'}
    pause_reason = reason if reason in ('manual', 'auto_sensor') else 'manual'
    if paused:
        server._mirros_media_paused = True
        server._mirros_media_pause_reason = pause_reason
        with contextlib.suppress(Exception):
            server._mirros_media_paused_at = asyncio.get_running_loop().time()
        try:
            if hasattr(server, '_stream_lock') and callable(getattr(server, '_stop_active_stream', None)):
                async with server._stream_lock:
                    await server._stop_active_stream()
            elif callable(getattr(server, '_stop_active_stream', None)):
                await server._stop_active_stream()
            if hasattr(server, '_audio_lock') and callable(getattr(server, '_stop_audio_stream', None)):
                async with server._audio_lock:
                    await server._stop_audio_stream()
            elif callable(getattr(server, '_stop_audio_stream', None)):
                await server._stop_audio_stream()
            from pymobiledevice3.remote.core_device.display_service import DisplayService
            await asyncio.wait_for(DisplayService.stop_all_streams(server._rsd), timeout=6.0)
        except Exception as error:
            server._mirros_media_paused = False
            server._mirros_media_pause_reason = None
            record_diagnostic_error('media_pause_failed')
            logging.getLogger(__name__).warning('No se pudo liberar la sesión multimedia: %s', error)
            return {'status': 'error', 'paused': False, 'message': 'No se pudo liberar cámara y micrófono en el iPhone.'}
        return {'status': 'ok', 'paused': True, 'reason': pause_reason}

    if exit_app:
        await press_home_indigo(server)
        await asyncio.sleep(0.7)

    server._mirros_media_paused = False
    server._mirros_media_pause_reason = None
    server._mirros_display_mode = 'dual'
    server._mirros_keep_awake = True
    event = getattr(server, '_mirros_keep_awake_event', None)
    if event is not None:
        event.set()
    server._mirros_media_resuming = True
    try:
        if callable(getattr(server, '_ensure_audio_stream', None)):
            with contextlib.suppress(Exception):
                await asyncio.wait_for(server._ensure_audio_stream(), timeout=10.0)
        if callable(getattr(server, '_ensure_fresh_stream', None)):
            for attempt in range(3 if exit_app else 1):
                try:
                    await asyncio.wait_for(server._ensure_fresh_stream(force=True), timeout=15.0)
                    break
                except Exception as err:
                    if exit_app and attempt < 2 and _is_media_9022(err):
                        await asyncio.sleep(0.5)
                        continue
                    raise
        server._consecutive_restarts = 0
        with contextlib.suppress(Exception):
            server._last_good_au_t = asyncio.get_running_loop().time()
        return {'status': 'ok', 'paused': False, 'reason': None}
    except Exception as error:
        server._mirros_media_paused = True
        if _is_media_9022(error):
            server._mirros_media_pause_reason = 'auto_sensor'
            record_diagnostic_error('media_in_use')
            return {
                'status': 'error',
                'code': 'media_in_use',
                'paused': True,
                'reason': 'auto_sensor',
                'message': 'Cierra primero la app Cámara o micrófono en el iPhone para reanudar la pantalla.',
            }
        server._mirros_media_pause_reason = 'manual'
        record_diagnostic_error('media_pause_failed')
        logging.getLogger(__name__).warning('No se pudo reanudar la sesión multimedia: %s', error)
        return {'status': 'error', 'paused': True, 'reason': 'manual', 'message': 'No se pudo reanudar la transmisión de pantalla.'}
    finally:
        server._mirros_media_resuming = False


async def get_ios_style(server):
    from pymobiledevice3.remote.core_device.configuration_service import ConfigurationService
    async with ConfigurationService(server._rsd) as cfg:
        style = await cfg.get_user_interface_style()
    return {'style': str(style)}


async def set_ios_style(server, style: str):
    if style not in ('light', 'dark'):
        return {'status': 'error', 'message': 'Aspecto de iOS no válido.'}
    try:
        from pymobiledevice3.remote.core_device.configuration_service import ConfigurationService
        async with ConfigurationService(server._rsd) as cfg:
            await cfg.set_user_interface_style(style)
        return {'status': 'ok', 'style': style}
    except Exception as error:
        from mirros.diagnostics import record_diagnostic_error
        record_diagnostic_error('style_failed')
        logging.getLogger(__name__).warning('No se pudo cambiar el aspecto de iOS a %s: %s', style, error)
        return {'status': 'error', 'message': 'No se pudo cambiar el aspecto en el iPhone.'}


async def guarded_fresh_stream(server, original, force=False):
    """Evita que el watchdog o peticiones secundarias reinicien el stream durante AOD o pausa de cámara."""
    if getattr(server, '_mirros_media_paused', False):
        raise RuntimeError('Captura multimedia en pausa para liberar cámara y micrófono.')
    if force and getattr(server, '_mirros_display_mode', 'dual') == 'aod':
        server._consecutive_restarts = 0
        with contextlib.suppress(Exception):
            server._last_good_au_t = asyncio.get_running_loop().time()
        return None
    try:
        return await original(server, force=force)
    except Exception as error:
        from pymobiledevice3.remote.core_device.display_service import is_media_in_use_error
        if is_media_in_use_error(error) or getattr(error, 'code', None) == 9022:
            if not getattr(server, '_mirros_media_resuming', False):
                schedule_auto_pause(server)
        raise


def schedule_auto_pause(server):
    """Marca la pausa al instante (detiene el watchdog) y libera DisplayService en segundo plano."""
    if getattr(server, '_mirros_media_paused', False):
        return None
    server._mirros_media_paused = True
    server._mirros_media_pause_reason = 'auto_sensor'
    pending = getattr(server, '_mirros_auto_pause_task', None)
    if pending is not None and not pending.done():
        return pending
    task = asyncio.create_task(set_media_state(server, True, reason='auto_sensor'))
    server._mirros_auto_pause_task = task
    return task


async def trigger_app_switcher(server):
    """Abre el selector de aplicaciones de iOS (multitarea / apps en segundo plano)."""
    try:
        await server._ensure_hid()
        async with server._hid_lock:
            uhs = getattr(server, '_uhs', None)
            if uhs is not None:
                from pymobiledevice3.remote.core_device.hid_service import (
                    TOUCHSCREEN_STATE_CONTACT,
                    TOUCHSCREEN_STATE_RELEASE,
                )
                start_x, start_y = 32768, 64500
                end_y = 38000
                steps = 10
                cur_y = start_y
                try:
                    await uhs.send_touchscreen(TOUCHSCREEN_STATE_CONTACT, start_x, start_y)
                    await asyncio.sleep(0.02)
                    for i in range(1, steps + 1):
                        cur_y = int(start_y + (end_y - start_y) * (i / steps))
                        await uhs.send_touchscreen(TOUCHSCREEN_STATE_CONTACT, start_x, cur_y)
                        await asyncio.sleep(0.015)
                    # Pausa en el centro para que iOS active el App Switcher
                    await asyncio.sleep(0.35)
                finally:
                    await uhs.send_touchscreen(TOUCHSCREEN_STATE_RELEASE, start_x, cur_y)
                return {'status': 'ok', 'method': 'gesture'}

            indigo = getattr(server, '_indigo', None)
            if indigo is not None:
                from pymobiledevice3.remote.core_device.screen_stream import _NAMED_BUTTONS
                from pymobiledevice3.remote.core_device.hid_service import HID_BUTTON_STATE_DOWN, HID_BUTTON_STATE_UP
                usage_page, usage_code, _ = _NAMED_BUTTONS['home']
                await indigo.send_button(usage_page, usage_code, HID_BUTTON_STATE_DOWN)
                await asyncio.sleep(0.05)
                await indigo.send_button(usage_page, usage_code, HID_BUTTON_STATE_UP)
                await asyncio.sleep(0.08)
                await indigo.send_button(usage_page, usage_code, HID_BUTTON_STATE_DOWN)
                await asyncio.sleep(0.05)
                await indigo.send_button(usage_page, usage_code, HID_BUTTON_STATE_UP)
                return {'status': 'ok', 'method': 'double-home'}
            raise RuntimeError('HID no disponible')
    except Exception as error:
        from mirros.diagnostics import record_diagnostic_error
        record_diagnostic_error('app_switcher_failed')
        logging.getLogger(__name__).warning('No se pudo abrir el selector de apps: %s', error)
        return {'status': 'error', 'message': 'No se pudo abrir el selector de aplicaciones.'}


async def list_device_apps(server):
    """Obtiene la lista de aplicaciones instaladas en el iPhone."""
    from pymobiledevice3.services.installation_proxy import InstallationProxyService

    async with InstallationProxyService(server._rsd) as service:
        apps = await service.get_apps(application_type='User')
    result = []
    for bundle_id, data in sorted(
        apps.items(),
        key=lambda x: (x[1].get('CFBundleDisplayName') or x[1].get('CFBundleName') or x[0]).lower(),
    ):
        name = data.get('CFBundleDisplayName') or data.get('CFBundleName') or bundle_id
        version = data.get('CFBundleShortVersionString') or data.get('CFBundleVersion') or ''
        result.append({'bundle_id': bundle_id, 'name': name, 'version': str(version)})
    return result


async def launch_device_app(server, bundle_id: str):
    """Abre una aplicación de usuario en el iPhone mediante CoreDevice."""
    if not isinstance(bundle_id, str) or not bundle_id.strip() or len(bundle_id.strip()) > 255 or any(c.isspace() for c in bundle_id.strip()):
        return {'status': 'error', 'message': 'Identificador de aplicación no válido.'}
    clean_id = bundle_id.strip()
    try:
        if clean_id in SENSOR_BUNDLE_IDS and not getattr(server, '_mirros_media_paused', False):
            await set_media_state(server, True, reason='auto_sensor')
        from pymobiledevice3.remote.core_device.app_service import AppServiceService
        async with AppServiceService(server._rsd) as service:
            await service.launch_application(clean_id, kill_existing=False)
        return {
            'status': 'ok',
            'bundle_id': clean_id,
            'media_paused': bool(getattr(server, '_mirros_media_paused', False)),
        }
    except Exception as error:
        from mirros.diagnostics import record_diagnostic_error
        record_diagnostic_error('app_launch_failed')
        logging.getLogger(__name__).warning('No se pudo abrir la aplicación %s: %s', clean_id, error)
        return {'status': 'error', 'message': 'No se pudo abrir la aplicación en el iPhone.'}


async def sensor_activity_loop(server):
    """Detecta en tiempo real la apertura o cierre de Cámara/Micrófono en el iPhone para liberar o reanudar DisplayService."""
    from pymobiledevice3.services.os_trace import OsActivityStreamFlag, OsTraceService

    stream_flags = (
        OsActivityStreamFlag.PAYLOAD
        | OsActivityStreamFlag.INFO
        | OsActivityStreamFlag.DEBUG
    )
    resume_task = None

    async def delayed_resume():
        try:
            await asyncio.sleep(0.85)
            for attempt in range(3):
                if not (getattr(server, '_mirros_media_paused', False)
                        and getattr(server, '_mirros_media_pause_reason', None) == 'auto_sensor'):
                    return
                result = await set_media_state(server, False)
                if result.get('code') != 'media_in_use':
                    return
                await asyncio.sleep(1.5)
        except asyncio.CancelledError:
            return
        except Exception:
            logging.getLogger(__name__).debug('Auto-resume tras cierre de cámara falló', exc_info=True)

    log = logging.getLogger(__name__)
    failures = 0
    try:
        while True:
            sensor_state = None
            try:
                async with OsTraceService(server._rsd) as trace:
                    log.info('Monitor de cámara y micrófono activo')
                    failures = 0
                    async for entry in trace.syslog(stream_flags=stream_flags):
                        state = classify_sensor_log(entry.filename, entry.message)
                        if state is None or state == sensor_state:
                            continue
                        previous, sensor_state = sensor_state, state
                        if state == 'hot':
                            # Solo en la transición: si el usuario reanuda a mano con la cámara abierta, no se le contradice.
                            if resume_task is not None and not resume_task.done():
                                resume_task.cancel()
                                resume_task = None
                            if not getattr(server, '_mirros_media_paused', False):
                                log.info('Cámara o micrófono en uso en el iPhone: pausando captura')
                                await set_media_state(server, True, reason='auto_sensor')
                        elif previous == 'hot' and (
                            getattr(server, '_mirros_media_paused', False)
                            and getattr(server, '_mirros_media_pause_reason', None) == 'auto_sensor'
                        ):
                            if resume_task is None or resume_task.done():
                                log.info('Cámara o micrófono liberados en el iPhone: reanudando captura')
                                resume_task = asyncio.create_task(delayed_resume())
            except asyncio.CancelledError:
                raise
            except Exception as error:
                failures += 1
                (log.warning if failures == 1 else log.debug)(
                    'Monitor de cámara y micrófono no disponible (%s); reintentando', type(error).__name__,
                )
                await asyncio.sleep(min(2.0 * failures, 15.0))
    except asyncio.CancelledError:
        if resume_task is not None and not resume_task.done():
            resume_task.cancel()
        return


def _png_to_jpeg(png_bytes: bytes, quality: int = 75) -> bytes:
    """Convierte un fotograma PNG a JPEG comprimido para acelerar el transporte USB y decodificación."""
    import io
    from PIL import Image
    with Image.open(io.BytesIO(png_bytes)) as img:
        out = io.BytesIO()
        img.convert('RGB').save(out, format='JPEG', quality=quality)
        return out.getvalue()


async def close_camera_snapshot(server):
    stack = getattr(server, '_mirros_snapshot_stack', None)
    server._mirros_snapshot_stack = None
    server._mirros_snapshot = None
    if stack is not None:
        with contextlib.suppress(Exception):
            await stack.aclose()


async def camera_snapshot(server) -> tuple[bytes, str]:
    """Captura la pantalla por DVT; a diferencia de DisplayService, incluye el visor de la cámara.
    Devuelve (datos_imagen, content_type).
    """
    lock = getattr(server, '_mirros_snapshot_lock', None)
    if lock is None:
        lock = asyncio.Lock()
        server._mirros_snapshot_lock = lock
    async with lock:
        shot = getattr(server, '_mirros_snapshot', None)
        if shot is None:
            from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
            from pymobiledevice3.services.dvt.instruments.screenshot import Screenshot
            stack = contextlib.AsyncExitStack()
            try:
                dvt = await stack.enter_async_context(DvtProvider(server._rsd))
                shot = await stack.enter_async_context(Screenshot(dvt))
            except Exception:
                await stack.aclose()
                raise
            server._mirros_snapshot_stack = stack
            server._mirros_snapshot = shot
        try:
            png_data = await asyncio.wait_for(shot.get_screenshot(), 8)
        except Exception:
            await close_camera_snapshot(server)
            raise

    try:
        jpeg_data = await asyncio.to_thread(_png_to_jpeg, png_data, 75)
        return jpeg_data, 'image/jpeg'
    except Exception:
        return png_data, 'image/png'


MIRROS_ROUTES = frozenset({
    (b'GET', b'/camera-frame'),
    (b'POST', b'/camera-shutter'),
    (b'GET', b'/control'),
    (b'GET', b'/orientation'),
    (b'POST', b'/session/end'),
    (b'GET', b'/frames.bin'),
    (b'GET', b'/health'),
    (b'GET', b'/clipboard/state'),
    (b'GET', b'/display-mode'),
    (b'POST', b'/display-mode'),
    (b'GET', b'/media-state'),
    (b'POST', b'/media-state'),
    (b'GET', b'/style'),
    (b'POST', b'/style'),
    (b'POST', b'/wake'),
    (b'POST', b'/app-switcher'),
    (b'GET', b'/apps'),
    (b'POST', b'/apps/launch'),
    (b'GET', b'/diagnostics'),
})


def write_json(writer, status: bytes, payload):
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    writer.write(
        b'HTTP/1.1 ' + status +
        b'\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: ' +
        str(len(body)).encode() + b'\r\nConnection: close\r\n\r\n' + body
    )


async def orientation_connection(server, reader, writer, original):
    # Upstream consumes all subsequent HID requests on a persistent socket itself.
    # Dispatch them here so the next request can still reach MirrOS-only routes.
    from mirros.diagnostics import record_diagnostic_error
    while True:
        line = await reader.readline()
        request = line.split()[:2]
        video_quality = 'balanced'
        if len(request) == 2 and request[0] == b'GET' and request[1].startswith(b'/frames.bin?'):
            query = parse_qs(urlsplit(request[1].decode('utf-8', errors='ignore')).query, keep_blank_values=True)
            video_quality = query.get('quality', ['balanced'])[0]
            request[1] = b'/frames.bin'
        hid = len(request) == 2 and request[0] == b'POST' and request[1] in (b'/key', b'/touch', b'/button')
        route_key = tuple(request) if len(request) == 2 else ()
        if not hid and route_key not in MIRROS_ROUTES:
            return await original(server, PrefixedReader(line, reader), writer)
        headers = {}
        while True:
            header = await reader.readline()
            if header in (b'\r\n', b''):
                break
            name, _, value = header.decode('latin-1').partition(':')
            headers[name.strip().lower()] = value.strip()
        if not hid:
            break
        refusal = server._refuse_request(headers)
        if refusal is not None:
            writer.write(refusal)
            await writer.drain()
            writer.close()
            return
        body = await server._read_body(reader, headers)
        if request[1] == b'/button' and getattr(server, '_mirros_media_paused', False):
            try:
                bdata = json.loads(body.decode('utf-8'))
                bname = bdata.get('name') if isinstance(bdata, dict) else None
                if bname:
                    asyncio.create_task(press_button_indigo(server, bname))
            except Exception:
                pass
        else:
            server._hid_queue.put_nowait((request[1].decode(), body))
        keep_alive = headers.get('connection', '').lower() != 'close'
        connection = b'keep-alive' if keep_alive else b'close'
        writer.write(b'HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: ' + connection + b'\r\n\r\nok')
        await writer.drain()
        if not keep_alive:
            writer.close()
            return
    refusal = server._refuse_request(headers)
    if refusal is not None:
        writer.write(refusal)
    elif request == [b'GET', b'/control']:
        from mirros.control import serve_control
        return await serve_control(server, reader, writer, headers, release_input)
    elif request == [b'GET', b'/frames.bin']:
        from mirros.video import software_stream, VIDEO_PROFILES
        if video_quality not in VIDEO_PROFILES:
            writer.write(b'HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
            await writer.drain()
            writer.close()
            return
        return await software_stream(server, writer, video_quality)
    elif request == [b'POST', b'/session/end']:
        writer.write(b'HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok')
        task = getattr(server, '_mirros_serve_task', None)
        if task is not None:
            asyncio.get_running_loop().call_later(.1, task.cancel)
    elif request == [b'GET', b'/health']:
        health = session_health(server)
        write_json(writer, b'200 OK' if health['healthy'] else b'503 Service Unavailable', health)
    elif request == [b'GET', b'/clipboard/state']:
        try:
            write_json(writer, b'200 OK', {'revision': await asyncio.wait_for(clipboard_revision(server), 3)})
        except Exception as error:
            record_diagnostic_error('clipboard_unavailable')
            logging.getLogger(__name__).warning('Clipboard state unavailable: %s: %s', type(error).__name__, error)
            write_json(writer, b'503 Service Unavailable', b'{"error":"clipboard_unavailable"}')
    elif request == [b'GET', b'/display-mode']:
        write_json(writer, b'200 OK', get_display_mode(server))
    elif request == [b'POST', b'/display-mode']:
        raw_body = await server._read_body(reader, headers)
        try:
            data = json.loads(raw_body.decode('utf-8'))
            mode = data.get('mode')
        except Exception:
            mode = None
        result = await set_display_mode(server, mode)
        status = b'400 Bad Request' if mode not in ('dual', 'aod') else b'503 Service Unavailable' if result.get('status') == 'error' else b'200 OK'
        write_json(writer, status, result)
    elif request == [b'GET', b'/media-state']:
        write_json(writer, b'200 OK', get_media_state(server))
    elif request == [b'GET', b'/camera-frame']:
        try:
            image_data, content_type = await camera_snapshot(server)
            writer.write(
                b'HTTP/1.1 200 OK\r\nContent-Type: ' + content_type.encode() +
                b'\r\nCache-Control: no-store\r\nContent-Length: ' +
                str(len(image_data)).encode() + b'\r\nConnection: close\r\n\r\n' + image_data
            )
        except Exception as error:
            record_diagnostic_error('camera_frame_failed')
            logging.getLogger(__name__).warning('No se pudo capturar el visor: %s', type(error).__name__)
            write_json(writer, b'503 Service Unavailable', {'status': 'error', 'message': 'No se pudo capturar la pantalla del iPhone.'})
    elif request == [b'POST', b'/camera-shutter']:
        ok = await press_button_indigo(server, 'volume-down')
        write_json(writer, b'200 OK' if ok else b'503 Service Unavailable', {'status': 'ok' if ok else 'error'})
    elif request == [b'POST', b'/media-state']:
        raw_body = await server._read_body(reader, headers)
        try:
            data = json.loads(raw_body.decode('utf-8'))
            paused = data.get('paused') if isinstance(data, dict) else None
            exit_app = bool(data.get('exit_app')) if isinstance(data, dict) else False
        except Exception:
            paused = None
            exit_app = False
        if not isinstance(paused, bool):
            write_json(writer, b'400 Bad Request', {'status': 'error', 'message': 'Estado multimedia no válido.'})
        else:
            result = await set_media_state(server, paused, reason='manual', exit_app=exit_app)
            status = (
                b'409 Conflict' if result.get('code') == 'media_in_use'
                else b'503 Service Unavailable' if result.get('status') == 'error'
                else b'200 OK'
            )
            write_json(writer, status, result)
    elif request == [b'GET', b'/style']:
        try:
            result = await asyncio.wait_for(get_ios_style(server), 5)
            write_json(writer, b'200 OK', result)
        except Exception:
            record_diagnostic_error('style_failed')
            write_json(writer, b'503 Service Unavailable', {'status': 'error', 'message': 'No se pudo consultar el aspecto de iOS.'})
    elif request == [b'POST', b'/style']:
        raw_body = await server._read_body(reader, headers)
        try:
            data = json.loads(raw_body.decode('utf-8'))
            style = data.get('style') if isinstance(data, dict) else None
        except Exception:
            style = None
        if style not in ('light', 'dark'):
            write_json(writer, b'400 Bad Request', {'status': 'error', 'message': 'Aspecto de iOS no válido.'})
        else:
            result = await asyncio.wait_for(set_ios_style(server, style), 5)
            write_json(writer, b'503 Service Unavailable' if result.get('status') == 'error' else b'200 OK', result)
    elif request == [b'POST', b'/wake']:
        result = await wake_device(server)
        write_json(writer, b'503 Service Unavailable' if result.get('status') == 'error' else b'200 OK', result)
    elif request == [b'POST', b'/app-switcher']:
        result = await trigger_app_switcher(server)
        write_json(writer, b'503 Service Unavailable' if result.get('status') == 'error' else b'200 OK', result)
    elif request == [b'GET', b'/apps']:
        try:
            apps = await asyncio.wait_for(list_device_apps(server), 10)
            write_json(writer, b'200 OK', apps)
        except Exception as error:
            record_diagnostic_error('apps_unavailable')
            logging.getLogger(__name__).warning('No se pudo listar aplicaciones: %s', error)
            write_json(writer, b'503 Service Unavailable', b'{"error":"apps_unavailable"}')
    elif request == [b'POST', b'/apps/launch']:
        raw_body = await server._read_body(reader, headers)
        try:
            data = json.loads(raw_body.decode('utf-8'))
            bundle_id = data.get('bundle_id') if isinstance(data, dict) else None
        except Exception:
            bundle_id = None
        valid = isinstance(bundle_id, str) and 0 < len(bundle_id.strip()) <= 255 and not any(c.isspace() for c in bundle_id.strip())
        if not valid:
            write_json(writer, b'400 Bad Request', {'status': 'error', 'message': 'Identificador de aplicación no válido.'})
        else:
            result = await asyncio.wait_for(launch_device_app(server, bundle_id), 10)
            write_json(writer, b'503 Service Unavailable' if result.get('status') == 'error' else b'200 OK', result)
    elif request == [b'GET', b'/diagnostics']:
        from mirros.diagnostics import collect_report
        report = await asyncio.to_thread(collect_report, True)
        write_json(writer, b'200 OK', report)
    else:
        try:
            orientation = await asyncio.wait_for(read_orientation(server), 3)
            write_json(writer, b'200 OK', {'orientation': orientation})
        except Exception:
            record_diagnostic_error('orientation_unavailable')
            write_json(writer, b'503 Service Unavailable', b'{"orientation":null}')
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
    screen_stream.read_pasteboard = read_device_clipboard
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
        from mirros.control import control_lock
        async with control_lock(server):
            return await keyboard_request(server, body, original_key)
    screen_stream.ScreenStreamServer._handle_key = safe_key
    original_touch = screen_stream.ScreenStreamServer._handle_touch
    async def tracked_touch(server, body):
        from mirros.control import control_lock
        async with control_lock(server):
            return await touch_request(server, body, original_touch)
    screen_stream.ScreenStreamServer._handle_touch = tracked_touch
    original_stop = screen_stream.ScreenStreamServer._stop_hid
    async def safe_stop(server):
        lease = getattr(server, '_mirros_keyboard_lease', None)
        if lease is not None and lease is not asyncio.current_task():
            lease.cancel()
        await release_input(server)
        await close_orientation(server)
        await original_stop(server)
    screen_stream.ScreenStreamServer._stop_hid = safe_stop
    original_fresh_stream = getattr(screen_stream.ScreenStreamServer, '_ensure_fresh_stream', None)
    if callable(original_fresh_stream):
        async def safe_fresh_stream(server, force=False):
            return await guarded_fresh_stream(server, original_fresh_stream, force=force)
        screen_stream.ScreenStreamServer._ensure_fresh_stream = safe_fresh_stream
    original_audio_stream = getattr(screen_stream.ScreenStreamServer, '_ensure_audio_stream', None)
    if callable(original_audio_stream):
        async def safe_audio_stream(server):
            if getattr(server, '_mirros_media_paused', False):
                raise RuntimeError('Audio en pausa para liberar cámara y micrófono.')
            return await original_audio_stream(server)
        screen_stream.ScreenStreamServer._ensure_audio_stream = safe_audio_stream
    async def controlled_keep_awake(server):
        assertion_timeout = 300
        refresh_interval = 120
        event = getattr(server, '_mirros_keep_awake_event', None)
        if event is None:
            event = asyncio.Event()
            server._mirros_keep_awake_event = event
        try:
            while True:
                if getattr(server, '_mirros_keep_awake', True):
                    try:
                        from pymobiledevice3.services.power_assertion import PowerAssertionService
                        svc = PowerAssertionService(server._rsd)
                        async with svc.create_power_assertion(
                            "PreventUserIdleSystemSleep",
                            "pymobiledevice3.serve-web",
                            assertion_timeout,
                            "MirrOS keeping device awake for screen mirroring",
                        ):
                            pass
                    except Exception:
                        logging.getLogger(__name__).debug("keep-awake renew failed", exc_info=True)
                event.clear()
                try:
                    await asyncio.wait_for(event.wait(), timeout=refresh_interval)
                except asyncio.TimeoutError:
                    pass
                except asyncio.CancelledError:
                    return
        except asyncio.CancelledError:
            return
        except Exception:
            logging.getLogger(__name__).warning("keep-awake loop crashed", exc_info=True)
    screen_stream.ScreenStreamServer._keep_awake_loop = controlled_keep_awake
    original_serve = screen_stream.ScreenStreamServer.serve
    async def cancellable_serve(server):
        server._mirros_started = asyncio.get_running_loop().time()
        server._mirros_serve_task = asyncio.current_task()
        sensor_task = asyncio.create_task(sensor_activity_loop(server))
        server._mirros_sensor_task = sensor_task
        try:
            return await original_serve(server)
        finally:
            sensor_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await sensor_task
    screen_stream.ScreenStreamServer.serve = cancellable_serve
    screen_stream._mirros_configured = True
