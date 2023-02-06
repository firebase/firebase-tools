import { createRequire } from "node:module";
import { pathExists, rm, mkdir, writeFile, readFile } from "fs-extra";
import { join, resolve, dirname, normalize } from "path";
import * as crypto from "crypto";
import type { NuxtProjectManifest } from "./interfaces";

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
 *
 */
export async function rmRecursive(paths: string[]) {
  await Promise.all(
    paths
      .filter((p) => typeof p === "string")
      .map(async (path) => {
        console.debug("Removing recursive path", path);
        await rm(path, { recursive: true, force: true }).catch(() => {});
      })
  );
}

/**
 *
 */
export async function cleanupNuxtDirs(rootDir: string) {
  console.info("Cleaning up generated nuxt files and caches...");

  await rmRecursive(
    [".nuxt", ".output", "dist", "node_modules/.vite", "node_modules/.cache"].map((dir) =>
      resolve(rootDir, dir)
    )
  );
}

/**
 *
 */
export function resolveNuxtManifest(nuxt: any): NuxtProjectManifest {
  const manifest: NuxtProjectManifest = {
    _hash: null,
    project: {
      rootDir: nuxt.options.rootDir,
    },
    versions: {
      nuxt: nuxt._version,
    },
  };
  const hash = crypto.createHash("sha1");
  manifest._hash = hash.update(JSON.stringify(manifest)).digest("hex");
  return manifest;
}

/**
 *
 */
export async function writeNuxtManifest(nuxt: any): Promise<NuxtProjectManifest> {
  const manifest = resolveNuxtManifest(nuxt);
  const manifestPath = resolve(nuxt.options.buildDir, "nuxt.json");
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  return manifest;
}

/**
 *
 */
export async function loadNuxtManifest(buildDir: string): Promise<NuxtProjectManifest | null> {
  const manifestPath = resolve(buildDir, "nuxt.json");
  const manifest: NuxtProjectManifest | null = await readFile(manifestPath, "utf-8")
    .then((data) => JSON.parse(data) as NuxtProjectManifest)
    .catch(() => null);
  return manifest;
}

/**
 *
 */
export async function clearDir(path: string) {
  await rm(path, { recursive: true, force: true });
  await mkdir(path, { recursive: true });
}

/**
 *
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
