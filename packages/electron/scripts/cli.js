#!/usr/bin/env node

const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { execAsync } = require("./util.js");
const electronPath = require("../src/index.js");

if (!electronPath || !fs.existsSync(electronPath)) {
  console.error(
    "[Electron Wrapper] Error: Executable not found at:",
    electronPath,
  );
  console.error(
    "[Electron Wrapper] Ensure the package is installed correctly.",
  );
  process.exit(1);
}

(async () => {
  if (process.platform === "darwin") {
    await ensureMacOSExecutable(electronPath);
  }

  const child = spawn(electronPath, process.argv.slice(2), {
    stdio: "inherit",
    windowsHide: false,
  });

  child.on("error", (err) => {
    console.error("[Electron Wrapper] Failed to spawn Electron:", err);
    process.exit(1);
  });

  child.on("close", (code, _signal) => {
    if (code === null) {
      process.exit(1);
    }
    process.exit(code);
  });

  const signals = ["SIGINT", "SIGTERM", "SIGQUIT"];
  signals.forEach((signal) => {
    process.on(signal, () => {
      if (child && !child.killed) {
        child.kill(signal);
      }
    });
  });
})();

async function ensureMacOSExecutable(executablePath) {
  try {
    await fs.promises.chmod(executablePath, 0o755);
    const electronAppPath = executablePath.replace(
      /\/Contents\/MacOS\/Electron$/,
      "",
    );

    if (electronAppPath !== executablePath && fs.existsSync(electronAppPath)) {
      await execAsync(
        `xattr -rd com.apple.quarantine "${electronAppPath}" 2>/dev/null || true`,
      );
    }
  } catch (error) {
    console.warn(
      `[Electron Wrapper] Warning: Could not apply macOS fixes: ${error.message}`,
    );
  }
}
