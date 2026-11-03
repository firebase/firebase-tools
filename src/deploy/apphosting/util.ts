import * as archiver from "archiver";
import * as fs from "fs";
import * as path from "path";
import * as tar from "tar";
import * as tmp from "tmp";
import { FirebaseError } from "../../error";
import { logger } from "../../logger";
import { AppHostingSingle } from "../../firebaseConfig";
import * as fsAsync from "../../fsAsync";
import { logLabeledWarning } from "../../utils";
import { CLOUD_RUN_SIZE_LIMIT_BYTES } from "../../apphosting/constants";

/**
 * Creates a temporary tarball of the project source or build artifacts.
 *
 * This function packages the specified directory into a `.tar.gz` file, respecting
 * ignore patterns (like `.git`, `firebase-debug.log`, etc.). It is used to prepare
 * the code/artifacts for upload to Google Cloud Storage.
 * @param config - The App Hosting backend configuration.
 * @param rootDir - The root directory of the project.
 * @param outputFiles - The output files or directories to package.
 * @return A promise that resolves to the absolute path of the created temporary tarball.
 */
export async function createLocalBuildTarArchive(
  config: AppHostingSingle,
  rootDir: string,
  outputFiles: string[],
  sizeLimitBytes: number = CLOUD_RUN_SIZE_LIMIT_BYTES,
): Promise<string> {
  const tmpFile = tmp.fileSync({ prefix: `${config.backendId}-`, postfix: ".tar.gz" }).name;

  const filesToPackage = outputFiles.length > 0 ? outputFiles : ["."];
  const allFiles: string[] = [];

  for (const fileOrDir of filesToPackage) {
    const absolutePath = path.join(rootDir, fileOrDir);
    if (!fs.existsSync(absolutePath)) {
      logLabeledWarning(
        "apphosting",
        `Expected build output file or directory not found: ${fileOrDir}`,
      );
      continue;
    }
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      const rdrFiles = await fsAsync.readdirRecursive({
        path: absolutePath,
        ignoreStrings: ["firebase-debug.log", "firebase-debug.*.log"],
        supportGitIgnore: false,
      });
      for (const rdrf of rdrFiles) {
        allFiles.push(path.relative(rootDir, rdrf.name));
      }
    } else {
      allFiles.push(path.relative(rootDir, absolutePath));
    }
  }

  // `tar` returns a `TypeError` if `allFiles` is empty. Let's check a feww things.
  try {
    fs.statSync(rootDir);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      throw new FirebaseError(`Could not read directory "${rootDir}"`);
    }
    throw err;
  }
  if (!allFiles.length) {
    throw new FirebaseError(`Cannot create a tar archive with 0 files from directory "${rootDir}"`);
  }

  await tar.create(
    {
      gzip: true,
      file: tmpFile,
      cwd: rootDir,
      portable: true,
    },
    allFiles,
  );

  const stats = fs.statSync(tmpFile);
  if (config.localBuild && stats.size > sizeLimitBytes) {
    const sizeInMB = stats.size / (1024 * 1024);
    const limitInMB = sizeLimitBytes / (1024 * 1024);
    logger.warn(
      `The final build artifact is larger than ${limitInMB.toFixed(0)}MB (current size: ${sizeInMB.toFixed(2)}MB). Please reduce the size of your build artifacts.`,
    );
  }

  return tmpFile;
}

/**
 * Locates the source code for a backend and creates an archive to eventually upload to GCS.
 * Based heavily on functions upload logic in src/deploy/functions/prepareFunctionsUpload.ts.
 */
export async function createSourceDeployArchive(
  config: AppHostingSingle,
  rootDir: string,
  targetSubDir?: string,
): Promise<string> {
  const tmpFile = tmp.fileSync({ prefix: `${config.backendId}-`, postfix: ".zip" }).name;
  const fileStream = fs.createWriteStream(tmpFile, {
    flags: "w",
    encoding: "binary",
  });
  const archive = archiver("zip");

  const targetDir = targetSubDir ? path.join(rootDir, targetSubDir) : rootDir;
  // We must ignore firebase-debug.log or weird things happen if you're in the public dir when you deploy.
  const ignore = resolveIgnorePatterns(config);
  try {
    const files = await fsAsync.readdirRecursive({
      path: targetDir,
      ignoreStrings: ignore,
      supportGitIgnore: true,
    });
    for (const file of files) {
      const name = path.relative(rootDir, file.name);
      archive.file(file.name, {
        name,
        mode: file.mode,
      });
    }
    await pipeAsync(archive, fileStream);
  } catch (err: unknown) {
    throw new FirebaseError(
      `Could not read source directory. Remove links and shortcuts and try again. Original: ${String(err)}`,
      { original: err as Error, exit: 1 },
    );
  }
  return tmpFile;
}

/**
 * Resolves the ignore patterns for App Hosting deployments.
 * Merges config ignores and defaults. (.gitignore patterns are handled dynamically by fsAsync.readdirRecursive).
 */
export function resolveIgnorePatterns(
  config: AppHostingSingle,
  skipDefaultNodeModules = false,
): string[] {
  const ignore = config.ignore
    ? [...config.ignore]
    : skipDefaultNodeModules
      ? [".git"]
      : ["node_modules", ".git"];
  ignore.push("firebase-debug.log", "firebase-debug.*.log");
  ignore.push(".local_build_*");
  return ignore;
}

/** Files that mark the root of an Nx or Turborepo monorepo, the monorepos App Hosting supports. */
const MONOREPO_CONFIG_FILES = ["nx.json", "turbo.json"] as const;

/**
 * Where an app builds:
 * - The app folder is the backend's or service's rootDir, the folder with the app's package.json.
 * - The build folder is the folder the build runs in, and what Cloud Run source deploys upload. For
 *   an app in an Nx or Turborepo monorepo, it's the monorepo's root, so the build gets the root's
 *   lockfile and shared packages. For any other app, it's the app folder.
 *
 * For example:
 *
 *   my-app/              <- build folder and app folder
 *     firebase.json
 *     package.json
 *     app/
 *
 *   my-project/
 *     firebase.json
 *     functions/
 *     web/               <- build folder and app folder
 *       package.json
 *
 *   my-turborepo/        <- build folder
 *     firebase.json
 *     turbo.json
 *     package.json
 *     apps/
 *       web/             <- app folder
 *         package.json
 */
export interface BuildDirectory {
  /** The build folder's path. */
  buildFolder: string;
  /**
   * The app folder's path in the build folder, with forward slashes, like "apps/web". Empty if the
   * app folder is the build folder.
   */
  appFolder: string;
}

/**
 * Finds an app's build folder and app folder (see the examples on BuildDirectory), with the same
 * detection logic as Firebase App Hosting: the build folder is the closest folder at or above the
 * app folder, up to the project's folder, that has nx.json or turbo.json, like my-turborepo/. If
 * there's none, like in my-app/ and my-project/, the app folder is the build folder.
 */
export function buildDirectory(projectDir: string, rootDir = ""): BuildDirectory {
  const appFolderPath = path.join(projectDir, rootDir);
  const appFolderInProject = path.relative(projectDir, appFolderPath);
  if (appFolderInProject.startsWith("..")) {
    throw new FirebaseError(`rootDir "${rootDir}" must be inside the project directory.`);
  }
  // Check the app folder, then each folder above it, up to the project's folder.
  const segments = appFolderInProject ? appFolderInProject.split(path.sep) : [];
  for (let depth = segments.length; depth >= 0; depth--) {
    const folder = path.join(projectDir, ...segments.slice(0, depth));
    if (MONOREPO_CONFIG_FILES.some((file) => fs.existsSync(path.join(folder, file)))) {
      return { buildFolder: folder, appFolder: segments.slice(depth).join("/") };
    }
  }
  return { buildFolder: appFolderPath, appFolder: "" };
}

async function pipeAsync(from: archiver.Archiver, to: fs.WriteStream): Promise<void> {
  from.pipe(to);
  await from.finalize();
  return new Promise((resolve, reject) => {
    to.on("finish", resolve);
    to.on("error", reject);
  });
}
