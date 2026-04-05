import { existsSync } from "node:fs";
import path from "node:path";
import { FLASH_PLUGIN } from "@electron/config";
import { showErrorDialog } from "@electron/main/dialog";
import { PLUGIN_PATH } from "@electron/main/utils";
import { app } from "electron";

export function registerFlash() {
  const pluginFlashPath = path.join(PLUGIN_PATH, FLASH_PLUGIN);
  if (!existsSync(pluginFlashPath)) {
    showErrorDialog(
      {
        message:
          "Flash plugin not found: " +
          path.relative(process.cwd(), pluginFlashPath),
      },
      true,
    );
    return;
  }

  app.commandLine.appendSwitch("ppapi-flash-path", pluginFlashPath);
  app.commandLine.appendSwitch("ppapi-flash-version", "32.0.0.371");

  app.commandLine.appendSwitch("allow-insecure-localhost", "true");
  app.commandLine.appendSwitch("disable-site-isolation-trials");
  app.commandLine.appendSwitch("ignore-certificate-errors");

  switch (process.platform) {
    case "linux":
      app.commandLine.appendSwitch("no-sandbox");
      break;
  }
}
