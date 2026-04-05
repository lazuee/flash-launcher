#!/usr/bin/env node

const { downloadArtifact } = require("@electron/get");
const extract = require("extract-zip");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execAsync } = require("./util.js");

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8"),
);
const { version } = packageJson;

const distPath = path.join(__dirname, "..", "dist");

const pathFile = path.join(__dirname, "..", "path.txt");

const arch = process.env.npm_config_arch || os.arch();

const CONFIG = {
  version,
  artifactName: "electron",
  force: process.env.force_no_cache === "true",
  cacheRoot: process.env.electron_config_cache,
  platform: process.env.npm_config_platform || os.platform(),
  arch: arch === "arm64" ? "x64" : arch,
};

if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
  process.exit(0);
}

const platformPath = getPlatformPath(CONFIG.platform);

(async () => {
  if (isInstalled()) {
    console.log(`[install] Electron ${version} is already installed.`);
    process.exit(0);
  }

  try {
    console.log(
      `[install] Downloading Electron ${version} (${CONFIG.platform}-${CONFIG.arch})...`,
    );
    const zipPath = await downloadArtifact(CONFIG);

    console.log("[install] Extracting...");
    await extractFile(zipPath);

    console.log("[install] Success!");
  } catch (err) {
    console.error(`[install] Error: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
})();

function isInstalled() {
  const versionFile = path.join(distPath, "version");

  if (
    !fs.existsSync(distPath) ||
    !fs.existsSync(versionFile) ||
    !fs.existsSync(pathFile)
  ) {
    return false;
  }

  try {
    const installedVersion = fs
      .readFileSync(versionFile, "utf-8")
      .replace(/^v/, "")
      .trim();
    const installedPath = fs.readFileSync(pathFile, "utf-8").trim();

    if (installedVersion !== version || installedPath !== platformPath) {
      return false;
    }

    const electronPath =
      process.env.ELECTRON_OVERRIDE_DIST_PATH ||
      path.join(distPath, platformPath);
    return fs.existsSync(electronPath);
  } catch (_e) {
    return false;
  }
}

async function extractFile(zipPath) {
  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true });
  }

  await extract(zipPath, { dir: distPath });

  const srcTypeDefPath = path.join(distPath, "electron.d.ts");
  const targetTypeDefPath = path.join(__dirname, "..", "src", "index.d.ts");

  if (fs.existsSync(srcTypeDefPath)) {
    if (!fs.existsSync(path.dirname(targetTypeDefPath))) {
      fs.mkdirSync(path.dirname(targetTypeDefPath), { recursive: true });
    }
    fs.renameSync(srcTypeDefPath, targetTypeDefPath);
  }

  await fs.promises.writeFile(pathFile, platformPath);

  if (CONFIG.platform === "darwin") {
    await fixMacOSElectronApp(distPath);
  } else if (CONFIG.platform !== "win32") {
    const execPath = path.join(distPath, platformPath);
    if (fs.existsSync(execPath)) {
      await fs.promises.chmod(execPath, 0o755);
    }
  }
}

async function fixMacOSElectronApp(extractDir) {
  const electronAppPath = path.join(extractDir, "Electron.app");
  if (!fs.existsSync(electronAppPath)) return;

  const relativePaths = [
    "Contents/MacOS/Electron",
    "Contents/Frameworks/Electron Framework.framework/Electron Framework",
    "Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper",
    "Contents/Frameworks/Electron Helper (GPU).app/Contents/MacOS/Electron Helper (GPU)",
    "Contents/Frameworks/Electron Helper (Plugin).app/Contents/MacOS/Electron Helper (Plugin)",
    "Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Helper (Renderer)",
  ];

  const chmodPromises = relativePaths.map(async (relPath) => {
    const filePath = path.join(electronAppPath, relPath);
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.chmod(filePath, 0o755);
      }
    } catch (error) {
      console.warn(
        `[install] Warning: Could not chmod ${relPath}: ${error.message}`,
      );
    }
  });

  await Promise.all(chmodPromises);

  try {
    await execAsync(`xattr -rd com.apple.quarantine "${electronAppPath}"`);
    console.log("[install] Removed quarantine attribute from Electron.app");
  } catch {}
}

function getPlatformPath(plat) {
  switch (plat) {
    case "mas":
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron";
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron";
    case "win32":
      return "electron.exe";
    default:
      throw new Error(`Electron builds are not available on platform: ${plat}`);
  }
}
