import { sync } from "glob";

export function listFiles(cwd: string, ignore: string[] = []): string[] {
  return sync("**/*", {
    cwd,
    dot: true,
    follow: true,
    ignore: ["**/firebase-debug.log", "**/firebase-debug.*.log", ".firebase/*"].concat(ignore),
    nodir: true,
    nosort: true,
  });
}
