import * as fs from "fs-extra";

export function fileExists(path: string): boolean {
  return fs.existsSync(path);
}
