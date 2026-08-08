import { lstatSync } from "fs";
import { join } from "path";
import { sync } from "glob";

import { logger } from "./logger";

/**
 * Recursively list deployable files under `cwd`.
 *
 * **Security: symlinks are excluded by default.**
 *
 * Hosting deploys take this list, read each entry with `fs.readFile*`
 * (which follows symlinks at the OS layer), and uploads the bytes to a
 * Firebase Hosting site. If the source tree contains a symlink such as
 * `public/leak -> /proc/self/environ` or
 * `public/leak -> ~/.config/gcloud/application_default_credentials.json`,
 * the target's contents would otherwise end up published on a
 * Firebase-hosted public URL.
 *
 * The largest exposure is CI workflows that extract attacker-supplied
 * tarballs into the public directory before invoking `firebase deploy`
 * (e.g. PR-preview deploy actions). Both `glob({ follow: true })` and
 * `glob({ follow: false })` would return symlink-to-file entries in
 * the result (`follow` only controls whether symlinked *directories*
 * are descended into); the explicit `lstatSync` filter below drops
 * symlinks of either kind.
 */
export function listFiles(cwd: string, ignore: string[] = []): string[] {
  const matched = sync("**/*", {
    cwd,
    dot: true,
    follow: false,
    ignore: ["**/firebase-debug.log", "**/firebase-debug.*.log", ".firebase/*"].concat(ignore),
    nodir: true,
    posix: true,
  });
  const out: string[] = [];
  for (const rel of matched) {
    let stats;
    try {
      // `lstat` does NOT follow symlinks, so we can detect them and skip.
      stats = lstatSync(join(cwd, rel));
    } catch {
      // Stat error: skip the entry rather than risk uploading something
      // we can't classify.
      continue;
    }
    if (stats.isSymbolicLink()) {
      logger.debug(
        `[hosting] dropping symlink \`${rel}\` from upload list ` +
          `(security: prevents symlink-following from exposing files outside the source tree)`,
      );
      continue;
    }
    out.push(rel);
  }
  return out;
}
