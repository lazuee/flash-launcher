import { app } from "electron";
import path from "node:path";

const isEnvSet = "ELECTRON_IS_DEV" in process.env;
const getFromEnv = Number.parseInt(process.env.ELECTRON_IS_DEV!, 10) === 1;

export const IS_DEV = isEnvSet ? getFromEnv : !app.isPackaged;

export const IS_PACKAGED = app.isPackaged;

export const ASSET_PATH = IS_PACKAGED
  ? process.platform === "win32"
    ? path.join(path.dirname(app.getPath("exe")), "resources", "app", "assets")
    : path.join(app.getAppPath(), "assets")
  : path.join(__dirname, "../assets");

export const DIST_PATH = IS_PACKAGED
  ? path.join(app.getAppPath(), "dist")
  : path.join(process.cwd(), "dist");

export const ICON_PATH = path.join(ASSET_PATH, "icons");
export const PLUGIN_PATH = path.join(ASSET_PATH, "plugins");

export const getWindowIcon = () =>
  process.platform === "darwin"
    ? undefined
    : path.resolve(
        ICON_PATH,
        process.platform === "win32" ? "win/icon.ico" : "icon.png",
      );

export const getMacIconPath = () => path.resolve(ICON_PATH, "mac/icon.png");
