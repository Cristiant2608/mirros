import re
import struct
import unittest
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
import av
from mirros.video import SoftwareDecoder
from pymobiledevice3.remote.core_device.screen_stream import hevc_decoder_configuration_record


def hevc_fixture(width=320, height=640):
    encoder = av.CodecContext.create('libx265', 'w')
    encoder.width, encoder.height, encoder.pix_fmt = width, height, 'yuv420p'
    encoder.options = {'preset':'ultrafast', 'tune':'zerolatency', 'x265-params':'log-level=error:bframes=0:repeat-headers=1'}
    frame = av.VideoFrame(width, height, 'yuv420p')
    for plane in frame.planes:
        plane.update(bytes([128]) * plane.buffer_size)
    packets = [*encoder.encode(frame), *encoder.encode(None)]
    data = b''.join(bytes(packet) for packet in packets)
    nals = [nal for nal in re.split(b'\x00\x00\x00\x01|\x00\x00\x01', data) if nal]
    parameters = {(nal[0] >> 1) & 63:nal for nal in nals}
    description = hevc_decoder_configuration_record(parameters[32], parameters[33], parameters[34])
    return description, nals


class SoftwareVideoTests(unittest.TestCase):
    def test_profiles_preserve_full_aspect_ratio_and_limit_output_size(self):
        description, nals = hevc_fixture(1280, 2560)
        packet = b''.join(struct.pack('>I', len(nal)) + nal for nal in nals)
        for quality, expected in [('economy', (480, 960)), ('balanced', (784, 1568)), ('detail', (1080, 2160))]:
            with self.subTest(quality=quality):
                jpeg = SoftwareDecoder(description, quality).decode(packet)
                frame = av.CodecContext.create('mjpeg', 'r').decode(av.Packet(jpeg))[0]
                self.assertEqual((frame.width, frame.height), expected)

    def test_profile_throttles_jpeg_output_without_skipping_hevc_decode(self):
        description, nals = hevc_fixture()
        packet = b''.join(struct.pack('>I', len(nal)) + nal for nal in nals)
        decoder = SoftwareDecoder(description, 'economy')
        with patch('mirros.video.time.monotonic', side_effect=[100, 100, 100.01, 100.06, 100.06]):
            self.assertIsNotNone(decoder.decode(packet))
            self.assertIsNone(decoder.decode(packet))
            self.assertIsNotNone(decoder.decode(packet))

    def test_real_hevc_packet_decodes_to_complete_jpeg_without_browser_hevc(self):
        description, nals = hevc_fixture()
        decoder = SoftwareDecoder(description)
        jpeg = decoder.decode(b''.join(struct.pack('>I',len(nal))+nal for nal in nals))
        self.assertIsNotNone(jpeg)
        image = av.CodecContext.create('mjpeg','r').decode(av.Packet(jpeg))[0]
        self.assertEqual((image.width, image.height),(320,640))


class SoftwareStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_profile_query_reaches_decoder_and_invalid_profiles_are_rejected(self):
        from mirros.adapter import orientation_connection
        for quality in ['economy', 'balanced', 'detail', 'invalid']:
            with self.subTest(quality=quality):
                reader = asyncio.StreamReader()
                reader.feed_data(f'GET /frames.bin?quality={quality} HTTP/1.1\r\nHost: localhost\r\n\r\n'.encode())
                reader.feed_eof()
                writer = SimpleNamespace(write=Mock(), drain=AsyncMock(), close=Mock())
                server = SimpleNamespace(_refuse_request=Mock(return_value=None))
                with patch('mirros.video.software_stream', new_callable=AsyncMock) as stream:
                    await orientation_connection(server, reader, writer, AsyncMock())
                    if quality == 'invalid':
                        stream.assert_not_awaited()
                        self.assertIn(b'400 Bad Request', writer.write.call_args.args[0])
                    else:
                        stream.assert_awaited_once_with(server, writer, quality)

    async def test_http_stream_emits_real_jpeg_and_unregisters_on_disconnect(self):
        from mirros.video import software_stream
        _, nals = hevc_fixture()
        parameters = {(nal[0] >> 1) & 63:nal for nal in nals}
        payload = b''.join(struct.pack('>I',len(nal))+nal for nal in nals)
        message = struct.pack('>I',len(payload)+1)+b'\x00'+payload
        server = SimpleNamespace(_ensure_fresh_stream=AsyncMock(),_init_sequence=message,_vps_nal=parameters[32],_sps_nal=parameters[33],_pps_nal=parameters[34],_subscribers={},_pli_tasks=set(),_request_recovery_idr=Mock())
        writes=[]
        async def drain():
            if len(writes)>1:
                raise ConnectionResetError('viewer disconnected')
        writer=SimpleNamespace(write=writes.append,drain=drain,close=Mock())
        await asyncio.wait_for(software_stream(server,writer),3)
        self.assertIn(b'200 OK',writes[0])
        _,packet,_=writes[1].split(b'\r\n',2)
        size=struct.unpack_from('>I',packet)[0]
        self.assertEqual(size,len(packet)-4)
        self.assertTrue(packet[4:].startswith(b'\xff\xd8'))
        self.assertEqual(server._subscribers,{})
        writer.close.assert_called_once()
