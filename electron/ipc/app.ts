import { ipcMain, shell } from "electron";

import { channel } from "./channel";

export function registerAppHandlers() {
  ipcMain.handle(channel.shell.openExternal, async (_event, url: string) => {
    await shell.openExternal(url, { activate: true });
  });
}