const fs = require('node:fs/promises');
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
async function saveCapture({dialog, window, writeFile = fs.writeFile}, value) {
  if (!(value instanceof Uint8Array) || value.byteLength > 64 * 1024 * 1024) throw new Error('Captura no válida.');
  const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (!bytes.subarray(0, 8).equals(signature)) throw new Error('Captura no válida.');
  const {canceled, filePath} = await dialog.showSaveDialog(window, {
    title: 'Guardar captura', defaultPath: 'Mirros.png', filters: [{name: 'Imagen PNG', extensions: ['png']}],
  });
  if (canceled || !filePath) return false;
  await writeFile(filePath, bytes);
  return true;
}
module.exports = {saveCapture};
