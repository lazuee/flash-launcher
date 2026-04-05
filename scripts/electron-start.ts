import * as childProcess from "node:child_process";
import { logger } from "@rsbuild/core";
import electron from "electron";
import { color, prettyTime } from "./electron-helper";

const ignored = [
  "The default of contextIsolation is deprecated",
  "WebContents was just created with both webviewTag and contextIsolation enabled",
  "ELECTRON_GUEST_VIEW_MANAGER_CALL",
];

let electronProcess: childProcess.ChildProcessWithoutNullStreams | null = null;
let isRestarting = false;
let restartTimer: NodeJS.Timeout | null = null;
let isFirstStart = true;
let signalHandlersRegistered = false;
let startTime: number | null = null;

export const killElectron = (_isRestarting: boolean = true) => {
  if (!electronProcess || electronProcess.killed) return;

  isRestarting = _isRestarting;
  if (isRestarting) restartTimer = null;

  try {
    if (process.platform === "win32" && electronProcess.pid) {
      childProcess.spawn("taskkill", [
        "/pid",
        electronProcess.pid.toString(),
        "/f",
        "/t",
      ]);
    } else {
      electronProcess.kill("SIGTERM");
    }
  } catch (e) {
    logger.warn("failed to kill electron process", e as any);
  }
};

const spawnElectron = (): Promise<void> => {
  electronProcess = childProcess.spawn(electron as unknown as string, ["."], {
    stdio: "pipe",
    windowsHide: false,
  });

  return new Promise<void>((resolve) => {
    electronProcess?.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      const isIgnored = ignored.some((msg) => output.includes(msg));
      if (!isIgnored) {
        process.stdout.write(data);
      }
    });

    electronProcess?.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();
      const isIgnored = ignored.some((msg) => output.includes(msg));
      if (!isIgnored) {
        process.stdout.write(data);
      }
    });

    electronProcess?.on("spawn", () => {
      const timeStr = startTime && prettyTime((Date.now() - startTime) / 1000);
      if (isFirstStart)
        logger.ready(`app started in ${timeStr} ${color.dim("(electron)")}`);
      else
        logger.ready(`app restarted in ${timeStr} ${color.dim("(electron)")}`);
      isFirstStart = false;
      resolve();
    });

    electronProcess?.on("error", (err: unknown) => {
      logger.error(`failed to start the app ${color.dim("(electron)")}:`, err);
    });

    electronProcess?.on("close", (code: number, signal: unknown) => {
      if (isRestarting) {
        setTimeout(() => {
          isRestarting = false;
          spawnElectron();
        }, 200);
        return;
      }

      logger.debug(
        `[electron] process closed (code=${code}, signal=${signal ?? "null"})`,
      );

      if (code === 0) {
        process.exit(0);
      }

      if (code === null) {
        if (signal !== "SIGINT" && signal !== "SIGTERM") {
          logger.debug("[electron] exited with signal", signal);
        }
        process.exit(0);
      }

      logger.debug(`[electron] exited unexpectedly with code ${code}`);
      process.exit(code);
    });
  });
};

const registerSignalHandlers = () => {
  if (signalHandlersRegistered) return;
  signalHandlersRegistered = true;

  const handleTerminationSignal = (signal: NodeJS.Signals) => {
    process.on(signal, () => {
      killElectron(false);
      process.exit(0);
    });
  };

  handleTerminationSignal("SIGINT");
  handleTerminationSignal("SIGTERM");
};

export async function startElectron(compileStartTime?: number) {
  startTime = compileStartTime ? compileStartTime : Date.now();

  registerSignalHandlers();
  await spawnElectron();
}

export function restartElectron(compileStartTime?: number, reason?: string) {
  startTime = compileStartTime ? compileStartTime : Date.now();

  if (!electronProcess) {
    spawnElectron();
    return;
  }

  if (isRestarting || restartTimer) return;

  if (reason) {
    logger.debug(`[electron] restarting app... ${color.dim(`(${reason})`)}`);
  }

  restartTimer = setTimeout(() => {
    killElectron(true);
  }, 300);
}
