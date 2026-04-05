import { promises } from "node:fs";

export default promises;

export const {
  access,
  copyFile,
  cp,
  open,
  opendir,
  rename,
  truncate,
  rm,
  rmdir,
  mkdir,
  readdir,
  readlink,
  symlink,
  lstat,
  stat,
  link,
  unlink,
  chmod,
  lchmod,
  lchown,
  chown,
  utimes,
  realpath,
  mkdtemp,
  writeFile,
  appendFile,
  readFile,
  watch,
} = promises;
