// Only explicit transfers read or write the system clipboard.
const TEXT_LIMIT = 1024 * 1024;
const IMAGE_LIMIT = 16 * 1024 * 1024;
function checkedText(text) {
  if (Buffer.byteLength(text) > TEXT_LIMIT) throw new Error('El texto supera 1 MB.');
  return text;
}
function checkedImage(data) {
  if (data.length > IMAGE_LIMIT) throw new Error('La imagen supera 16 MB.');
  return data;
}
async function shareClipboard({clipboard, ClipboardItem, nativeImage, fetch, backendPort}, direction) {
  if (!backendPort) throw new Error('Conecta el iPhone primero.');
  const endpoint = `http://127.0.0.1:${backendPort}/clipboard`;
  const request = async (url, options = {}) => {
    const response = await fetch(url, {...options, signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error(`No se pudo compartir el portapapeles (HTTP ${response.status}). Mantén el iPhone desbloqueado.`);
    return response;
  };
  if (direction === 'toPhone') {
    const items = await clipboard.read();
    const imageItem = items.find(item => item.types.some(type => type.startsWith('image/')));
    if (imageItem) {
      const type = imageItem.types.includes('image/png') ? 'image/png' : imageItem.types.find(type => type.startsWith('image/'));
      const blob = await imageItem.getType(type);
      if (blob.size > IMAGE_LIMIT) throw new Error('La imagen supera 16 MB.');
      const image = nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer()));
      if (image.isEmpty()) throw new Error('El formato de imagen no es compatible.');
      const png = checkedImage(image.toPNG());
      await request(endpoint + '/image', {method:'POST', headers:{'Content-Type':'image/png'}, body:png});
    } else {
      const item = items.find(item => item.types.includes('text/plain'));
      const text = checkedText(item ? await (await item.getType('text/plain')).text() : await clipboard.readText());
      if (!text) throw new Error('Copia un texto o una imagen en el PC primero.');
      await request(endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text})});
    }
    return 'Copiado al iPhone. Ya puedes pegarlo allí.';
  }
  if (direction === 'toPC') {
    const content = await (await request(endpoint)).json();
    if (content.image) {
      if (content.image.size > IMAGE_LIMIT) throw new Error('La imagen supera 16 MB.');
      const data = checkedImage(Buffer.from(await (await request(endpoint + '/image')).arrayBuffer()));
      const image = nativeImage.createFromBuffer(data);
      if (image.isEmpty()) throw new Error('El formato de imagen no es compatible.');
      const png = checkedImage(image.toPNG());
      const types = {'image/png':new Blob([png], {type:'image/png'})};
      if (typeof content.text === 'string') types['text/plain'] = new Blob([checkedText(content.text)], {type:'text/plain'});
      await clipboard.write([new ClipboardItem(types)]);
    } else if (typeof content.text === 'string') {
      await clipboard.writeText(checkedText(content.text));
    } else throw new Error('Copia un texto o una imagen en el iPhone primero.');
    return 'Copiado al PC. Ya puedes pegarlo aquí.';
  }
  throw new Error('Dirección de portapapeles no válida.');
}
module.exports = {shareClipboard};
