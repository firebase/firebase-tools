import * as archiver from "archiver";
import * as fs from "fs";
import * as path from "path";
import * as tar from "tar";
import * as tmp from "tmp";
import { FirebaseError } from "../../error";
import { AppHostingSingle } from "../../firebaseConfig";
import * as fsAsync from "../../fsAsync";

import { APPHOSTING_YAML_FILE_REGEX } from "../../apphosting/config";

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
): Promise<string> {
  const tmpFile = tmp.fileSync({ prefix: `${config.backendId}-`, postfix: ".tar.gz" }).name;

  const filesToPackage = outputFiles.length > 0 ? outputFiles : ["."];
  const allFiles: string[] = [];

  for (const fileOrDir of filesToPackage) {
    const absolutePath = path.join(rootDir, fileOrDir);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      const rdrFiles = await fsAsync.readdirRecursive({
        path: absolutePath,
        ignoreStrings: ["firebase-debug.log", "firebase-debug.*.log"],
        supportGitIgnore: false,
      });
      allFiles.push(...rdrFiles.map((rdrf) => path.relative(rootDir, rdrf.name)));
    } else {
      allFiles.push(path.relative(rootDir, absolutePath));
    }
  }

  const defaultFiles = fs.readdirSync(rootDir).filter((file) => {
    return APPHOSTING_YAML_FILE_REGEX.test(file);
  });
  for (const file of defaultFiles) {
    if (!allFiles.includes(file)) {
      allFiles.push(file);
    }
  }
  const bundleYamlPath = path.join(".apphosting", "bundle.yaml");
  if (fs.existsSync(path.join(rootDir, bundleYamlPath)) && !allFiles.includes(bundleYamlPath)) {
    allFiles.push(bundleYamlPath);
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
async function pipeAsync(from: archiver.Archiver, to: fs.WriteStream): Promise<void> {
  from.pipe(to);
  await from.finalize();
  return new Promise((resolve, reject) => {
    to.on("finish", resolve);
    to.on("error", reject);
  });
}
