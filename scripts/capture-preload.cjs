const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('mirrosBenchmark',{close:()=>ipcRenderer.send('benchmark:close'),metrics:()=>ipcRenderer.invoke('benchmark:memory')});
