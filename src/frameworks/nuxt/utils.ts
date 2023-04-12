import { createRequire } from "node:module";
import { pathExists, rm, mkdir } from "fs-extra";
import { join, dirname, normalize } from "path";

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

/**
 * clear directory and create it again
 * @param path directory path
 */
export async function clearDir(path: string) {
  await rm(path, { recursive: true, force: true });
  await mkdir(path, { recursive: true });
}

/**
 * get paths for modules
 */
export function getModulePaths(paths?: string | string[]): string[] {
  return ([] as Array<string | undefined>)
    .concat(
      // @ts-expect-error global object
      global.__NUXT_PREPATHS__,
      paths,
      process.cwd(),
      // @ts-expect-error global object
      global.__NUXT_PATHS__
    )
    .filter(Boolean) as string[];
}

const _require = createRequire(process.cwd());

/**
 *
 */
export function resolveModule(id: string, paths?: string | string[]) {
  return normalize(_require.resolve(id, { paths: getModulePaths(paths) }));
}

/**
 *
 */
export function requireModule(id: string, paths?: string | string[]) {
  return _require(resolveModule(id, paths));
}

/**
 *
 */
export function getNearestPackage(id: string, paths?: string | string[]) {
  while (dirname(id) !== id) {
    try {
      return requireModule(id + "/package.json", paths);
    } catch {}
    id = dirname(id);
  }
  return null;
}

export const overrideEnv = (targetEnv: string) => {
  const currentEnv = process.env.NODE_ENV;
  if (currentEnv && currentEnv !== targetEnv) {
    console.warn(
      `Changing \`NODE_ENV\` from \`${currentEnv}\` to \`${targetEnv}\`, to avoid unintended behavior.`
    );
  }
  // @ts-ignore
  process.env.NODE_ENV = targetEnv;
};
