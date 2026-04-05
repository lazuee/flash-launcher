export const FLASH_PLUGIN =
  process.platform === "darwin"
    ? "PepperFlashPlayer.plugin"
    : process.platform === "win32"
      ? "pepflashplayer.dll"
      : "libpepflashplayer.so";

export const ELECTRON_OUT_DIR = ".electron";
export const WHITELISTED_DOMAINS = [
  "localhost",
  "artix.com",
  "wikidot.com",
  "heromart.com",
];
