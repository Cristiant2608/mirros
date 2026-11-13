// Device actions must confirm both transport and backend success before UI changes.
async function deviceRequest(fetchRequest, port, route, body) {
  if (!port) throw new Error('Connect your iPhone first.');
  const response = await fetchRequest(`http://127.0.0.1:${port}${route}`, {
    method:'POST', signal:AbortSignal.timeout(4000),
    ...(body === undefined ? {} : {headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}),
  });
  if (!response.ok) throw new Error(`The iPhone could not complete the action (HTTP ${response.status}).`);
  const result = await response.json();
  if (result.status === 'error') throw new Error('The iPhone could not complete the action. Check your connection.');
  return result;
}
module.exports = {deviceRequest};
