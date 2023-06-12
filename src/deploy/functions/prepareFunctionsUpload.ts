import * as archiver from "archiver";
import * as clc from "colorette";
import * as filesize from "filesize";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";

import { FirebaseError } from "../../error";
import { logger } from "../../logger";
import { getSourceHash } from "./cache/hash";
import * as backend from "./backend";
import * as functionsConfig from "../../functionsConfig";
import * as utils from "../../utils";
import * as fsAsync from "../../fsAsync";
import * as projectConfig from "../../functions/projectConfig";
import { readdirRecursive } from "../../fsAsync";
import { join } from "path";

const CONFIG_DEST_FILE = ".runtimeconfig.json";

interface PackagedSourceInfo {
  pathToSource: string;
  hash: string;
}

type SortedConfig = string | { key: string; value: SortedConfig }[];

// TODO(inlined): move to a file that's not about uploading source code
/**
 *
 */
export async function getFunctionsConfig(projectId: string): Promise<Record<string, unknown>> {
  try {
    return await functionsConfig.materializeAll(projectId);
  } catch (err: any) {
    logger.debug(err);
    let errorCode = err?.context?.response?.statusCode;
    if (!errorCode) {
      logger.debug("Got unexpected error from Runtime Config; it has no status code:", err);
      errorCode = 500;
    }
    if (errorCode === 500 || errorCode === 503) {
      throw new FirebaseError(
        "Cloud Runtime Config is currently experiencing issues, " +
          "which is preventing your functions from being deployed. " +
          "Please wait a few minutes and then try to deploy your functions again." +
          "\nRun `firebase deploy --except functions` if you want to continue deploying the rest of your project."
      );
    }
  }
  return {};
}

async function pipeAsync(from: archiver.Archiver, to: fs.WriteStream) {
  from.pipe(to);
  await from.finalize();
  return new Promise((resolve, reject) => {
    to.on("finish", resolve);
    to.on("error", reject);
  });
}

async function prepareSource(
  sourceDir: string,
  config: projectConfig.ValidatedSingle,
  runtimeConfig: any
) {
  const tmpDir = tmp.dirSync({ prefix: "firebase-functions-" });
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
  const internalDepDir = "internal_dependencies";
  const hashes = await copyPackageTo(
    sourceDir,
    tmpDir.name,
    `${tmpDir.name}/${internalDepDir}`,
    `./${internalDepDir}/`,
    (args) => {
      if (args.versionString.startsWith("workspace:")) {
        return join(args.source, "node_modules", args.dependency);
      }
      return null;
    }
  );
  if (typeof runtimeConfig !== "undefined") {
    // In order for hash to be consistent, configuration object tree must be sorted by key, only possible with arrays.
    const runtimeConfigHashString = JSON.stringify(convertToSortedKeyValueArray(runtimeConfig));
    hashes.push(runtimeConfigHashString);

    const runtimeConfigString = JSON.stringify(runtimeConfig, null, 2);
    fs.writeFileSync(path.join(tmpDir.name, CONFIG_DEST_FILE), runtimeConfigString, {
      mode: 420 /* 0o644 */,
    });
  }
  return {
    dir: tmpDir.name,
    hash: hashes.join("."),
  };
}

async function packageSource(
  sourceDir: string,
  config: projectConfig.ValidatedSingle,
  runtimeConfig: any
): Promise<PackagedSourceInfo | undefined> {
  const { hash, dir } = await prepareSource(sourceDir, config, runtimeConfig);
  const tmpFile = tmp.fileSync({ name: `${path.basename(dir)}.zip` }).name;
  const fileStream = fs.createWriteStream(tmpFile, {
    flags: "w",
    encoding: "binary",
  });
  const archive = archiver("zip");
  archive.directory(dir, false);
  await pipeAsync(archive, fileStream);

  utils.logBullet(
    clc.cyan(clc.bold("functions:")) +
      " packaged " +
      clc.bold(sourceDir) +
      " (" +
      filesize(archive.pointer()) +
      ") for uploading"
  );
  return { pathToSource: tmpFile, hash };
}

interface ResolveInternalDependency {
  source: string;
  dependency: string;
  versionString: string;
}

/**
 *
 */
async function copyPackageTo(
  sourcePackage: string,
  target: string,
  internalDependencyDir: string,
  pathRewritePrefix: string,
  resolveInternalDependency: (args: ResolveInternalDependency) => string | null
): Promise<string[]> {
  if (fs.existsSync(target)) {
    return [];
  }
  fs.mkdirSync(target, { recursive: true });
  const files = await readdirRecursive({ path: sourcePackage });
  const hashes: string[] = [];
  for (const file of files) {
    const absSource = path.join(sourcePackage, file.name);
    const absDest = path.join(target, file.name);
    const fileHash = await getSourceHash(file.name);
    hashes.push(fileHash);
    if (file.name !== "package.json") {
      const targetDir = absDest.slice(0, absDest.lastIndexOf("/"));
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(absSource, absDest);
    } else {
      const packageJson: PackageJson = JSON.parse(
        fs.readFileSync(absSource, "utf-8")
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
            source: sourcePackage,
            dependency: dep,
            versionString: version,
          });
          if (internal) {
            const name = path.basename(internal);
            map[dep] = `file:${pathRewritePrefix}${name}`;
            const childHashes = await copyPackageTo(
              internal,
              `${internalDependencyDir}/${name}`,
              internalDependencyDir,
              "../",
              resolveInternalDependency
            );
            hashes.push(...childHashes);
          }
        }
      }
      fs.writeFileSync(absDest, JSON.stringify(packageJson, null, 2), "utf-8");
    }
  }
  return hashes;
}

/**
 *
 */
export async function prepareFunctionsUpload(
  sourceDir: string,
  config: projectConfig.ValidatedSingle,
  runtimeConfig?: backend.RuntimeConfigValues
): Promise<PackagedSourceInfo | undefined> {
  return packageSource(sourceDir, config, runtimeConfig);
}

/**
 *
 */
export function convertToSortedKeyValueArray(config: any): SortedConfig {
  if (typeof config !== "object" || config === null) return config;

  return Object.keys(config)
    .sort()
    .map((key) => {
      return { key, value: convertToSortedKeyValueArray(config[key]) };
    });
}

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
