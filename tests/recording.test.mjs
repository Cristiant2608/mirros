import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  createRecorder,
  formatDuration,
  getBestSupportedMimeType,
  PREFERRED_MIME_TYPES,
} from '../frontend/src/recorder.mjs';
import {saveRecording} from '../desktop/recording.cjs';
import {saveRecording as saveRecordingFromCapture} from '../desktop/capture.cjs';

test('formatDuration formats seconds to mm:ss correctly', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(5), '00:05');
  assert.equal(formatDuration(9), '00:09');
  assert.equal(formatDuration(10), '00:10');
  assert.equal(formatDuration(59), '00:59');
  assert.equal(formatDuration(60), '01:00');
  assert.equal(formatDuration(83), '01:23');
  assert.equal(formatDuration(605), '10:05');
  assert.equal(formatDuration(3599), '59:59');
  assert.equal(formatDuration(3600), '60:00');
  assert.equal(formatDuration(3661), '61:01');

  // Edge cases: null, undefined, negative, non-numbers
  assert.equal(formatDuration(-10), '00:00');
  assert.equal(formatDuration(null), '00:00');
  assert.equal(formatDuration(undefined), '00:00');
  assert.equal(formatDuration(NaN), '00:00');
  assert.equal(formatDuration('45'), '00:45');
});

test('MIME type selection respects priority order and falls back cleanly', () => {
  assert.deepEqual(PREFERRED_MIME_TYPES, [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]);

  // When all are supported, selects VP9
  const allSupported = () => true;
  assert.equal(getBestSupportedMimeType(allSupported), 'video/webm;codecs=vp9,opus');

  // When VP9 is not supported, selects VP8
  const vp8Supported = type => type.includes('vp8');
  assert.equal(getBestSupportedMimeType(vp8Supported), 'video/webm;codecs=vp8,opus');

  // When only basic webm is supported
  const basicWebm = type => type === 'video/webm';
  assert.equal(getBestSupportedMimeType(basicWebm), 'video/webm');

  // When only mp4 is supported
  const onlyMp4 = type => type === 'video/mp4';
  assert.equal(getBestSupportedMimeType(onlyMp4), 'video/mp4');

  // When none are supported or tester is null, falls back to video/webm
  const noneSupported = () => false;
  assert.equal(getBestSupportedMimeType(noneSupported), 'video/webm');
  assert.equal(getBestSupportedMimeType(null), 'video/webm');
  assert.equal(getBestSupportedMimeType(undefined), 'video/webm');
});

test('createRecorder validates canvas and combines video and audio tracks', () => {
  // Invalid canvas
  assert.throws(() => createRecorder({canvas: null}), /Canvas no válido/);
  assert.throws(() => createRecorder({canvas: {}}), /Canvas no válido/);

  // Missing MediaRecorder
  const validCanvas = {
    captureStream: fps => {
      assert.equal(fps, 60);
      return {
        getVideoTracks: () => [{id: 'video-1'}],
      };
    },
  };
  assert.throws(() => createRecorder({canvas: validCanvas, MediaRecorderClass: null}), /MediaRecorder no disponible/);

  // Combines tracks properly
  let capturedCombined = null;
  class MockMediaStream {
    constructor(tracks) {
      capturedCombined = tracks;
    }
    getTracks() {
      return capturedCombined || [];
    }
  }

  class DummyRecorder {
    constructor(stream) {
      this.stream = stream;
      this.state = 'inactive';
    }
    start() {
      this.state = 'recording';
    }
  }

  const vTrack = {id: 'v1', stop: () => {}};
  const aTrack = {id: 'a1', stop: () => {}};
  const mockCanvas = {
    captureStream: () => ({getVideoTracks: () => [vTrack]}),
  };
  const mockAudioStream = {
    getAudioTracks: () => [aTrack],
  };

  createRecorder({
    canvas: mockCanvas,
    audioStream: mockAudioStream,
    MediaRecorderClass: DummyRecorder,
    MediaStreamClass: MockMediaStream,
  });

  assert.deepEqual(capturedCombined, [vTrack, aTrack]);
});

test('createRecorder manages chunk collection, timer ticks, and stops all tracks', async () => {
  const stoppedTracks = [];
  const vTrack = {id: 'v1', stop: () => stoppedTracks.push('v1')};
  const aTrack = {id: 'a1', stop: () => stoppedTracks.push('a1')};

  class MockStream {
    constructor(tracks) {
      this.tracks = tracks;
    }
    getTracks() {
      return this.tracks;
    }
  }

  let recorderInstance = null;
  class MockRecorder {
    static isTypeSupported(type) {
      return type.includes('vp9');
    }
    constructor(stream, options) {
      recorderInstance = this;
      this.stream = stream;
      this.options = options;
      this.state = 'inactive';
      this.mimeType = options?.mimeType || 'video/webm;codecs=vp9,opus';
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      if (this.ondataavailable) {
        this.ondataavailable({data: {size: 100, byteLength: 100, name: 'chunk-2'}});
      }
      if (this.onstop) {
        this.onstop();
      }
    }
  }

  const states = [];
  const ticks = [];
  const mockCanvas = {
    captureStream: () => ({getVideoTracks: () => [vTrack]}),
  };
  const mockAudioStream = {
    getAudioTracks: () => [aTrack],
  };

  const recorder = createRecorder({
    canvas: mockCanvas,
    audioStream: mockAudioStream,
    onTick: sec => ticks.push(sec),
    onStateChange: state => states.push(state),
    MediaRecorderClass: MockRecorder,
    MediaStreamClass: MockStream,
  });

  assert.equal(recorder.isRecording(), true);
  assert.ok(states.includes('recording'));

  // Feed a chunk during recording
  recorderInstance.ondataavailable({data: {size: 50, byteLength: 50, name: 'chunk-1'}});

  // Stop recording
  const result = await recorder.stop();

  assert.equal(recorder.isRecording(), false);
  assert.equal(result.mimeType, 'video/webm;codecs=vp9,opus');
  assert.equal(result.extension, 'webm');
  assert.ok(typeof result.duration === 'number');
  assert.ok(result.blob);

  // Tracks were stopped
  assert.deepEqual(stoppedTracks, ['v1', 'a1']);
});

test('saveRecording rejects invalid payloads before opening dialog', async () => {
  let dialogCount = 0;
  const deps = {
    dialog: {
      showSaveDialog: async () => {
        dialogCount++;
        return {canceled: false, filePath: 'test.webm'};
      },
    },
    writeFile: async () => {},
  };

  for (const invalid of [null, undefined, {}, {bytes: null}, {bytes: 'not-bytes'}, {bytes: new Uint8Array(0)}, {bytes: []}]) {
    await assert.rejects(saveRecording(deps, invalid), /Grabación no válida/);
    await assert.rejects(saveRecordingFromCapture(deps, invalid), /Grabación no válida/);
  }

  assert.equal(dialogCount, 0, 'Save dialog must never be opened for invalid data');
});

test('saveRecording returns false when dialog is canceled and does not write file', async () => {
  let writeCount = 0;
  const depsCanceled = {
    dialog: {
      showSaveDialog: async () => ({canceled: true}),
    },
    writeFile: async () => {
      writeCount++;
    },
  };

  const payload = {bytes: new Uint8Array([1, 2, 3, 4]), extension: 'webm'};
  const res1 = await saveRecording(depsCanceled, payload);
  assert.equal(res1, false);

  const depsNoPath = {
    dialog: {
      showSaveDialog: async () => ({canceled: false, filePath: ''}),
    },
    writeFile: async () => {
      writeCount++;
    },
  };
  const res2 = await saveRecording(depsNoPath, payload);
  assert.equal(res2, false);
  assert.equal(writeCount, 0);
});

test('saveRecording successfully saves WebM and MP4 recordings with appropriate filters', async () => {
  let savedFiles = [];
  let dialogOptionsSeen = [];

  const deps = {
    dialog: {
      showSaveDialog: async (_win, options) => {
        dialogOptionsSeen.push(options);
        return {canceled: false, filePath: options.defaultPath};
      },
    },
    writeFile: async (filePath, bytes) => {
      savedFiles.push({filePath, bytes});
    },
  };

  // WebM save
  const webmBytes = new Uint8Array([10, 20, 30, 40]);
  const resWebm = await saveRecording(deps, {bytes: webmBytes, extension: 'webm'});
  assert.equal(resWebm, true);
  assert.equal(dialogOptionsSeen[0].defaultPath, 'Mirros-Grabacion.webm');
  assert.equal(dialogOptionsSeen[0].filters[0].extensions[0], 'webm');
  assert.deepEqual(savedFiles[0].bytes, Buffer.from(webmBytes));

  // MP4 save
  const mp4Bytes = new Uint8Array([50, 60, 70, 80]);
  const resMp4 = await saveRecording(deps, {bytes: mp4Bytes, extension: 'mp4'});
  assert.equal(resMp4, true);
  assert.equal(dialogOptionsSeen[1].defaultPath, 'Mirros-Grabacion.mp4');
  assert.equal(dialogOptionsSeen[1].filters[0].extensions[0], 'mp4');
  assert.deepEqual(savedFiles[1].bytes, Buffer.from(mp4Bytes));
});

test('desktop main.cjs imports saveRecording and registers ipcMain action', async () => {
  const mainSrc = await fs.readFile(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
  assert.ok(mainSrc.includes("const {saveRecording} = require('./recording.cjs');"), 'main.cjs must import saveRecording from recording.cjs');
  assert.ok(mainSrc.includes("case 'saveRecording': return saveRecording({dialog, window}, value);"), "main.cjs must register case 'saveRecording'");
});
