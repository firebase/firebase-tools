import * as fs from "fs";
import * as path from "path";
import { logger } from "../../../../logger";

/**
 * Encapsulates the logic of dynamically interrogating a strict Yarn Plug'n'Play environment
 * to discover the absolute physical path of a given module.
 *
 * In strict Yarn PnP environments (where node_modules does not exist), Yarn downloads
 * dependencies as zipped archives deeply tucked into `.yarn/cache/`. To run Node scripts, Yarn
 * automatically injects `NODE_OPTIONS=--require .pnp.cjs` into the NodeJS boot sequence, which
 * natively monkey-patches Node's `fs` and `require` modules to intercept and resolve absolute paths
 * (even paths ending in `.zip/`) entirely from memory.
 * @param sourceDir the user's source code directory.
 * @param moduleName the package to resolve (e.g. "firebase-functions").
 */
function resolvePnpModulePath(
  sourceDir: string,
  projectDir: string,
  moduleName: string,
): string | undefined {
  try {
    const searchDirs = sourceDir === projectDir ? [sourceDir] : [sourceDir, projectDir];
    for (const searchDir of searchDirs) {
      const pnpHookPath = path.join(searchDir, ".pnp.cjs");
      if (!fs.existsSync(pnpHookPath)) {
        continue;
      }
      // Inline the API types to satisfy TypeScipt and duck-type the PnP Hook.
      interface PnpApi {
        setup?(): void;
        resolveToUnqualified(item: string, dir: string): string | null;
      }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pnpapi = require(pnpHookPath) as PnpApi;

      // Dynamically invoke the setup API if present. This monkeypatches the native fs module
      // in the CLI process to seamlessly support zipped boundaries if the CLI was booted
      // without yarn (e.g., executing `node ../firebase-tools/lib/bin/firebase.js`).
      if (typeof pnpapi.setup === "function") {
        pnpapi.setup();
      }
      const pkgPath = pnpapi.resolveToUnqualified(moduleName, path.join(sourceDir, "package.json"));
      if (pkgPath) {
        return pkgPath;
      }
    }
  } catch (e) {
    logger.debug(
      `resolvePnpModulePath encountered error querying Yarn PnP API for ${moduleName}:`,
      e,
    );
  }
  return undefined;
}

export interface PackageJson {
  name: string;
  version: string;
  bin?: Record<string, string>;
}

/**
 * Returns the path to the PnP resolved package and its parsed package.json if using Yarn PnP with a local `.pnp.cjs` hook and undefined otherwise.
 * @param sourceDir the user's source code directory.
 * @param moduleName the package to resolve (e.g. "firebase-functions").
 */
export function resolvePnpModulePackageJson(
  sourceDir: string,
  projectDir: string,
  moduleName: string,
): { pkgPath: string; packageJson: PackageJson } | undefined {
  // Query the local `.pnp.cjs` hook API to discover the absolute (often zipped) path mapped to the library.
  const pkgPath = resolvePnpModulePath(sourceDir, projectDir, moduleName);
  if (!pkgPath) {
    return undefined;
  }

  const pkgJsonPath = path.join(pkgPath, "package.json");
  // Even if `pkgJsonPath` is technically a `.zip/` path on the OS, these synchronous file lookups
  // succeed natively because the hosting Node process has been monkey-patched by Yarn!
  if (!fs.existsSync(pkgJsonPath)) {
    return undefined;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const packageJson = require(pkgJsonPath) as PackageJson;

    // We self-defined PackageJson interface above, so if the API changes
    // this interface could be wrong. Validate it lightly here.
    if (
      typeof packageJson.name !== "string" ||
      typeof packageJson.version !== "string" ||
      (packageJson.bin && typeof packageJson.bin !== "object")
    ) {
      throw new Error("invalid PackageJson object");
    }

    return { pkgPath, packageJson };
  } catch (e) {
    logger.debug(`Error reading package.json for ${moduleName}:`, e);
    return undefined;
  }
}
