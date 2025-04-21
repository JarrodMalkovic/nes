// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

console.log('Preload script loaded.');

// Example: Expose a safe API to the renderer process
// import { contextBridge, ipcRenderer } from 'electron'
//
// contextBridge.exposeInMainWorld('myAPI', {
//   doSomething: () => ipcRenderer.send('do-something')
// })
