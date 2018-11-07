import { statSync } from "fs";

export function fileExistsSync(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch (e) {
    return false;
  }
}

export function dirExistsSync(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch (e) {
    return false;
  }
}
