import { pathExists } from "fs-extra";
import { join } from "path";

/**
 *
 * @param dir current app directory
 * @return true or false if Nuxt config file was found in the directory
 */
export async function nuxtConfigFilesExist(dir: string): Promise<boolean> {
  const configFilesExist = await Promise.all([
    pathExists(join(dir, "nuxt.config.js")),
    pathExists(join(dir, "nuxt.config.ts")),
  ]);

  return configFilesExist.some((it) => it);
}
