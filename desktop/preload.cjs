const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('mirros', {
  state: () => ipcRenderer.invoke('mirros:state'),
  action: (name, value) => ipcRenderer.invoke('mirros:action', name, value),
  subscribe: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('mirros:state', listener);
    return () => ipcRenderer.removeListener('mirros:state', listener);
  },
});
