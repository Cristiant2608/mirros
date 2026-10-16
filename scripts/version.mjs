// pyproject.toml is the version source; no Python installation is needed by Node CI.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'pyproject.toml'), 'utf8');
const version = /^version = "(\d+\.\d+\.\d+)"$/m.exec(source)?.[1];
if (!version) throw new Error('Falta una versión X.Y.Z en pyproject.toml.');
const args = process.argv.slice(2);
const tagIndex = args.indexOf('--tag');
if (tagIndex >= 0 && args[tagIndex + 1] !== `v${version}`) {
  throw new Error(`La etiqueta debe ser v${version}.`);
}
for (const name of ['package.json', 'package-lock.json']) {
  const filename = path.join(root, name);
  const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (args.includes('--write')) {
    data.version = version;
    if (data.packages?.['']) data.packages[''].version = version;
    fs.writeFileSync(filename, JSON.stringify(data, null, 2) + '\n');
  } else if (data.version !== version || (data.packages?.[''] && data.packages[''].version !== version)) {
    throw new Error(`${name} no coincide con ${version}. Ejecuta npm run version:sync.`);
  }
}
console.log(`MirrOS ${version}: versiones sincronizadas.`);
