const fs = require('node:fs/promises');

async function saveRecording({dialog, window, writeFile = fs.writeFile}, payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Grabación no válida.');
  const rawBytes = payload.bytes;
  if (!rawBytes || !(rawBytes instanceof Uint8Array) || rawBytes.byteLength === 0) {
    throw new Error('Grabación no válida.');
  }
  const bytes = Buffer.from(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
  const ext = typeof payload.extension === 'string' && payload.extension.toLowerCase() === 'mp4' ? 'mp4' : 'webm';
  const defaultPath = `Mirros-Grabacion.${ext}`;
  const filters = ext === 'mp4'
    ? [{name: 'Video MP4', extensions: ['mp4']}, {name: 'Todos los archivos', extensions: ['*']}]
    : [{name: 'Video WebM', extensions: ['webm']}, {name: 'Todos los archivos', extensions: ['*']}];

  const {canceled, filePath} = await dialog.showSaveDialog(window, {
    title: 'Guardar grabación',
    defaultPath,
    filters,
  });

  if (canceled || !filePath) return false;
  await writeFile(filePath, bytes);
  return true;
}

module.exports = {saveRecording};
