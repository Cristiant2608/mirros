// HEVC hvcC -> dimensions from SPS, before Windows creates its decoder surface.
// Without these hints, Edge can choose a 1280x720 visibleRect for a portrait stream.
function iosScrcpyHevcDimensions(description) {
    const bytes = new Uint8Array(description);
    if (bytes.length < 23 || bytes[0] !== 1) throw new Error('Invalid HEVC configuration');
    let offset = 23;
    for (let array = 0; array < bytes[22]; array++) {
        if (offset + 3 > bytes.length) throw new Error('Truncated HEVC array');
        const type = bytes[offset++] & 63;
        const count = (bytes[offset++] << 8) | bytes[offset++];
        for (let unit = 0; unit < count; unit++) {
            if (offset + 2 > bytes.length) throw new Error('Truncated HEVC NAL length');
            const size = (bytes[offset++] << 8) | bytes[offset++];
            if (offset + size > bytes.length) throw new Error('Truncated HEVC NAL');
            const nal = bytes.subarray(offset, offset + size);
            offset += size;
            if (type !== 33) continue;
            const rbsp = [];
            for (let i = 2; i < nal.length; i++) {
                if (i >= 4 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) continue;
                rbsp.push(nal[i]);
            }
            let bit = 0;
            function read(count) {
                if (bit + count > rbsp.length * 8) throw new Error('Truncated HEVC SPS');
                let value = 0;
                for (let i = 0; i < count; i++, bit++) value = value * 2 + ((rbsp[bit >> 3] >> (7 - (bit & 7))) & 1);
                return value;
            }
            function ue() {
                let zeros = 0;
                while (read(1) === 0) if (++zeros > 30) throw new Error('Invalid HEVC Exp-Golomb');
                return 2 ** zeros - 1 + read(zeros);
            }
            read(4);
            const layers = read(3);
            read(1);
            read(96); // general profile_tier_level
            const profiles = [], levels = [];
            for (let i = 0; i < layers; i++) { profiles.push(read(1)); levels.push(read(1)); }
            if (layers) read((8 - layers) * 2);
            for (let i = 0; i < layers; i++) {
                if (profiles[i]) read(88);
                if (levels[i]) read(8);
            }
            ue(); // sps_seq_parameter_set_id
            const chroma = ue();
            if (chroma > 3) throw new Error('Invalid HEVC chroma format');
            const separate = chroma === 3 ? read(1) : 0;
            const codedWidth = ue(), codedHeight = ue();
            let left = 0, right = 0, top = 0, bottom = 0;
            if (read(1)) { left = ue(); right = ue(); top = ue(); bottom = ue(); }
            const subWidth = !separate && (chroma === 1 || chroma === 2) ? 2 : 1;
            const subHeight = !separate && chroma === 1 ? 2 : 1;
            const displayAspectWidth = codedWidth - (left + right) * subWidth;
            const displayAspectHeight = codedHeight - (top + bottom) * subHeight;
            if (Math.min(codedWidth, codedHeight, displayAspectWidth, displayAspectHeight) <= 0 ||
                Math.max(codedWidth, codedHeight) > 32768) throw new Error('Invalid HEVC dimensions');
            return {codedWidth, codedHeight, displayAspectWidth, displayAspectHeight};
        }
    }
    throw new Error('HEVC configuration has no SPS');
}
