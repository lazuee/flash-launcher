const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");
const pathFile = path.join(rootDir, "path.txt");

if (!fs.existsSync(pathFile)) {
  throw new Error(
    "Electron failed to install correctly, please delete node_modules/electron and try installing again",
  );
}

const executableFile = fs.readFileSync(pathFile, "utf-8").trim();
const distPath =
  process.env.ELECTRON_OVERRIDE_DIST_PATH || path.join(rootDir, "dist");

module.exports = path.join(distPath, executableFile);
