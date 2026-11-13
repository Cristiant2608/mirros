// Generates animated usage GIFs and desktop workflow preview from simulated MirrOS UI.
// No real USB device or personal data is accessed.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.MIRROS_CAPTURE_OUTPUT || path.join(root, 'docs/screenshots');
await fs.mkdir(output, {recursive: true});

const browserCandidates = [
  process.env.MIRROS_CAPTURE_BROWSER,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

let browser;
for (const candidate of browserCandidates) {
  try {
    await fs.access(candidate);
    browser = candidate;
    break;
  } catch {}
}
if (!browser) throw Error('Set MIRROS_CAPTURE_BROWSER to a Chromium browser.');

const ffmpeg = process.env.FFMPEG_BIN || '/usr/bin/ffmpeg';
const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirros-demo-'));
const profile = path.join(workDir, 'profile');
await fs.mkdir(profile, {recursive: true});

const webRoot = process.env.MIRROS_CAPTURE_WEB_ROOT || path.join(root, 'src/mirros/web');
const server = http.createServer(async (req, res) => {
  try {
    const clean = (req.url || '/').split('?')[0];
    const name = clean === '/' ? 'index.html' : clean.slice(1);
    if (!['index.html', 'viewer.js', 'viewer.css', 'audio-worklet.js'].includes(name)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      'Content-Type',
      name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html',
    );
    res.end(await fs.readFile(path.join(webRoot, name)));
  } catch {
    res.writeHead(500);
    res.end();
  }
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

// Minimal SPS metadata for a simulated 1264x2752 portrait frame.
let bits = '00000001' + '0'.repeat(96);
const ue = n => {
  const s = (n + 1).toString(2);
  bits += '0'.repeat(s.length - 1) + s;
};
ue(0);
ue(1);
ue(1264);
ue(2752);
bits += '01';
bits = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0');
const nal = [0x42, 1];
let zeros = 0;
for (let i = 0; i < bits.length; i += 8) {
  const b = parseInt(bits.slice(i, i + 8), 2);
  if (zeros >= 2 && b <= 3) {
    nal.push(3);
    zeros = 0;
  }
  nal.push(b);
  zeros = b === 0 ? zeros + 1 : 0;
}
const header = new Uint8Array(23);
header[0] = 1;
header[22] = 1;
const description = Buffer.from([...header, 33, 0, 1, nal.length >> 8, nal.length & 255, ...nal]).toString('base64');

const preloadScript = `
const demo = document.createElement('canvas');
demo.width = 1264;
demo.height = 2752;
const c = demo.getContext('2d');

window.__demo = {
  scrollY: 0,
  app: null,
  notesTyped: 0,
  ripple: null,
  themeDark: false,
  orientation: 'portrait',
};

const notesHeadline = 'MirrOS Live USB Demo';
const notesBody = [
  'Typing straight from PC keyboard',
  'Ctrl+C / Ctrl+V syncs text & PNG',
  'Ctrl+Shift+R records at 60 FPS',
];

function drawDemoFrame() {
  const d = window.__demo;
  const dark = d.themeDark;
  const g = c.createLinearGradient(0, 0, 1264, 2752);
  if (dark) {
    g.addColorStop(0, '#121826');
    g.addColorStop(0.55, '#1a2338');
    g.addColorStop(1, '#0d1322');
  } else {
    g.addColorStop(0, '#cbdcf8');
    g.addColorStop(0.55, '#ece4f7');
    g.addColorStop(1, '#afc8eb');
  }
  c.fillStyle = g;
  c.fillRect(0, 0, 1264, 2752);

  const fg = dark ? '#eef2ff' : '#24344f';
  const muted = dark ? '#94a3b8' : '#5e6f8c';
  const cardBg = dark ? '#1e293bd8' : '#ffffffc8';

  const text = (s, x, y, size, color = fg, weight = '400') => {
    c.fillStyle = color;
    c.font = weight + ' ' + size + 'px system-ui, sans-serif';
    c.fillText(s, x, y);
  };
  const card = (x, y, w, h, r = 48, fill = cardBg) => {
    c.fillStyle = fill;
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fill();
  };

  // Status bar
  text('09:41', 82, 145, 48, fg, '600');
  text('5G  100%', 920, 145, 36, muted, '600');

  if (d.app === 'Notes') {
    card(58, 220, 1148, 2280, 64);
    text('< Notes', 110, 325, 44, '#5870ec', '600');
    text(notesHeadline, 110, 460, 74, fg, '700');
    text('Connected over USB · Zero Jailbreak', 110, 535, 36, '#5870ec', '500');

    c.strokeStyle = dark ? '#334155' : '#e2e8f0';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(110, 585);
    c.lineTo(1154, 585);
    c.stroke();

    const fullText = notesBody.join('\\n');
    const shown = fullText.slice(0, d.notesTyped);
    const lines = shown.split('\\n');
    lines.forEach((line, idx) => {
      const y = 700 + idx * 105;
      text('• ' + line + (idx === lines.length - 1 ? '|' : ''), 110, y, 46, fg, '500');
    });

    card(110, 1160, 1044, 340, 40, dark ? '#0f172a99' : '#f1f5f9cc');
    text('Live Performance', 160, 1255, 44, fg, '600');
    text('HEVC Hardware Decode · 60 FPS · Audio On', 160, 1340, 36, '#38bdf8', '500');
    text('Battery 88% · AOD Standby Ready', 160, 1420, 34, muted);
  } else {
    c.save();
    c.translate(0, -d.scrollY);
    text('Good morning', 80, 380, 104, fg, '700');
    text('Your iPhone, on your desktop', 82, 468, 43, muted);

    card(70, 590, 1124, 390);
    text('MirrOS Studio', 125, 705, 65, fg, '600');
    text('Interactive 60 FPS USB mirroring', 125, 795, 44, muted);
    text('Click apps, scroll, type, or record', 125, 875, 36, '#5870ec', '500');

    const apps = [
      ['Notes', '#dfb85f'],
      ['Calendar', '#cc7888'],
      ['Music', '#8d80c4'],
      ['Files', '#739bc6'],
      ['Photos', '#9c83ab'],
      ['Weather', '#75a6b0'],
    ];
    for (let i = 0; i < apps.length; i++) {
      const x = 95 + (i % 3) * 390;
      const y = 1120 + Math.floor(i / 3) * 390;
      c.fillStyle = apps[i][1];
      c.beginPath();
      c.roundRect(x, y, 290, 250, 60);
      c.fill();
      text(apps[i][0][0], x + 96, y + 168, 125, '#ffffff', '600');
      text(apps[i][0], x + 40, y + 320, 40, fg, '500');
    }

    card(70, 2000, 1124, 340);
    text('Recent Activity', 125, 2110, 54, fg, '600');
    text('Clipboard synced · Recording ready', 125, 2195, 38, muted);
    text('Tap any app or drag to scroll', 125, 2265, 34, '#5870ec');

    card(70, 2420, 1124, 340);
    text('Media & Audio', 125, 2530, 54, fg, '600');
    text('AAC-ELD Stereo PCM · Low Latency', 125, 2615, 38, muted);
    c.restore();
  }

  // Home indicator bar
  c.fillStyle = dark ? '#94a3b8' : '#526782';
  c.beginPath();
  c.roundRect(442, 2645, 380, 14, 7);
  c.fill();

  // Touch ripple indicator when active
  if (d.ripple && d.ripple.progress > 0 && d.ripple.progress < 1) {
    const r = 35 + d.ripple.progress * 90;
    const alpha = Math.max(0, 1 - d.ripple.progress);
    c.strokeStyle = 'rgba(88, 112, 236, ' + alpha.toFixed(2) + ')';
    c.fillStyle = 'rgba(88, 112, 236, ' + (alpha * 0.25).toFixed(2) + ')';
    c.lineWidth = 10;
    c.beginPath();
    c.arc(d.ripple.x, d.ripple.y, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
}

drawDemoFrame();

const frameInterval = 70;
window.VideoDecoder = class {
  static async isConfigSupported() { return {supported: true}; }
  constructor(o) { this.o = o; this.state = 'unconfigured'; this.decodeQueueSize = 0; }
  configure() {
    this.state = 'configured';
    this.timer = setInterval(() => {
      drawDemoFrame();
      this.o.output(new VideoFrame(demo, {timestamp: performance.now() * 1000}));
    }, frameInterval);
  }
  decode() {}
  close() { clearInterval(this.timer); this.state = 'closed'; }
};

const realFetch = window.fetch.bind(window);
window.fetch = async (input, options) => {
  const p = String(input);
  if (p === '/codec') return new Response(JSON.stringify({codec: 'hev1.1.6.L150.B0', description: ${JSON.stringify(description)}}));
  if (p === '/orientation') return new Response(JSON.stringify({orientation: window.__demo.orientation}));
  if (p === '/rotate') {
    window.__demo.orientation = window.__demo.orientation === 'portrait' ? 'landscape' : 'portrait';
    return new Response(JSON.stringify({currentDeviceOrientation: window.__demo.orientation}));
  }
  if (p === '/battery') return new Response('{"capacity":88,"charging":false,"connected":true}');
  if (p === '/info') return new Response('{"ios_version":"18.1","accessibility":{"reduce_motion":true,"reduce_transparency":false,"increase_contrast":false}}');
  if (p === '/style') return new Response(JSON.stringify({style: window.__demo.themeDark ? 'dark' : 'light'}));
  if (p === '/media-state') return new Response('{"paused":false,"reason":null}');
  if (['/touch', '/key', '/button', '/wake', '/clipboard', '/app-switcher', '/apps/launch', '/display-mode', '/session/end'].includes(p)) {
    return new Response('{}', {headers: {'Content-Type': 'application/json'}});
  }
  if (p === '/stream.bin' || p === '/audio.bin') {
    return new Response(new ReadableStream({
      start(controller) {
        options?.signal?.addEventListener('abort', () => { try { controller.close(); } catch {} });
      }
    }));
  }
  return realFetch(input, options);
};

let state = {
  phase: 'conectado',
  mode: new URLSearchParams(window.location.search).get('mode') === 'phone' ? 'phone' : 'studio',
  theme: 'claro',
  size: 'mediano',
  alwaysOnTop: false,
  controlsVisible: true,
  version: '1.3.0',
  device: {name: 'iPhone 16 Pro', version: '18.1', model: 'iPhone 16 Pro'},
  update: {phase: 'actualizado', message: 'You are on version 1.3.0.'},
};
const listeners = [];
window.mirros = {
  state: async () => ({...state}),
  subscribe: fn => { listeners.push(fn); return () => {}; },
  action: async (name, value) => {
    if (name === 'theme') {
      state.theme = value;
      window.__demo.themeDark = value === 'oscuro';
    }
    if (name === 'mode') state.mode = value;
    if (name === 'controls') state.controlsVisible = value;
    if (name === 'pin') state.alwaysOnTop = value;
    listeners.forEach(fn => fn({...state}));
  },
};
`;

const child = spawn(
  browser,
  ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'],
  {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']},
);

let browserError = '';
child.stderr.on('data', data => { browserError = (browserError + data).slice(-8192); });

let ws, sequence = 0;
const requests = new Map();
const pause = ms => new Promise(r => setTimeout(r, ms));

async function encodeGif(framesDir, outGif, {fps = 10, width = 920} = {}) {
  const palette = path.join(workDir, `palette-${path.basename(outGif)}.png`);
  const inputPattern = path.join(framesDir, 'frame-%04d.png');
  await execFileAsync(ffmpeg, [
    '-y', '-framerate', String(fps), '-i', inputPattern,
    '-vf', `scale=${width}:-1:flags=lanczos,palettegen=max_colors=160:stats_mode=diff`,
    palette,
  ]);
  await execFileAsync(ffmpeg, [
    '-y', '-framerate', String(fps), '-i', inputPattern, '-i', palette,
    '-lavfi', `scale=${width}:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=4`,
    outGif,
  ]);
}

try {
  let page;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode) break;
    try {
      const active = await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8');
      const port = Number(active.split('\n')[0]);
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`, {signal: AbortSignal.timeout(1000)})).json();
      page = pages.find(p => p.type === 'page' && p.url === 'about:blank');
      if (page) break;
    } catch {}
    await pause(100);
  }
  if (!page) throw Error('Capture browser did not start: ' + browserError);

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    requests.get(m.id)?.(m);
    requests.delete(m.id);
  };

  const command = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        requests.delete(id);
        reject(Error(`Timeout: ${method}`));
      }, 15000);
      requests.set(id, m => {
        clearTimeout(timer);
        m.error ? reject(Error(JSON.stringify(m.error))) : resolve(m);
      });
      ws.send(JSON.stringify({id, method, params}));
    });

  const evaluate = async expression => {
    const res = await command('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (res.result.exceptionDetails) throw Error(JSON.stringify(res.result.exceptionDetails));
    return res.result.result.value;
  };

  await command('Page.enable');
  await command('Page.addScriptToEvaluateOnNewDocument', {source: preloadScript});

  const setViewport = async (width, height) => {
    await command('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
    await pause(200);
  };

  const waitLive = async () => {
    const limit = Date.now() + 20000;
    while (Date.now() < limit) {
      if (await evaluate("document.querySelector('.phone-shell.is-live') !== null")) {
        await pause(220);
        return;
      }
      await pause(80);
    }
    throw Error('Simulated frame did not become live in time');
  };

  const captureSequence = async (dir, countRef, steps, delayMs = 95) => {
    for (let i = 0; i < steps; i++) {
      const shot = await command('Page.captureScreenshot', {format: 'png'});
      const file = path.join(dir, `frame-${String(countRef.n++).padStart(4, '0')}.png`);
      await fs.writeFile(file, Buffer.from(shot.result.data, 'base64'));
      await pause(delayMs);
    }
  };

  const clickNavTab = async (...labels) => {
    await evaluate(
      `[...document.querySelectorAll('nav button')].find(b => ${JSON.stringify(labels)}.some(l => b.textContent.includes(l))).click()`,
    );
  };

  // =========================================================================
  // SCENE 1: mirros-demo.gif (Studio usage -> Scroll -> Notes App -> Audio/Clipboard -> EN/ES & Dark Theme)
  // =========================================================================
  const studioFrames = path.join(workDir, 'studio');
  await fs.mkdir(studioFrames, {recursive: true});
  await setViewport(1200, 780);
  await command('Page.navigate', {url});
  await waitLive();

  const sCount = {n: 0};

  // Intro frames
  await captureSequence(studioFrames, sCount, 8);

  // Smooth scroll down on simulated iPhone screen
  for (const sy of [80, 180, 290, 360, 250, 120, 0]) {
    await evaluate(`window.__demo.scrollY = ${sy};`);
    await captureSequence(studioFrames, sCount, 1);
  }

  // Touch ripple on Notes icon and launch simulated Notes typing
  for (const p of [0.25, 0.55, 0.85]) {
    await evaluate(`window.__demo.ripple = {x: 240, y: 1245, progress: ${p}};`);
    await captureSequence(studioFrames, sCount, 1);
  }
  await evaluate(`window.__demo.ripple = null; window.__demo.app = 'Notes'; window.__demo.notesTyped = 0;`);
  for (const typed of [10, 24, 38, 56, 74, 96]) {
    await evaluate(`window.__demo.notesTyped = ${typed};`);
    await captureSequence(studioFrames, sCount, 2);
  }

  // Switch Studio tabs: Audio -> Clipboard -> Appearance
  await clickNavTab('Audio');
  await captureSequence(studioFrames, sCount, 8);

  await clickNavTab('Clipboard', 'Portapapeles');
  await captureSequence(studioFrames, sCount, 8);

  await clickNavTab('Appearance', 'Apariencia');
  await captureSequence(studioFrames, sCount, 6);

  // Live language toggle EN -> ES, then Dark Theme + back to Screen
  await evaluate(`document.querySelector('.window-actions button.small-button')?.click();`);
  await captureSequence(studioFrames, sCount, 7);

  await evaluate(`window.mirros.action('theme', 'oscuro');`);
  await clickNavTab('Screen', 'Pantalla');
  await captureSequence(studioFrames, sCount, 10);

  // Switch back to EN & Light cleanly before loop restart
  await evaluate(`document.querySelector('.window-actions button.small-button')?.click(); window.mirros.action('theme', 'claro'); window.__demo.app = null; window.__demo.scrollY = 0;`);
  await captureSequence(studioFrames, sCount, 5);

  const mirrosDemoPath = path.join(output, 'mirros-demo.gif');
  await encodeGif(studioFrames, mirrosDemoPath, {fps: 10, width: 900});

  // =========================================================================
  // SCENE 2: floating-usage.gif + desktop-workflow.png (Floating Phone on Desktop IDE + Terminal)
  // =========================================================================
  const floatingFrames = path.join(workDir, 'floating');
  await fs.mkdir(floatingFrames, {recursive: true});

  await evaluate(`localStorage.setItem('mirros.lang', 'en');`);
  await setViewport(1220, 760);
  await command('Page.navigate', {url: `${url}?mode=phone`});
  await waitLive();

  // Inject simulated desktop OS + code editor + terminal backdrop behind transparent floating #root
  await evaluate(`
    const bg = document.createElement('div');
    bg.id = 'mock-desktop-bg';
    bg.style.cssText = 'position:fixed;inset:0;z-index:0;background:radial-gradient(circle at 18% 20%, #1d3557, #0b1120 68%);font-family:ui-sans-serif,system-ui,sans-serif;color:#e2e8f0;padding:22px 28px;display:flex;flex-direction:column;gap:16px;';
    bg.innerHTML = \`
      <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(15,23,42,.75);border:1px solid rgba(148,163,184,.18);border-radius:10px;padding:7px 14px;font-size:12px;color:#94a3b8;">
        <div style="display:flex;gap:14px;align-items:center;">
          <span style="color:#f8fafc;font-weight:700;">MirrOS Workspace</span>
          <span>src/mirros/cli.py</span>
        </div>
        <div>Wi-Fi · USB Ready · 09:41</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:14px;max-width:740px;">
        <div style="flex:1;background:#0f172ae8;border:1px solid rgba(148,163,184,.2);border-radius:14px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.45);">
          <div style="display:flex;gap:7px;align-items:center;padding:10px 14px;background:#1e293b;border-bottom:1px solid rgba(148,163,184,.12);font-size:12px;color:#94a3b8;">
            <span style="width:10px;height:10px;border-radius:50%;background:#ef4444;display:inline-block;"></span>
            <span style="width:10px;height:10px;border-radius:50%;background:#f59e0b;display:inline-block;"></span>
            <span style="width:10px;height:10px;border-radius:50%;background:#22c55e;display:inline-block;"></span>
            <span style="margin-left:10px;color:#e2e8f0;font-weight:600;">app_automation.py — VS Code</span>
          </div>
          <pre style="margin:0;padding:18px 20px;font-family:ui-monospace,monospace;font-size:13px;line-height:1.65;color:#cbd5e1;"><span style="color:#7dd3fc">from</span> mirros.runner <span style="color:#7dd3fc">import</span> run_mirros

<span style="color:#64748b"># Launch borderless floating phone over your IDE</span>
<span style="color:#c084fc">def</span> <span style="color:#93c5fd">start_session</span>():
    <span style="color:#7dd3fc">return</span> run_mirros(
        ui_mode=<span style="color:#86efac">"phone"</span>,
        no_audio=<span style="color:#fca5a5">False</span>,
        display_mode=<span style="color:#86efac">"dual"</span>,
        lang=<span style="color:#86efac">"en"</span>,
    )</pre>
        </div>
        <div style="height:215px;background:#020617f2;border:1px solid rgba(148,163,184,.2);border-radius:14px;padding:14px 18px;font-family:ui-monospace,monospace;font-size:12.5px;line-height:1.6;color:#94a3b8;box-shadow:0 20px 50px rgba(0,0,0,.45);">
          <div style="color:#cbd5e1;font-weight:600;margin-bottom:6px;">Terminal — mirros --audio</div>
          <div><span style="color:#38bdf8">$</span> mirros --audio</div>
          <div>[*] Looking for iPhone over USB...</div>
          <div><span style="color:#4ade80">[+]</span> iPhone detected: 00008140-001A28C9...</div>
          <div>[*] Opening floating phone at http://127.0.0.1:8080/?mode=phone</div>
          <div><span style="color:#4ade80">[+]</span> MirrOS active (HEVC 60 FPS · Always on top ready)</div>
        </div>
      </div>
    \`;
    document.body.prepend(bg);

    const rootEl = document.getElementById('root');
    rootEl.style.cssText = 'position:fixed;z-index:10;right:46px;top:38px;width:410px;height:690px;border-radius:28px;overflow:visible;filter:drop-shadow(0 24px 55px rgba(0,0,0,.62));transition:all .25s ease;';
    const styleTag = document.createElement('style');
    styleTag.textContent = '.floating-app{width:100%!important;height:100%!important;overflow:visible!important;}.floating-app .preview-stage{height:100%!important;}';
    document.head.appendChild(styleTag);
    window.mirros.action('theme', 'lavanda');
  `);
  await pause(550);

  // Save crisp static desktop-workflow.png hero photo
  const workflowShot = await command('Page.captureScreenshot', {format: 'png'});
  await fs.writeFile(path.join(output, 'desktop-workflow.png'), Buffer.from(workflowShot.result.data, 'base64'));

  const fCount = {n: 0};
  await captureSequence(floatingFrames, fCount, 7);

  // Scroll + tap inside floating phone
  for (const sy of [90, 210, 320, 210, 90, 0]) {
    await evaluate(`window.__demo.scrollY = ${sy};`);
    await captureSequence(floatingFrames, fCount, 1);
  }
  for (const p of [0.25, 0.55, 0.85]) {
    await evaluate(`window.__demo.ripple = {x: 240, y: 1245, progress: ${p}};`);
    await captureSequence(floatingFrames, fCount, 1);
  }
  await evaluate(`window.__demo.ripple = null; window.__demo.app = 'Notes'; window.__demo.notesTyped = 64;`);
  await captureSequence(floatingFrames, fCount, 8);

  // Collapse floating control rail, then re-expand and switch to Dark theme
  await evaluate(`document.querySelector('.controls-tab').click();`);
  await captureSequence(floatingFrames, fCount, 9);

  await evaluate(`document.querySelector('.controls-tab').click(); window.mirros.action('theme', 'oscuro');`);
  await captureSequence(floatingFrames, fCount, 9);

  // Rotate phone to Landscape floating over desktop!
  await evaluate(`
    document.getElementById('root').style.cssText = 'position:fixed;z-index:10;right:40px;top:165px;width:720px;height:420px;border-radius:28px;overflow:visible;filter:drop-shadow(0 24px 55px rgba(0,0,0,.62));transition:all .25s ease;';
    (document.querySelector('[aria-label="Rotate view 90°"]') || document.querySelector('[aria-label="Girar vista 90°"]'))?.click();
  `);
  await pause(750);
  await captureSequence(floatingFrames, fCount, 14);

  const floatingGifPath = path.join(output, 'floating-usage.gif');
  await encodeGif(floatingFrames, floatingGifPath, {fps: 10, width: 880});

  const statStudio = await fs.stat(mirrosDemoPath);
  const statFloating = await fs.stat(floatingGifPath);
  const statWorkflow = await fs.stat(path.join(output, 'desktop-workflow.png'));

  console.log(`Generated ${mirrosDemoPath} (${Math.round(statStudio.size / 1024)} KB, ${sCount.n} frames)`);
  console.log(`Generated ${floatingGifPath} (${Math.round(statFloating.size / 1024)} KB, ${fCount.n} frames)`);
  console.log(`Generated desktop-workflow.png (${Math.round(statWorkflow.size / 1024)} KB)`);
} finally {
  ws?.close();
  child.kill();
  server.close();
  await fs.rm(workDir, {recursive: true, force: true}).catch(() => {});
}
