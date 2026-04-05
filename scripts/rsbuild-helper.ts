import fs from "node:fs";
import { builtinModules } from "node:module";
import {
  type EnvironmentConfig,
  logger,
  type ModifyRspackConfigUtils,
  type RsbuildPlugin,
  type Rspack,
} from "@rsbuild/core";

import { buildElectron } from "./electron-build";
import { restartElectron, startElectron } from "./electron-start";

const externals: Record<string, string> = { electron: "commonjs2 electron" };
for (const mod of builtinModules) {
  const name = mod.replace(/^node:/, "");
  externals[name] = `commonjs2 ${name}`;
  externals[`node:${name}`] = `commonjs2 ${name}`;
}

const transformPatterns = {
  // strip node: protocol prefix (not supported in Node 12)
  nodeProtocol: /(['"]?)node:([\w]+)(['"]?)/g,
  // fix ESM default imports
  esmDefaultImport: /^import\s+(\w+)\s+from\s*(['"])([^'"]+)\2;?$/gm,
  // fix ESM named imports
  esmNamedImport: /^import\s*\{([^}]+)\}\s+from\s*(['"])([^'"]+)\2;?$/gm,
  // fix ESM default imports with named imports
  esmMixedImport:
    /^import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s*(['"])([^'"]+)\3;?$/gm,
};

const transformCodes: ((code: string) => string)[] = [];

const transformCode = (code: string) => {
  code = code
    .replace(transformPatterns.nodeProtocol, "$1$2$3")
    .replace(transformPatterns.esmDefaultImport, (_, name, quote, path) => {
      const isFSPromises = path === "fs/promises";
      if (isFSPromises) path = path.replace("fs/promises", "fs");

      return `import * as _${name} from ${quote}${path}${quote};\nconst ${name} = _${name}?.default${isFSPromises ? "?.promises" : ""} ?? _${name}${isFSPromises ? "?.promises" : ""};`;
    })
    .replace(
      transformPatterns.esmNamedImport,
      (_, named, quote, path: string) => {
        const name = path.replace(/[@.-]/g, "").replace(/\//g, "_");
        const source = `_${name}`;
        const declarations = named
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
          .map((specifier: string) => {
            if (/^type\s/.test(specifier)) return "";
            const parts = specifier.split(/\s+as\s+/);
            const exportName = parts[0]?.trim() ?? "";
            const localName = parts[1] ? parts[1].trim() : exportName;
            return `const ${localName} = ${source}?.${exportName};`;
          })
          .filter(Boolean)
          .join("\n");

        return `import * as _${name} from ${quote}${path}${quote};\n${declarations}`;
      },
    )
    .replace(
      transformPatterns.esmMixedImport,
      (_, name, named, quote, path) => {
        const source = `_${name}`;
        const declarations = named
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
          .map((specifier: string) => {
            if (/^type\s/.test(specifier)) return "";
            const parts = specifier.split(/\s+as\s+/);
            const exportName = (parts[0] ?? "").trim();
            const localName = parts[1] ? parts[1].trim() : exportName;
            return `const ${localName} = ${source}?.${exportName} ?? ${source}?.default?.${exportName};`;
          })
          .filter(Boolean)
          .join("\n");

        return `import * as _${name} from ${quote}${path}${quote};\nconst ${name} = _${name}?.default${source} ?? _${name}${source};\n${declarations}`;
      },
    );

  for (const transformCode of transformCodes) {
    code = transformCode?.(code);
  }

  return code;
};

const getNodeCompatRules = (): Rspack.RuleSetRule[] => [
  {
    test: /\.ts$/,
    exclude: /node_modules/,
    loader: "builtin:swc-loader",
    options: createSwcOptions("typescript"),
    type: "javascript/auto",
  },
  {
    test: /\.([cm]?js)$/,
    include: /node_modules/,
    loader: "builtin:swc-loader",
    options: createSwcOptions("ecmascript"),
    type: "javascript/auto",
  },
];

const createSwcOptions = (syntax: "typescript" | "ecmascript", tsx = false) =>
  ({
    jsc: {
      target: "es2019" as const,
      parser: { syntax, ...(tsx && { tsx: true }) },
      transform: {
        useDefineForClassFields: false,
        ...(tsx && {
          react: {
            runtime: "automatic" as const,
            development: process.env.NODE_ENV !== "production",
            refresh: process.env.NODE_ENV !== "production",
          },
        }),
      },
    },
  }) as const;

interface NodeEnvConfig {
  entry: `./${string}.${"ts" | "mts" | "cts" | "js" | "mjs" | "cjs"}`;
  output: {
    filename: string;
    distPath: string;
  };
  target: "electron-main" | "electron-preload";
  isProdBuild: boolean;
}

interface ReactEnvConfig {
  entry: `./${string}.${"tsx" | "jsx"}`;
  output: {
    filename: string;
    distPath: string;
  };
  target: "web";
  isProdBuild: boolean;
  htmlTemplate?: `./${string}.html`;
}

type EnvConfig = NodeEnvConfig | ReactEnvConfig;

const createEnvConfig = (
  config: EnvConfig,
  extraSetup?: (
    config: Rspack.Configuration,
    utils: ModifyRspackConfigUtils,
  ) => void,
  transformCode?: (code: string) => string,
): EnvironmentConfig => {
  if (transformCode && typeof transformCode === "function")
    transformCodes.push(transformCode);

  return config.target !== "web"
    ? {
        source: { entry: { index: config.entry } },
        output: {
          target: "node",
          polyfill: "usage",
          legalComments: "none",
          externals,
          filename: { js: config.output.filename },
          distPath: { root: config.output.distPath, js: "." },
          minify: config.isProdBuild,
          sourceMap: !config.isProdBuild,
        },
        performance: {
          removeConsole: config.isProdBuild,
          chunkSplit: { strategy: "all-in-one" },
        },
        dev: {
          writeToDisk: (f) => /\.(([cm]?js)(\.map)?|jsonc?)$/.test(f),
        },
        tools: {
          htmlPlugin: false,
          rspack(_config, utils) {
            _config.target = config.target;
            _config.module ??= {};
            _config.module.rules = [
              ...(_config.module.rules ?? []),
              ...getNodeCompatRules(),
            ];
            extraSetup?.(_config, utils);
          },
        },
      }
    : {
        html: { template: config.htmlTemplate },
        source: { entry: { index: config.entry } },
        output: {
          target: "web",
          polyfill: "usage",
          legalComments: "none",
          assetPrefix: "./",
          distPath: {
            root: config.output.distPath,
            svg: "static/img",
            image: "static/img",
          },
          minify: config.isProdBuild,
          sourceMap: !config.isProdBuild,
          filename: config.isProdBuild
            ? {
                js: "[name].[contenthash:8].js",
                css: "[name].[contenthash:8].css",
              }
            : {},
        },
        performance: {
          removeConsole: config.isProdBuild,
          chunkSplit: {
            strategy: "custom",
            splitChunks: {
              chunks: "all",
              minChunks: 1,
              cacheGroups: {
                vendor: {
                  test: /[\\/]node_modules[\\/]/,
                  name: "vendors",
                  chunks: "all",
                  priority: 10,
                  reuseExistingChunk: true,
                },
                react: {
                  test: /node_modules[\\/](?:react|react-dom|scheduler|react-refresh)[\\/]/,
                  name: "lib-react",
                  chunks: "all",
                  priority: 20,
                },
                router: {
                  test: /node_modules[\\/](?:react-router|react-router-dom|history|@remix-run[\\/]router)[\\/]/,
                  name: "lib-router",
                  chunks: "all",
                  priority: 20,
                },
                utils: {
                  name: "common",
                  minChunks: 2,
                  chunks: "all",
                  priority: 5,
                  reuseExistingChunk: true,
                },
              },
            },
          },
          preload: {
            type: "all-chunks",
          },
          prefetch: {
            type: "all-chunks",
          },
        },
        tools: {
          rspack(_config, utils) {
            _config.module ??= {};
            _config.module.rules = [
              ...(_config.module.rules ?? []),
              {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                loader: "builtin:swc-loader",
                options: createSwcOptions("typescript", true),
                type: "javascript/auto",
              },
              {
                test: /\.(png|jpe?g|gif|webp|ico)$/i,
                type: "asset",
                parser: {
                  dataUrlCondition: {
                    maxSize: 4 * 1024, // 4kb -> base64
                  },
                },
              },
              {
                test: /\.(woff2?|ttf|eot)$/i,
                type: "asset/resource",
              },
            ];
            _config.optimization ??= {};
            _config.optimization.runtimeChunk = {
              name: (entry) => `runtime-${entry.name}`,
            };

            extraSetup?.(_config, utils);
          },
        },
      };
};

const electronPlugin = (electronOutDir: string): RsbuildPlugin => ({
  name: "plugin-electron",
  setup(api) {
    const environments = Object.keys(
      api.getRsbuildConfig()?.environments || {},
    );
    const hasWeb = ["preload", "renderer"].every((env) =>
      environments.includes(env),
    );
    if (!hasWeb) {
      if (api.context.action === "dev") {
        if (
          !environments.includes("preload") &&
          environments.includes("renderer")
        ) {
          logger.warn(
            "'preload' environment is missing, you may want to add it.",
          );
        } else if (
          !environments.includes("renderer") &&
          environments.includes("preload")
        ) {
          logger.warn(
            "'renderer' environment is missing, 'preload' environment will not work without it.",
          );
        }
      }
    }

    api.transform({ test: /\.[cm]?[jt]sx?$/ }, ({ code }) =>
      transformCode(code),
    );

    api.modifyRsbuildConfig((config) => ({
      ...config,
      dev: {
        ...config.dev,
        cliShortcuts: false,
      },
      server: {
        ...config.server,
        port: 3020,
        host: "localhost",
        printUrls: false,
        open: false,
        historyApiFallback: true,
      },
    }));

    if (api.context.action === "build") {
      api.onBeforeBuild(async () => {
        logger.info("Cleaning dist directory...");
        await Promise.all([
          fs.promises.rm(electronOutDir, { recursive: true, force: true }),
        ]).catch(() => {});
      });

      api.onAfterBuild(buildElectron(electronOutDir));
    } else if (api.context.action === "dev") {
      let isFirstMainCompiled = false;
      let isFirstPreloadCompiled = false;
      let isFirstRendererCompiled = false;
      api.onAfterEnvironmentCompile(
        ({ environment, isFirstCompile, stats }) => {
          if (isFirstCompile) {
            if (environment.name === "main") isFirstMainCompiled = true;
            if (environment.name === "preload") isFirstPreloadCompiled = true;
            if (environment.name === "renderer") isFirstRendererCompiled = true;
            if (
              isFirstMainCompiled &&
              ((hasWeb && isFirstPreloadCompiled && isFirstRendererCompiled) ||
                !hasWeb)
            ) {
              return startElectron(stats?.compilation.startTime);
            }

            return;
          }

          if (environment.name === "main" || environment.name === "preload") {
            if (stats?.hasErrors()) return;

            restartElectron(
              stats?.compilation.startTime,
              `${environment.name} recompiled`,
            );
          }
        },
      );
    }
  },
});

export {
  createEnvConfig,
  createSwcOptions,
  electronPlugin,
  externals,
  getNodeCompatRules,
  transformCode,
};
