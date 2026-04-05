import { createRequire } from "node:module";
import path from "node:path";

const importCache: {
  [cacheKey: string]: any;
} = {};

export function requireFrom<T>(id: string, throwError: true): T;
export function requireFrom<T>(id: string, throwError?: false): T | undefined;
export function requireFrom<T>(
  id: string,
  throwError: boolean = true,
): T | undefined {
  try {
    const require = createRequire(import.meta.url);
    importCache[id] ??= require(require.resolve(id));
  } catch {
    if (throwError) {
      throw new Error(`"${id}" must be installed`);
    }
  }

  return importCache[id];
}

export const color = requireFrom<typeof import("picocolors")>(
  "picocolors",
  true,
);

export const prettyTime = (seconds: number): string => {
  const format = (time: string) => color.bold(time);

  if (seconds < 10) {
    const digits = seconds >= 0.01 ? 2 : 3;
    return `${format(seconds.toFixed(digits))} s`;
  }

  if (seconds < 60) {
    return `${format(seconds.toFixed(1))} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const minutesLabel = `${format(minutes.toFixed(0))} m`;
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return minutesLabel;
  }

  const secondsLabel = `${format(
    remainingSeconds.toFixed(remainingSeconds % 1 === 0 ? 0 : 1),
  )} s`;

  return `${minutesLabel} ${secondsLabel}`;
};

export const getAppDir = (
  appOutDir: string,
  productFilename: string,
  platform: string,
) =>
  platform === "darwin"
    ? path.join(
        appOutDir,
        `${productFilename}.app`,
        "Contents",
        "Resources",
        "app",
      )
    : path.join(appOutDir, "resources", "app");

export const getResourcesPath = (
  appOutDir: string,
  productFilename: string,
  platform: string,
) =>
  platform === "darwin"
    ? path.join(appOutDir, `${productFilename}.app`, "Contents", "Resources")
    : path.join(appOutDir, "resources");

export const createAssetFilter = (excludePlatforms: string[]) => [
  "**/*",
  "!icons/icon.png",
  ...excludePlatforms.map((p) => `!icons/${p}`),
  ...excludePlatforms.map((p) => `!plugins/${p}`),
];
