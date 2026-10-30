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
 * The archive holds `rootDir`'s files. If `rootDir` is a folder in `projectDir`, the .gitignore
 * files above it, up to `projectDir`, apply too, like git applies them to a subfolder.
 */
export async function createSourceDeployArchive(
  config: AppHostingSingle,
  rootDir: string,
  projectDir = rootDir,
): Promise<string> {
  const tmpFile = tmp.fileSync({ prefix: `${config.backendId}-`, postfix: ".zip" }).name;
  const fileStream = fs.createWriteStream(tmpFile, {
    flags: "w",
    encoding: "binary",
  });
  const archive = archiver("zip");

  // We must ignore firebase-debug.log or weird things happen if you're in the public dir when you deploy.
  const ignore = resolveIgnorePatterns(config);
  try {
    const files = await fsAsync.readdirRecursive({
      path: rootDir,
      ignoreStrings: ignore,
      supportGitIgnore: true,
      gitIgnoreRoot: projectDir,
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

/** Where a build runs. */
export interface BuildDirectory {
  /** The directory to upload and build from. */
  dir: string;
  /** The app's folder in `dir`, with forward slashes. Empty if the app is `dir` itself. */
  app: string;
}

/**
 * Returns where to build an app, the way App Hosting decides it. An app in an Nx or Turborepo
 * monorepo builds from the monorepo's root, so that it has the root's lockfile and shared
 * packages. Any other app builds from its own folder. Only folders in the project count.
 */
export function buildDirectory(projectDir: string, rootDir = ""): BuildDirectory {
  const appDir = path.join(projectDir, rootDir);
  if (!isInDirectory(appDir, projectDir)) {
    // The app is outside the project, so don't look for a monorepo above it.
    return { dir: appDir, app: "" };
  }
  // Check the app's folder, then each folder above it, up to the project's root.
  const appPath = path.relative(projectDir, appDir);
  const folders = appPath ? appPath.split(path.sep) : [];
  for (let depth = folders.length; depth >= 0; depth--) {
    const dir = path.join(projectDir, ...folders.slice(0, depth));
    if (MONOREPO_CONFIG_FILES.some((file) => fs.existsSync(path.join(dir, file)))) {
      return { dir, app: folders.slice(depth).join("/") };
    }
  }
  return { dir: appDir, app: "" };
}

/** Returns whether `child` is `parent` or a directory in it. */
export function isInDirectory(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  // path.relative returns an absolute path if there's no relative one, e.g. on another drive.
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function pipeAsync(from: archiver.Archiver, to: fs.WriteStream): Promise<void> {
  from.pipe(to);
  await from.finalize();
  return new Promise((resolve, reject) => {
    to.on("finish", resolve);
    to.on("error", reject);
  });
}
