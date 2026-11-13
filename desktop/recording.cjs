const fs = require('node:fs/promises');

async function saveRecording({dialog, window, writeFile = fs.writeFile}, payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid recording.');
  const rawBytes = payload.bytes;
  if (!rawBytes || !(rawBytes instanceof Uint8Array) || rawBytes.byteLength === 0) {
    throw new Error('Invalid recording.');
  }
  const bytes = Buffer.from(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
  const ext = typeof payload.extension === 'string' && payload.extension.toLowerCase() === 'mp4' ? 'mp4' : 'webm';
  const defaultPath = `MirrOS-Recording.${ext}`;
  const filters = ext === 'mp4'
    ? [{name: 'MP4 Video', extensions: ['mp4']}, {name: 'All files', extensions: ['*']}]
    : [{name: 'WebM Video', extensions: ['webm']}, {name: 'All files', extensions: ['*']}];

  const {canceled, filePath} = await dialog.showSaveDialog(window, {
    title: 'Save recording',
    defaultPath,
    filters,
  });

  if (canceled || !filePath) return false;
  await writeFile(filePath, bytes);
  return true;
}

module.exports = {saveRecording};
