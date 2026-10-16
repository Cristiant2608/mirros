"""AAC-ELD de Apple -> s16le estéreo de 48 kHz usando libavcodec."""
import av
import logging


class AACELDDecoder:
    def __init__(self, magic_cookie: bytes = bytes.fromhex('f8e64000')):
        # AudioToolbox fija 480 muestras fuera del cookie. FFmpeg requiere el
        # frameLengthFlag de ELDSpecificConfig y sample_rate explícitos; omitirlos
        # produce errores de bandas o cuadros inválidos con el audio real de iOS.
        if magic_cookie == bytes.fromhex('f8e64000'):
            magic_cookie = bytes.fromhex('f8e65000')
        self.decoder = av.CodecContext.create('aac', 'r')
        self.decoder.extradata = magic_cookie
        self.decoder.sample_rate = 48000
        self.decoder.layout = 'stereo'
        self.decoder.open()
        self.resampler = av.AudioResampler(format='s16', layout='stereo', rate=48000)
        self.reported = False

    def decode(self, access_unit: bytes) -> bytes:
        result = []
        for frame in self.decoder.decode(av.Packet(access_unit)):
            for pcm in self.resampler.resample(frame):
                result.append(bytes(pcm.planes[0])[:pcm.samples * 4])
                if not self.reported:
                    logging.getLogger(__name__).info('Audio listo: %d muestras, 48 kHz, estéreo', pcm.samples)
                    self.reported = True
        return b''.join(result)


# Compatibility for callers of the first Windows implementation.
WindowsAACELDDecoder = AACELDDecoder
