import { app, dialog } from "electron";
import log from "electron-log";

export function showErrorDialog(error: ErrorDialogOptions, quit = true) {
  dialog.showErrorBox("An error occurred", error.message);

  if (error?.error instanceof Error) log.error(error);
  if (quit) app.quit();
}

export type ErrorDialogOptions = {
  error?: Error;
  message: string;
};
