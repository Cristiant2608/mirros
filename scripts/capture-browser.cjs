// Isolated Electron window for simulated UI checks. Never starts USB workers.
const {app, BrowserWindow, ipcMain} = require('electron');
const path = require('node:path');
const profile = process.argv.find(arg => arg.startsWith('--user-data-dir='));
if (profile) app.setPath('userData', profile.slice('--user-data-dir='.length));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
ipcMain.handle('benchmark:memory', () => app.getAppMetrics().map(({pid,type,memory})=>({pid,type,memory})));
ipcMain.on('benchmark:close',()=>setTimeout(()=>app.quit(),100));
app.whenReady().then(() => {
  const window = new BrowserWindow({show:false,width:1320,height:900,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,backgroundThrottling:false,preload:path.join(__dirname,'capture-preload.cjs')}});
  window.loadURL('about:blank');
});
app.on('window-all-closed',()=>app.quit());
