import { contextBridge, ipcRenderer, webUtils } from "electron";
contextBridge.exposeInMainWorld("readerAPI", {
  choose: () => ipcRenderer.invoke("reader:choose"),
  importFile: (file: File) => ipcRenderer.invoke("reader:import", webUtils.getPathForFile(file)),
  exportMarkdown: (id: string) => ipcRenderer.invoke("reader:export", id),
  previewShow: (id: string) => ipcRenderer.invoke("reader:preview-show", id),
  previewHide: () => ipcRenderer.invoke("reader:preview-hide"),
  previewBounds: (bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke("reader:preview-bounds", bounds),
  openExternal: (id: string) => ipcRenderer.invoke("reader:open-external", id),
});
