import { readJSON as originalReadJSON } from "fs-extra";
import type { ReadOptions } from "fs-extra";
import { join } from "path";
import { readFile } from "fs/promises";
import { isEqual } from "lodash";
import { Discovery, Framework, SupportLevel, WebFrameworks } from ".";

export interface FrameworkStatic {
  bootstrap?: (setup: any) => Promise<void>;
  discover?: (dir: string) => Promise<Discovery | undefined>;
  initialize: (...args: any[]) => Promise<Framework>;
}

type FrameworkDependency = string | {
  name: string,
  version?: string,
  depth?: number,
  omitDev?: boolean,
};

export type FrameworkMetadata = {
  name: string;
  analyticsKey: string;
  support: SupportLevel;
  dependencies?: FrameworkDependency[];
  docsUrl?: string;
  requiredFiles?: string[];
  optionalFiles?: string[];
  parent?: FrameworkStatic;
  defaultBuildScripts?: string[];
  vitePlugins?: string[]; // TODO ensure that this is set only when parent is Vite
  override?: FrameworkStatic[];
}

export function webFramework(config: FrameworkMetadata) {
  return function (constructor: Function & FrameworkStatic) {
    WebFrameworks.push({ ...config, constructor });
  };
}

const keys: Array<[klass: any, deps: any[], weakMapKey: {}]> = [];
const memo = new WeakMap();

export function memoize(...depKeys: string[]) {
  return (target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<any>) => {
    const memozied = (original: any) =>
      function (this: any, ...args: any[]) {
        const deps = [propertyKey, ...depKeys.map((key) => this[key]), ...args];
        const scope = typeof target === "object" && depKeys.length ? this.constructor : this;
        let key = keys.find(
          ([cachedScope, cachedDeps]) => cachedScope === scope && isEqual(cachedDeps, deps)
        )?.[2];
        if (!key) {
          key = {}; // weakmap uses objects as keys
          keys.push([scope, deps, key]);
        }
        const cacheHit = memo.get(key);
        if (cacheHit) return cacheHit;
        const cacheMiss = original.apply(this, ...args);
        memo.set(key, cacheMiss);
        return cacheMiss;
      };
    if ("value" in descriptor) descriptor.value = memozied(descriptor.value);
    if ("get" in descriptor) descriptor.get = memozied(descriptor.get);
    return descriptor;
  };
}

/**
 * Whether the given string starts with http:// or https://
 */
export function isUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}

/**
 * add type to readJSON
 */
export function readJSON<JsonType = any>(
  file: string,
  options?: ReadOptions | BufferEncoding | string
): Promise<JsonType> {
  return originalReadJSON(file, options) as Promise<JsonType>;
}

/**
 * Prints a warning if the build script in package.json
 * contains anything other than allowedBuildScripts.
 */
export async function warnIfCustomBuildScript(
  dir: string,
  framework: string,
  defaultBuildScripts: string[]
): Promise<void> {
  const packageJsonBuffer = await readFile(join(dir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());
  const buildScript = packageJson.scripts?.build;

  if (buildScript && !defaultBuildScripts.includes(buildScript)) {
    console.warn(
      `\nWARNING: Your package.json contains a custom build that is being ignored. Only the ${framework} default build script (e.g, "${defaultBuildScripts[0]}") is respected. If you have a more advanced build process you should build a custom integration https://firebase.google.com/docs/hosting/express\n`
    );
  }
}

export const enum BuildTarget {
  FirebaseHosting = "Firebase Hosting",
}

export interface FirebaseHostingOptions {
  functions: { destinationDir: string };
  hosting: { destinationDir: string };
}
