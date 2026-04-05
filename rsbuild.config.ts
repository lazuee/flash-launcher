import { defineConfig } from "@rsbuild/core";
import { pluginBabel } from "@rsbuild/plugin-babel";
import { pluginReact } from "@rsbuild/plugin-react";
import { createRequire } from "node:module";
import path from "node:path";
import { ELECTRON_OUT_DIR } from "./electron/config";
import { createEnvConfig, electronPlugin } from "./scripts/rsbuild-helper";

const require = createRequire(import.meta.url);

const polyfills = [
  ["crypto-mjs", "./electron/polyfills/crypto.mjs"],
  ["crypto-cjs", "./electron/polyfills/crypto.cjs"],
  ["fs-promises-mjs", "./electron/polyfills/fs-promises.mjs"],
  ["fs-promises-cjs", "./electron/polyfills/fs-promises.cjs"],
  ["bufferutil"],
  ["utf-8-validate"],
  process.platform !== "win32" && ["win-screen-resolution"], // win-screen-resolution is only available on windows
].filter((x): x is [string, string] => Array.isArray(x));

const videoNodePath = path.posix.join(
  path
    .resolve(path.dirname(require.resolve("win-screen-resolution")), "..")
    .replace(/\\/g, "/"),
  "prebuilds",
  "win32-x64",
  "video.node",
);

export default defineConfig(({ env }) => {
  const isProdBuild = env === "production";
  const mainConfig = createEnvConfig(
    {
      entry: "./electron/main/index.ts",
      output: {
        filename: "main.cjs",
        distPath: ELECTRON_OUT_DIR,
      },
      target: "electron-main",
      isProdBuild,
    },
    (config, { appendPlugins, rspack }) => {
      config.module!.rules = [
        ...(config.module!.rules ?? []),
        { test: /\.node$/, loader: "node-loader" },
      ];

      config.resolve ??= {};
      config.resolve.preferAbsolute = true;
      config.resolve.alias = { ...(config.resolve.alias ?? {}) };
      for (const [mod, file] of polyfills) {
        config.resolve.alias[mod] = path.resolve(
          __dirname,
          file ?? "./electron/polyfills/empty.cjs",
        );
      }

      appendPlugins([
        new rspack.CopyRspackPlugin({
          patterns: [
            ...(process.platform === "win32"
              ? [
                  {
                    from: videoNodePath,
                    to: path.resolve(
                      process.cwd(),
                      ELECTRON_OUT_DIR,
                      "prebuilds",
                      "win32-x64",
                      "win-screen-resolution.node",
                    ),
                  },
                ]
              : []),
          ],
        }),
      ]);
    },
    (code) => {
      const isESM = /^import\s+(\w+)(?:\s*,)?\s*\{/gm.test(code);
      // fix fs/promises doesn't exist > electron@11
      code = code.replace(
        /(['"])fs\/promises['"]/g,
        `$1fs-promises-${isESM ? "mjs" : "cjs"}$1`,
      );
      // fix crypto.randomUUID() doesn't exist > electron@11
      code = code.replace(
        /(['"])crypto['"]/g,
        `$1crypto-${isESM ? "mjs" : "cjs"}$1`,
      );
      // fix win-screen-resolution > video.node path
      code = code.replace("WASI.VERSION.at(-1)", "'unstable'");
      code = code.replace(
        /dlopen\(['"]video\.node['"]\s*,\s*\{\s*cwd:\s*join\(import\.meta\.dirname, ['"]..\/['"]\)/,
        `dlopen('${isProdBuild ? "win-screen-resolution.node" : "video.node"}', { cwd: ${isProdBuild ? "import.meta.dirname" : `join(import.meta.dirname, '${path.relative(ELECTRON_OUT_DIR, path.resolve(path.dirname(videoNodePath), "..", "..")).replace(/\\/g, "/")}')`}`,
      );

      return code;
    },
  );
  const preloadConfig = createEnvConfig({
    entry: "./electron/preload/index.ts",
    output: {
      filename: "preload.cjs",
      distPath: ELECTRON_OUT_DIR,
    },
    target: "electron-preload",
    isProdBuild,
  });

  const rendererConfig = createEnvConfig({
    entry: "./src/index.tsx",
    htmlTemplate: "./src/index.html",
    output: {
      filename: "index.js",
      distPath: "dist/web",
    },
    target: "web",
    isProdBuild,
  });

  return {
    output: { overrideBrowserslist: ["Electron 11.5.0"] },
    environments: {
      main: mainConfig,
      preload: preloadConfig,
      renderer: {
        ...rendererConfig,
        plugins: [
          pluginReact({ reactRefreshOptions: { overlay: true } }),
          pluginBabel({
            include: /\.[jt]sx$/,
            babelLoaderOptions: (opts) => {
              opts.plugins ??= [];
              opts.plugins.unshift([
                "babel-plugin-react-compiler",
                { target: "19" },
              ]);
            },
          }),
        ],
      },
    },
    plugins: [electronPlugin(ELECTRON_OUT_DIR)],
  };
});
