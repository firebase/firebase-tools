import * as projectConfig from "../../../functions/projectConfig";
import * as tmp from "tmp";
import * as fs from "fs";
import { readdirRecursive } from "../../../fsAsync";
import * as path from "path";
import { getSourceHash } from "../cache/hash";
import { findWorkspacePackages, PackageJson } from "./findWorkspacePackages";
import { convertToSortedKeyValueArray } from "../prepareFunctionsUpload";

const CONFIG_DEST_FILE = ".runtimeconfig.json";

/**
 *
 */
export async function prepareSource(
  sourceDir: string,
  config: projectConfig.ValidatedSingle,
  runtimeConfig: any
) {
  const tmpDir = tmp.tmpNameSync({ prefix: "firebase-functions-" });
  // We must ignore firebase-debug.log or weird things happen if
  // you're in the public dir when you deploy.
  // We ignore any CONFIG_DEST_FILE that already exists, and write another one
  // with current config values into the archive in the "end" handler for reader
  const ignore = config.ignore || ["node_modules", ".git"];
  ignore.push(
    "firebase-debug.log",
    "firebase-debug.*.log",
    CONFIG_DEST_FILE /* .runtimeconfig.json */
  );

  const registry = findWorkspacePackages(path.resolve("./"));
  const internalDepDir = "internal_dependencies" || process.env.FIREBASE_WORKSPACE_DEPENDENCY_DIR;
  const hashes = await copyPackageTo(
    sourceDir,
    tmpDir,
    `${tmpDir}/${internalDepDir}`,
    `./${internalDepDir}/`,
    ignore,
    // Strategy on how to detect if a dependency is a locally linked dependency and should be packaged
    // Returns the path to the dependency or null if it shouldn't be included
    (args) => {
      const internalDependency = registry[args.dependency];
      if (internalDependency) {
        return internalDependency.relativePackageDir;
      }
      return null;
    }
  );
  if (typeof runtimeConfig !== "undefined") {
    // In order for hash to be consistent, configuration object tree must be sorted by key, only possible with arrays.
    const runtimeConfigHashString = JSON.stringify(convertToSortedKeyValueArray(runtimeConfig));
    hashes.push(runtimeConfigHashString);

    const runtimeConfigString = JSON.stringify(runtimeConfig, null, 2);
    fs.writeFileSync(path.join(tmpDir, CONFIG_DEST_FILE), runtimeConfigString, {
      mode: 420 /* 0o644 */,
    });
  }
  return {
    dir: tmpDir,
    hash: hashes.join("."),
  };
}

interface ResolveInternalDependencyArgs {
  source: string;
  dependency: string;
  versionString: string;
}

/**
 *
 */
async function copyPackageTo(
  sourceDir: string,
  target: string,
  internalDependencyDir: string,
  pathRewritePrefix: string,
  ignore: string[],
  resolveInternalDependency: (args: ResolveInternalDependencyArgs) => string | null
): Promise<string[]> {
  fs.mkdirSync(target, { recursive: true });
  const files = await readdirRecursive({ path: sourceDir, ignore: ignore });
  const hashes: string[] = [];
  for (const file of files) {
    const absDest = path.join(target, path.relative(sourceDir, file.name));
    const fileHash = await getSourceHash(file.name);
    hashes.push(fileHash);
    if (!file.name.endsWith("package.json")) {
      const targetDir = absDest.slice(0, absDest.lastIndexOf("/"));
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(file.name, absDest);
    } else {
      const packageJson: PackageJson = JSON.parse(
        fs.readFileSync(file.name, "utf-8")
      ) as PackageJson;
      for (const map of [
        packageJson.dependencies,
        packageJson.devDependencies,
        packageJson.peerDependencies,
        packageJson.optionalDependencies,
      ]) {
        if (!map) {
          continue;
        }
        for (const dep in map) {
          if (!dep) {
            continue;
          }
          const version = map[dep];
          const internal = resolveInternalDependency({
            source: sourceDir,
            dependency: dep,
            versionString: version,
          });
          if (internal) {
            const name = path.basename(internal);
            const internalDependencyTarget = `${internalDependencyDir}/${name}`;
            map[dep] = `file:${pathRewritePrefix}${name}`;
            // Check if the dependency was already copied
            if (!fs.existsSync(internalDependencyTarget)) {
              const childHashes = await copyPackageTo(
                internal,
                internalDependencyTarget,
                internalDependencyDir,
                "../",
                ignore,
                resolveInternalDependency
              );
              hashes.push(...childHashes);
            }
          }
        }
      }
      fs.writeFileSync(absDest, JSON.stringify(packageJson, null, 2), "utf-8");
    }
  }
  return hashes;
}
