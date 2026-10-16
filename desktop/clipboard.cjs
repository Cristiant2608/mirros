// Transferencias explícitas: no se lee el portapapeles en segundo plano.
async function shareClipboard({clipboard, nativeImage, fetch, backendPort}, value) {
        if (!backendPort) throw new Error('Conecta el iPhone primero.');
        const endpoint = `http://127.0.0.1:${backendPort}/clipboard`;
        const request = async (url, options = {}) => {
          const response = await fetch(url, {...options, signal: AbortSignal.timeout(12000)});
          if (!response.ok) throw new Error('No se pudo compartir el portapapeles. Mantén el iPhone desbloqueado.');
          return response;
        };
        if (value === 'toPhone') {
          const image = clipboard.readImage();
          if (!image.isEmpty()) {
            const png = image.toPNG();
            if (png.length > 16 * 1024 * 1024) throw new Error('La imagen supera 16 MB.');
            await request(endpoint + '/image', {method: 'POST', headers: {'Content-Type': 'image/png'}, body: png});
          } else {
            const text = clipboard.readText();
            if (!text) throw new Error('Copia un texto o una imagen en el PC primero.');
            if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('El texto supera 1 MB.');
            await request(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text})});
          }
          return 'Copiado al iPhone. Ya puedes pegarlo allí.';
        }
        if (value === 'toPC') {
          const content = await (await request(endpoint)).json();
          if (content.image) {
            if (content.image.size > 16 * 1024 * 1024) throw new Error('La imagen supera 16 MB.');
            const data = Buffer.from(await (await request(endpoint + '/image')).arrayBuffer());
            if (data.length > 16 * 1024 * 1024) throw new Error('La imagen supera 16 MB.');
            const image = nativeImage.createFromBuffer(data);
            if (image.isEmpty()) throw new Error('El formato de imagen no es compatible.');
            clipboard.write({image, ...(typeof content.text === 'string' ? {text: content.text} : {})});
          } else if (typeof content.text === 'string') clipboard.writeText(content.text);
          else throw new Error('Copia un texto o una imagen en el iPhone primero.');
          return 'Copiado al PC. Ya puedes pegarlo aquí.';
        }
        throw new Error('Dirección de portapapeles no válida.');
}
module.exports = {shareClipboard};
