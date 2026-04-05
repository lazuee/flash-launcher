import { BrowserWindow, screen } from "electron";
import path from "node:path";
import { DIST_PATH, getMacIconPath, IS_DEV } from "../utils";

const loadUrl: string = IS_DEV
  ? `http://localhost:3020`
  : `file://${path.resolve(DIST_PATH, "web/index.html")}`;

export const createLauncher = (): BrowserWindow => {
  const { workArea: primaryDisplay } = screen.getPrimaryDisplay();
  const biggest = Math.max(primaryDisplay.width, primaryDisplay.height) * 0.75;
  const size = {
    width: ~~biggest,
    height: ~~((biggest / 16) * 9),
  };

  const mainWin = new BrowserWindow({
    icon: getMacIconPath(),
    backgroundColor: "#141517",
    width: size.width,
    height: size.height,
    minWidth: 960,
    minHeight: 590,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      webSecurity: true,
      plugins: true,
      devTools: IS_DEV,
    },
  });

  mainWin.loadURL(loadUrl);
  return mainWin;
};
