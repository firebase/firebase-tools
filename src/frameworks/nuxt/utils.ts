import * as fs  from "fs-extra";
import { join } from "path";
import { findDependency } from "../utils.js";

export function getNuxtVersion(cwd: string): string | undefined {
  return findDependency("nuxt", {
    cwd,
    depth: 0,
    omitDev: false,
  })?.version;
}

/**
 *
 * @param dir current app directory
 * @return true or false if Nuxt config file was found in the directory
 */
export async function nuxtConfigFilesExist(dir: string): Promise<boolean> {
  const configFilesExist = await Promise.all([
    fs.pathExists(join(dir, "nuxt.config.js")),
    fs.pathExists(join(dir, "nuxt.config.ts")),
  ]);

  return configFilesExist.some((it) => it);
}
