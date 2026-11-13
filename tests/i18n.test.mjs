import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const rawSource = await fs.readFile(new URL('../frontend/src/i18n.js', import.meta.url), 'utf8');
const testableSource = rawSource.replace(
  "import {useState, useEffect} from 'react';",
  'function useState(init) { return [typeof init === "function" ? init() : init, () => {}]; }\nfunction useEffect() {}',
);
const {STRINGS, translateBackendText} = await import(
  `data:text/javascript;base64,${Buffer.from(testableSource, 'utf8').toString('base64')}`
);

function collectShape(obj, prefix = '') {
  const entries = [];
  for (const [key, val] of Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      entries.push(...collectShape(val, path));
    } else {
      entries.push([path, Array.isArray(val) ? 'array' : typeof val]);
    }
  }
  return entries;
}

test('STRINGS.en and STRINGS.es have identical keys and value shapes', () => {
  assert.deepEqual(collectShape(STRINGS.en), collectShape(STRINGS.es));
});

test('translateBackendText translates runtime messages bidirectionally between EN and ES', () => {
  assert.equal(translateBackendText('Connect your iPhone via USB', 'es'), 'Conecta tu iPhone por USB');
  assert.equal(translateBackendText('Conecta tu iPhone por USB', 'en'), 'Connect your iPhone via USB');
  assert.equal(translateBackendText('You are on version 1.3.0.', 'es'), 'Tienes la versión 1.3.0.');
  assert.equal(translateBackendText('Tienes la versión 1.3.0.', 'en'), 'You are on version 1.3.0.');
  assert.equal(translateBackendText('MirrOS 1.4.0 is available.', 'es'), 'MirrOS 1.4.0 está disponible.');
  assert.equal(translateBackendText('Download checksum verification failed. Update will not be installed.', 'es'), 'La verificación de la descarga falló. No se instalará.');
  assert.equal(translateBackendText('Copied to PC clipboard.', 'es'), 'Copiado del iPhone al portapapeles del PC.');
  assert.equal(translateBackendText('Unlock your iPhone and tap "Trust" to continue.', 'es'), 'Desbloquea el iPhone y pulsa «Confiar» en la pantalla del teléfono.');
});
