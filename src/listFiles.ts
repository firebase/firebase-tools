import * as glob from "glob";

export function listFiles(cwd: string, ignore: string[]) {
  return glob.sync("**/*", {
    cwd,
    dot: true,
    follow: true,
    ignore: ["**/firebase-debug.log", ".firebase/*"].concat(ignore || []),
    nodir: true,
    nosort: true,
  });
}
