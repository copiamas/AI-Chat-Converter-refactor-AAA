import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  convert: (data: { html: string; fileName: string; options: Record<string, unknown> }) =>
    ipcRenderer.invoke('convert', data),
});
