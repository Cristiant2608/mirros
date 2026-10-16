const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createSession} = require('../desktop/session.cjs');

function fixture(code) {
  let state = {phase:'buscando'}, calls = 0;
  const session = createSession({
    workerArgs: args => {
      calls++;
      assert.deepEqual(args, ['status']);
      return [process.execPath, ['-e', code]];
    },
    publish: patch => {state = {...state, ...patch};},
    getState: () => state,
    writeLog: () => {},
  });
  return {session, state: () => state, calls: () => calls};
}

test('paused session never reconnects from a background scan', async () => {
  const f = fixture('console.log(JSON.stringify({devices:[]}))');
  try {
    await f.session.scan();
    assert.equal(f.calls(), 1);
    await f.session.disconnect();
    await f.session.scan();
    assert.equal(f.state().phase, 'pausado');
    assert.equal(f.calls(), 1);
    await f.session.retry();
    assert.equal(f.calls(), 2);
  } finally {await f.session.close();}
});

test('multiple phones require selection and reject an unknown device', async () => {
  const f = fixture('console.log(JSON.stringify({devices:[{udid:"one"},{udid:"two"}]}))');
  try {
    await f.session.scan();
    assert.equal(f.state().phase, 'seleccion');
    await f.session.select('unknown');
    assert.equal(f.calls(), 1);
    assert.equal(f.session.port, null);
  } finally {await f.session.close();}
});

test('closing cancels an outstanding scan and prevents future workers', async () => {
  const f = fixture('setTimeout(()=>console.log(JSON.stringify({devices:[]})),10000)');
  const scan = f.session.scan();
  await f.session.close();
  await scan;
  await f.session.scan();
  assert.equal(f.calls(), 1);
  assert.equal(f.session.port, null);
});
