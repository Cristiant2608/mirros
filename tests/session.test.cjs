const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createSession} = require('../desktop/session.cjs');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');

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

function connectedFixture(options = {}) {
  let state = {phase:'buscando', ...(options.state || {})}, healthy = true, serves = 0;
  let healthReply;
  const active = new Set();
  const stopWorker = async child => {
    if (!child || child.exitCode !== null) return;
    active.delete(child); child.exitCode = 0; child.emit('exit', 0);
  };
  const session = createSession({
    workerArgs: args => ['fake-worker', args],
    spawnProcess: (_file, args) => {
      const child = Object.assign(new EventEmitter(), {stdout:new PassThrough(), stderr:new PassThrough(), pid:1, exitCode:null});
      active.add(child);
      if (args[0] === 'serve') {serves++; healthy = true;}
      else queueMicrotask(() => {
        if (args[0] === 'status') child.stdout.write(JSON.stringify({devices:[{udid:'same-phone'}]}));
        stopWorker(child);
      });
      return child;
    },
    fetchRequest: async (url, fetchOptions) => {
      if (options.onFetch) options.onFetch(url, fetchOptions);
      if (url.endsWith('/health') && healthReply) return await healthReply();
      return {ok:true, json:async () => url.endsWith('/health') ? {healthy} : {codec:'fixture', description:'fixture'}};
    },
    stopWorker,
    endSession: stopWorker,
    publish: patch => {state = {...state, ...patch};},
    getState: () => state,
    writeLog: () => {},
  });
  return {session, state:() => state, serves:() => serves, active,
    loseTunnel:() => {healthy = false;}, deferHealth:callback => {healthReply = callback;}};
}

test('a lost tunnel restarts even when USB discovery sees the same reconnected phone', async () => {
  const f = connectedFixture();
  try {
    await f.session.scan(); assert.equal(f.state().phase, 'conectado');
    f.loseTunnel();
    await f.session.scan();
    assert.equal(f.serves(), 2);
    assert.equal(f.state().phase, 'conectado');
    assert.equal(f.active.size, 1);
  } finally {await f.session.close();}
  assert.equal(f.active.size, 0);
});

test('an obsolete health result cannot reconnect after the user pauses', async () => {
  const f = connectedFixture();
  try {
    await f.session.scan();
    let begin, finish;
    const began = new Promise(resolve => {begin = resolve;});
    f.deferHealth(() => new Promise(resolve => {finish = resolve; begin();}));
    const scan = f.session.scan();
    await began;
    await f.session.disconnect();
    finish({ok:false});
    await scan;
    assert.equal(f.state().phase, 'pausado');
    assert.equal(f.serves(), 1);
    assert.equal(f.active.size, 0);
  } finally {await f.session.close();}
});


test('failed discovery cannot reconnect after a manual pause', async()=>{
  const f=fixture('setTimeout(()=>process.exit(1),30)');
  try {const scan=f.session.scan();await f.session.disconnect();await scan;assert.equal(f.state().phase,'pausado');await f.session.scan();assert.equal(f.calls(),1);}
  finally {await f.session.close();}
});


test('manual pause stays authoritative if an external status snapshot is stale', async()=>{
  const f=fixture('console.log(JSON.stringify({devices:[]}))');
  try {await f.session.scan();await f.session.disconnect();f.state().phase='buscando';await f.session.scan();assert.equal(f.calls(),1);await f.session.retry();assert.equal(f.calls(),2);}
  finally {await f.session.close();}
});

test('session applies preferred aod displayMode upon connection', async () => {
  let displayModeSent = null;
  const f = connectedFixture({
    state: {displayMode: 'aod'},
    onFetch: (url, fetchOptions) => {
      if (url.endsWith('/display-mode')) {
        displayModeSent = JSON.parse(fetchOptions.body);
      }
    },
  });
  try {
    await f.session.scan();
    assert.equal(f.state().phase, 'conectado');
    assert.deepEqual(displayModeSent, {mode: 'aod'});
  } finally {
    await f.session.close();
  }
});
