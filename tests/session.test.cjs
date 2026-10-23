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

test('diagnostics worker returns allowlisted JSON without altering session state', async () => {
  let state = {phase: 'buscando'};
  const session = createSession({
    workerArgs: args => {
      assert.deepEqual(args, ['diagnostics']);
      return [process.execPath, ['-e', 'console.log(JSON.stringify({schema_version:1,usb:{status:"ok",device_count:1}}))']];
    },
    publish: patch => { state = {...state, ...patch}; },
    getState: () => state,
    writeLog: () => {},
  });
  try {
    const report = await session.diagnostics();
    assert.deepEqual(report, {schema_version: 1, usb: {status: 'ok', device_count: 1}});
    assert.equal(state.phase, 'buscando');
  } finally {
    await session.close();
  }
});

test('unpaired or developer-mode-disabled phones report actionable instructions without spawning prepare', async () => {
  for (const [device, expectedText] of [
    [{udid: 'unpaired', paired: false}, 'Confiar'],
    [{udid: 'no-dev', paired: true, developer_mode: false, developer_mode_revealed: true}, 'Modo Desarrollador'],
  ]) {
    let state = {phase: 'buscando'};
    const spawned = [];
    const session = createSession({
      workerArgs: args => ['fake-worker', args],
      spawnProcess: (_file, args) => {
        spawned.push(args);
        const child = Object.assign(new EventEmitter(), {stdout: new PassThrough(), stderr: new PassThrough(), pid: 1, exitCode: null});
        queueMicrotask(() => {
          if (args[0] === 'status') child.stdout.write(JSON.stringify({devices: [device]}));
          child.exitCode = 0;
          child.emit('exit', 0);
        });
        return child;
      },
      publish: patch => { state = {...state, ...patch}; },
      getState: () => state,
      writeLog: () => {},
    });
    try {
      await session.scan();
      assert.equal(state.phase, 'buscando');
      assert.match(state.message, new RegExp(expectedText));
      assert.deepEqual(spawned, [['status']]);
    } finally {
      await session.close();
    }
  }
});

test('iOS below 17.4 falls back from --userspace to --tunnel udid', async () => {
  let state = {phase: 'buscando'};
  const spawned = [];
  const stopWorker = async child => {
    if (!child || child.exitCode !== null) return;
    child.exitCode = 0;
    child.emit('exit', 0);
  };
  const session = createSession({
    workerArgs: args => ['fake-worker', args],
    spawnProcess: (_file, args) => {
      spawned.push(args);
      const child = Object.assign(new EventEmitter(), {stdout: new PassThrough(), stderr: new PassThrough(), pid: 1, exitCode: null});
      if (args[0] !== 'serve') {
        queueMicrotask(() => {
          if (args[0] === 'status') {
            child.stdout.write(JSON.stringify({devices: [{udid: 'ios17-2', version: '17.2', userspace_supported: false}]}));
          }
          stopWorker(child);
        });
      }
      return child;
    },
    fetchRequest: async () => ({ok: true, json: async () => ({codec: 'hev1', description: 'fixture'})}),
    stopWorker,
    endSession: stopWorker,
    publish: patch => { state = {...state, ...patch}; },
    getState: () => state,
    writeLog: () => {},
  });
  try {
    await session.scan();
    assert.equal(state.phase, 'conectado');
    assert.deepEqual(spawned[1], ['prepare', '--tunnel', 'ios17-2']);
    assert.ok(spawned[2].includes('--tunnel') && spawned[2].includes('ios17-2'));
    assert.ok(!spawned[2].includes('--userspace'));
  } finally {
    await session.close();
  }
});

test('serve exiting with CoreDevice 9022 reports camera or microphone in use', async () => {
  let state = {phase: 'buscando'};
  const stopWorker = async child => {
    if (!child || child.exitCode !== null) return;
    child.exitCode = 0;
    child.emit('exit', 0);
  };
  const session = createSession({
    workerArgs: args => ['fake-worker', args],
    spawnProcess: (_file, args) => {
      const child = Object.assign(new EventEmitter(), {stdout: new PassThrough(), stderr: new PassThrough(), pid: 1, exitCode: null});
      queueMicrotask(() => {
        if (args[0] === 'status') {
          child.stdout.write(JSON.stringify({devices: [{udid: 'cam-busy'}]}));
          stopWorker(child);
        } else if (args[0] === 'prepare') {
          stopWorker(child);
        } else if (args[0] === 'serve') {
          child.stderr.write('CoreDeviceError: Camera or microphone is in use (9022)\n');
          child.exitCode = 1;
          child.emit('exit', 1);
        }
      });
      return child;
    },
    fetchRequest: async () => { throw new Error('offline'); },
    stopWorker,
    endSession: stopWorker,
    publish: patch => { state = {...state, ...patch}; },
    getState: () => state,
    writeLog: () => {},
  });
  try {
    await session.scan();
    assert.equal(state.phase, 'error');
    assert.match(state.message, /cámara o el micrófono/i);
  } finally {
    await session.close();
  }
});
