import re
import struct
import unittest
import av
from ios_scrcpy.video import SoftwareDecoder
from pymobiledevice3.remote.core_device.screen_stream import hevc_decoder_configuration_record


class SoftwareVideoTests(unittest.TestCase):
    def test_real_hevc_packet_decodes_to_complete_jpeg_without_browser_hevc(self):
        encoder = av.CodecContext.create('libx265', 'w')
        encoder.width, encoder.height, encoder.pix_fmt = 320, 640, 'yuv420p'
        encoder.options = {'preset':'ultrafast', 'tune':'zerolatency', 'x265-params':'log-level=error:bframes=0:repeat-headers=1'}
        frame = av.VideoFrame(320, 640, 'yuv420p')
        for plane in frame.planes:
            plane.update(bytes([128]) * plane.buffer_size)
        packets = [*encoder.encode(frame), *encoder.encode(None)]
        data = b''.join(bytes(packet) for packet in packets)
        nals = [nal for nal in re.split(b'\x00\x00\x00\x01|\x00\x00\x01', data) if nal]
        parameters = {(nal[0] >> 1) & 63:nal for nal in nals}
        description = hevc_decoder_configuration_record(parameters[32], parameters[33], parameters[34])
        decoder = SoftwareDecoder(description)
        jpeg = decoder.decode(b''.join(struct.pack('>I',len(nal))+nal for nal in nals))
        self.assertIsNotNone(jpeg)
        image = av.CodecContext.create('mjpeg','r').decode(av.Packet(jpeg))[0]
        self.assertEqual((image.width, image.height),(320,640))
