export async function post(path, data) {
  const response = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data), signal: AbortSignal.timeout(3000)});
  if (!response.ok) throw new Error('No se pudo enviar el gesto. Revisa la conexión.');
}
