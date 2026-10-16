const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('mirrosBenchmark',{metrics:()=>ipcRenderer.invoke('benchmark:memory')});
