import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('version synchronization repairs manifests and rejects mismatched release tags', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mirros-version-'));
  try {
    await fs.mkdir(path.join(directory, 'scripts'));
    const script = path.join(directory, 'scripts/version.mjs');
    await fs.copyFile(new URL('../scripts/version.mjs', import.meta.url), script);
    await fs.writeFile(path.join(directory, 'pyproject.toml'), '[project]\nversion = "1.2.3"\n');
    await fs.writeFile(path.join(directory, 'package.json'), '{"version":"1.0.0"}\n');
    await fs.writeFile(path.join(directory, 'package-lock.json'), '{"version":"1.0.0","packages":{"":{"version":"1.0.0"}}}\n');
    const run = (...args) => spawnSync(process.execPath, [script, ...args], {encoding:'utf8'});
    assert.notEqual(run().status, 0);
    assert.equal(run('--write').status, 0);
    assert.equal(run('--tag', 'v1.2.3').status, 0);
    assert.notEqual(run('--tag', 'v1.2.4').status, 0);
    assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'package-lock.json'))).packages[''].version, '1.2.3');
  } finally {await fs.rm(directory, {recursive:true, force:true});}
});
