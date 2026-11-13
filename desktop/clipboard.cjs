// Only explicit transfers read or write the system clipboard.
const TEXT_LIMIT = 1024 * 1024;
const IMAGE_LIMIT = 16 * 1024 * 1024;
function checkedText(text) {
  if (Buffer.byteLength(text) > TEXT_LIMIT) throw new Error('Text exceeds 1 MB.');
  return text;
}
function checkedImage(data) {
  if (data.length > IMAGE_LIMIT) throw new Error('Image exceeds 16 MB.');
  return data;
}
async function shareClipboard({clipboard, ClipboardItem, nativeImage, fetch, backendPort}, direction) {
  if (!backendPort) throw new Error('Connect your iPhone first.');
  const endpoint = `http://127.0.0.1:${backendPort}/clipboard`;
  const request = async (url, options = {}) => {
    // iOS can spend ~64s materializing rich clipboard representations from Notes.
    const timeout = url === endpoint && !options.method ? 100000 : 12000;
    let response;
    try { response = await fetch(url, {...options, signal:AbortSignal.timeout(timeout)}); }
    catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('The iPhone took too long to prepare the clipboard. Copy again; for images, try from Photos.');
      throw error;
    }
    if (!response.ok) throw new Error(`Could not share clipboard (HTTP ${response.status}). Keep your iPhone unlocked.`);
    return response;
  };
  if (direction === 'toPhone') {
    const items = await clipboard.read();
    const imageItem = items.find(item => item.types.some(type => type.startsWith('image/')));
    if (imageItem) {
      const type = imageItem.types.includes('image/png') ? 'image/png' : imageItem.types.find(type => type.startsWith('image/'));
      const blob = await imageItem.getType(type);
      if (blob.size > IMAGE_LIMIT) throw new Error('Image exceeds 16 MB.');
      const image = nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer()));
      if (image.isEmpty()) throw new Error('Unsupported image format.');
      const png = checkedImage(image.toPNG());
      await request(endpoint + '/image', {method:'POST', headers:{'Content-Type':'image/png'}, body:png});
    } else {
      const item = items.find(item => item.types.includes('text/plain'));
      const text = checkedText(item ? await (await item.getType('text/plain')).text() : await clipboard.readText());
      if (!text) throw new Error('Copy text or an image on your PC first.');
      await request(endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text})});
    }
    return 'Copied to iPhone. You can paste it there now.';
  }
  if (direction === 'toPC') {
    const content = await (await request(endpoint)).json();
    if (content.image) {
      if (content.image.size > IMAGE_LIMIT) throw new Error('Image exceeds 16 MB.');
      const data = checkedImage(Buffer.from(await (await request(endpoint + '/image')).arrayBuffer()));
      const image = nativeImage.createFromBuffer(data);
      if (image.isEmpty()) throw new Error('Unsupported image format.');
      const png = checkedImage(image.toPNG());
      const types = {'image/png':new Blob([png], {type:'image/png'})};
      if (typeof content.text === 'string') types['text/plain'] = new Blob([checkedText(content.text)], {type:'text/plain'});
      await clipboard.write([new ClipboardItem(types)]);
    } else if (typeof content.text === 'string') {
      await clipboard.writeText(checkedText(content.text));
    } else throw new Error('Copy text or an image on your iPhone first.');
    return 'Copied to PC. You can paste it here now.';
  }
  throw new Error('Invalid clipboard direction.');
}
async function clipboardShortcut(deps, action, {pause = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
  if (!deps.backendPort) throw new Error('Connect your iPhone first.');
  if (!['copy', 'paste'].includes(action)) throw new Error('Invalid shortcut.');
  const base = `http://127.0.0.1:${deps.backendPort}`;
  const request = async (route, options = {}) => {
    const response = await deps.fetch(base + route, {...options, signal:AbortSignal.timeout(4000)});
    if (!response.ok) throw new Error(`Could not complete shortcut (${route}, HTTP ${response.status}). Check your connection and unlock your iPhone.`);
    return response;
  };
  const revision = async () => {
    const content = await (await request('/clipboard/state')).json();
    if (typeof content.revision !== 'string') throw new Error('Could not query the iPhone clipboard.');
    return content.revision;
  };
  const keys = usages => request('/key', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({usages})});
  const press = async usage => {
    // iOS must observe Command before the letter, including on a newly attached
    // virtual keyboard. A single bitmap can otherwise insert a literal c/v.
    try {await keys([227]); await pause(100); await keys([227, usage]); await pause(100); await keys([227]);}
    finally {await keys([]);}
  };
  if (action === 'paste') {
    await shareClipboard(deps, 'toPhone');
    await press(25); // iOS Command+V, independent of the PC modifier.
    return 'Pasted on iPhone.';
  }
  const before = await revision();
  await press(6); // iOS Command+C.
  for (let attempt = 0; attempt < 15; attempt++) {
    await pause(100);
    if (await revision() !== before) {
      await shareClipboard(deps, 'toPC');
      return 'Copied. You can paste on your PC with Ctrl+V.';
    }
  }
  // Copying the same selection again need not increment iOS changeCount. Also
  // allow bringing content already copied using the phone's own Copy menu.
  await shareClipboard(deps, 'toPC');
  return 'iPhone clipboard copied. You can paste on your PC with Ctrl+V.';
}
module.exports = {shareClipboard, clipboardShortcut};
