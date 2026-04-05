import { logger, type RsbuildPlugin } from "@rsbuild/core";
import {
  type AfterPackContext,
  build as electronBuild,
  log,
} from "electron-builder";
import { execSync } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

import pkg from "../package.json";
import {
  createAssetFilter,
  getAppDir,
  getResourcesPath,
} from "./electron-helper";

const author = (pkg as any).author?.name ?? (pkg as any).author;
const appId = `com.${author.replace(/\s+/g, "-")}.${pkg.name}`.toLowerCase();
const productName = pkg.name
  .split("-")
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  .join(" ");
const artifactName = `${pkg.name}-v${pkg.version}-\${os}-\${arch}.\${ext}`;
const PKG_PRODUCT_NAME_PLACEHOLDER = "__PRODUCT_NAME__";
const PKG_SCRIPTS_SOURCE_DIR = "scripts/mac/pkg-scripts";
const BUILD_RESOURCES_DIR = "build";
const PKG_SCRIPTS_DIR_IN_BUILD_RESOURCES = "pkg-scripts";
const PKG_SCRIPTS_GENERATED_DIR = `${BUILD_RESOURCES_DIR}/${PKG_SCRIPTS_DIR_IN_BUILD_RESOURCES}`;
const PKG_SCRIPT_FILES = ["preinstall", "postinstall"] as const;

const PLATFORM_MAP = { win32: "win", darwin: "mac", linux: "linux" } as const;
const IGNORED_FILES = [
  "!**/._*",
  "!.editorconfig",
  "!**/node_modules/**/*",
  "!**/{appveyor.yml,.travis.yml,circle.yml}",
  "!**/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}",
  "!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}",
  "!**/{__pycache__,thumbs.db,.flowconfig,.idea,.vs,.nyc_output}",
  "!**/{npm-debug.log,yarn.lock,pnpm-lock.yaml,.yarn-integrity,.yarn-metadata.json}",
];

async function preparePkgScripts(productName: string) {
  const sourceDir = path.resolve(process.cwd(), PKG_SCRIPTS_SOURCE_DIR);
  const generatedDir = path.resolve(process.cwd(), PKG_SCRIPTS_GENERATED_DIR);

  await fs.rm(generatedDir, { recursive: true, force: true });
  await fs.mkdir(generatedDir, { recursive: true });

  await Promise.all(
    PKG_SCRIPT_FILES.map(async (fileName) => {
      const sourcePath = path.join(sourceDir, fileName);
      const targetPath = path.join(generatedDir, fileName);
      const template = await fs.readFile(sourcePath, "utf-8");
      const content = template
        .split(PKG_PRODUCT_NAME_PLACEHOLDER)
        .join(productName);

      await fs.writeFile(targetPath, content, { mode: 0o755 });
      await fs.chmod(targetPath, 0o755);
    }),
  );

}

async function cleanupPackage({ appOutDir, packager }: AfterPackContext) {
  const appDir = getAppDir(
    appOutDir,
    packager.appInfo.productFilename,
    packager.platform.nodeName,
  );
  const staticDir = path.join(appDir, ".electron", "static");
  const pkgPath = path.join(appDir, "package.json");

  await fs.rm(staticDir, { recursive: true, force: true }).catch(() => {});

  if (existsSync(pkgPath)) {
    const { name, version, description, author, main } = JSON.parse(
      await fs.readFile(pkgPath, "utf-8"),
    );
    await fs.writeFile(
      pkgPath,
      JSON.stringify(
        { name, version, description, author, type: "commonjs", main },
        null,
        2,
      ),
    );
  }
}

async function pruneMacFramework({
  appOutDir,
  packager,
  electronPlatformName,
}: AfterPackContext) {
  if (electronPlatformName !== "darwin") return;

  const frameworkDir = path.join(
    appOutDir,
    `${packager.appInfo.productFilename}.app`,
    "Contents",
    "Frameworks",
    "Electron Framework.framework",
  );
  const versionsDir = path.join(frameworkDir, "Versions");
  const currentDir = path.join(versionsDir, "Current");

  const folders = await fs.readdir(currentDir).catch(() => [] as string[]);

  await Promise.all(
    folders.map(async (folder) => {
      await fs.rm(path.join(frameworkDir, folder), {
        recursive: true,
        force: true,
      });
      await fs.rename(
        path.join(currentDir, folder),
        path.join(frameworkDir, folder),
      );
    }),
  );

  await fs.rm(versionsDir, { recursive: true, force: true });
}

async function zipResources({
  appOutDir,
  packager,
  electronPlatformName,
}: AfterPackContext) {
  const { productFilename, version } = packager.appInfo;
  const platform =
    PLATFORM_MAP[electronPlatformName as keyof typeof PLATFORM_MAP] ?? "linux";
  const arch = process.arch === "arm64" ? "x64" : process.arch;
  const resourcesPath = getResourcesPath(
    appOutDir,
    productFilename,
    electronPlatformName,
  );

  if (!existsSync(resourcesPath)) {
    log.warn(`Resources not found: ${resourcesPath}`);
    return;
  }

  const zipPath = path.join(
    appOutDir,
    "..",
    `${pkg.name}-v${version}-${platform}-${arch}-resources.zip`,
  );
  log.info(
    `Zipping: ${path.relative(process.cwd(), resourcesPath)} → ${path.relative(process.cwd(), zipPath)}`,
  );

  try {
    const cmd =
      process.platform === "win32"
        ? `"C:\\Program Files\\7-Zip\\7z.exe" a -tzip -mx9 "${zipPath}" .`
        : `zip -r -9 "${zipPath}" .`;
    execSync(cmd, { cwd: resourcesPath, stdio: "ignore" });
  } catch (e) {
    logger.error("Failed to zip resources:", e);
  }
}

function setupEnv() {
  Object.assign(process.env, {
    NODE_OPTIONS: "--max-old-space-size=4096",
    NODE_ENV: "production",
    ELECTRON_BUILDER_PARALLEL: "true",
    ELECTRON_BUILDER_7Z_FILTER: "BCJ2",
    ELECTRON_BUILDER_COMPRESSION_LEVEL: "9",
    ELECTRON_BUILDER_CACHE: "false",
    ELECTRON_BUILDER_SKIP_GYP: "true",
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
    ...(process.platform === "darwin" && { SKIP_NOTARIZATION: "true" }),
    ...(process.platform === "win32" && {
      WIN_CSC_LINK: "",
      WIN_CSC_KEY_PASSWORD: "",
    }),
  });
}

type OnAfterBuild = Exclude<
  Parameters<Parameters<RsbuildPlugin["setup"]>[0]["onAfterBuild"]>[0],
  Function
>;

export function buildElectron(electronOutDir: string): OnAfterBuild {
  setupEnv();

  return {
    order: "post",
    async handler() {
      log.info("Building electron app...");
      await preparePkgScripts(productName);

      await electronBuild({
        config: {
          appId,
          productName,
          artifactName,
          copyright: `Copyright © ${new Date().getFullYear()} - ${author}`,
          buildVersion: pkg.version,
          compression: "maximum",
          asar: false,
          npmRebuild: true,
          nodeGypRebuild: false,
          electronCompile: false,
          forceCodeSigning: false,
          detectUpdateChannel: false,
          removePackageScripts: true,
          removePackageKeywords: true,
          buildDependenciesFromSource: false,
          electronLanguages: ["en-US"],
          publish: [],
          directories: {
            output: "dist/electron",
            buildResources: BUILD_RESOURCES_DIR,
          },
          files: [`${electronOutDir}/**`, "dist/web/**", ...IGNORED_FILES],
          beforeBuild: () => false,

          win: {
            target: [{ target: "nsis", arch: "x64" }],
            icon: "assets/icons/win/icon.ico",
            verifyUpdateCodeSignature: false,
            requestedExecutionLevel: "asInvoker",
            extraFiles: [
              {
                from: "assets",
                to: "resources/app/assets",
                filter: createAssetFilter([
                  "mac",
                  "PepperFlashPlayer.plugin",
                  "libpepflashplayer.so",
                ]),
              },
            ],
          },

          mac: {
            target: [{ target: "pkg", arch: "x64" }],
            icon: "assets/icons/mac/icon.icns",
            category: "public.app-category.games",
            hardenedRuntime: true,
            gatekeeperAssess: false,
            darkModeSupport: true,
            entitlements: "scripts/mac/entitlements.mac.plist",
            entitlementsInherit: "scripts/mac/entitlements.mac.plist",
            identity: null,
            provisioningProfile: null,
            type: "distribution",
            notarize: false,
            extraFiles: [
              {
                from: "assets",
                to: "Resources/app/assets",
                filter: createAssetFilter([
                  "win",
                  "pepflashplayer.dll",
                  "libpepflashplayer.so",
                ]),
              },
            ],
          },

          linux: {
            target: [{ target: "AppImage", arch: ["x64"] }],
            icon: "assets/icons/icon.png",
            category: "Game",
            synopsis: (pkg as any).description,
            maintainer: author,
            vendor: author,
            extraFiles: [
              {
                from: "assets",
                to: "Resources/assets",
                filter: createAssetFilter([
                  "win",
                  "mac",
                  "PepperFlashPlayer.plugin",
                  "pepflashplayer.dll",
                ]),
              },
            ],
          },

          snap: {
            allowNativeWayland: true,
            executableArgs: ["--no-process-scanning"],
          },

          nsis: {
            oneClick: false,
            perMachine: false,
            allowToChangeInstallationDirectory: true,
            installerLanguages: ["en_US"],
            unicode: true,
            guid: "85066FAB-FAE0-45FA-8DC0-08A10CE46854",
            warningsAsErrors: false,
            license: "../LICENSE.md",
            language: "1033",
            packElevateHelper: true,
            uninstallDisplayName: "${productName}",
            differentialPackage: false,
          },

          pkg: {
            identity: null,
            allowAnywhere: false,
            allowCurrentUserHome: false,
            allowRootDirectory: true,
            installLocation: "/Applications",
            license: "../LICENSE.md",
            background: {
              file: "scripts/mac/pkg-background.png",
              alignment: "center",
              scaling: "proportional",
            },
          },

          afterPack: (ctx) =>
            Promise.all([
              cleanupPackage(ctx),
              pruneMacFramework(ctx),
              zipResources(ctx),
            ]).then(() => {}),
        },
      }).catch((err) =>{
        log.error(err);
      });
    },
  };
}
