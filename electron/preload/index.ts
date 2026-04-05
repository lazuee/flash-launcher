import { channel } from "@electron/ipc/channel";
import { contextBridge, ipcRenderer } from "electron";

console.log("preload loaded:", window.location.href);

const api: ElectronAPI = {
  openExternal: (url: string) =>
    ipcRenderer.invoke(channel.shell.openExternal, url),
};

contextBridge.exposeInMainWorld("electron", api);