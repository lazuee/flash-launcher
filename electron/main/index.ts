import { app, BrowserWindow } from "electron";
import { getCurrentDisplayMode } from "win-screen-resolution";
import { registerFlash } from "./flash";
import { IS_DEV } from "./utils";
import { createLauncher } from "./windows/launcher";

// Disable renderer backgrounding to prevent the app from unloading when in the background
// https://github.com/electron/electron/issues/2822
// https://github.com/GoogleChrome/chrome-launcher/blob/5a27dd574d47a75fec0fb50f7b774ebf8a9791ba/docs/chrome-flags-for-tools.md#task-throttling
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

if (process.platform === "win32") {
  app.commandLine.appendSwitch("high-dpi-support", "true");

  // fix high-dpi scale factor on Windows (150% scaling)
  const { scale } = getCurrentDisplayMode();
  const forceScale =
    typeof scale === "number" && scale >= 150
      ? scale >= 250
        ? `${scale / 100 - 0.25}`
        : "1.75"
      : "1";
  app.commandLine.appendSwitch("force-device-scale-factor", forceScale);
}

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
let mainWin: BrowserWindow | null = null;

registerFlash();

app.whenReady().then(async () => {
  if (process.platform === "win32") app.setAppUserModelId("dev.lazuee.flash-launcher");

  mainWin = createLauncher();
  if (IS_DEV) {
    mainWin.webContents.openDevTools({ mode: "detach" });
  }
});

app
  .on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) mainWin = createLauncher();
  })
  .on("will-quit", () => IS_DEV && process.exit(0))
  .on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      if (mainWin?.isDestroyed()) app.quit();
    }
  });
