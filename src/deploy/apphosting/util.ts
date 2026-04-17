import * as archiver from "archiver";
import * as fs from "fs";
import * as path from "path";
import * as tar from "tar";
import * as tmp from "tmp";
import { FirebaseError } from "../../error";
import { AppHostingSingle } from "../../firebaseConfig";
import * as fsAsync from "../../fsAsync";
import * as experiments from "../../experiments";

import { APPHOSTING_YAML_FILE_REGEX } from "../../apphosting/config";

/**
 * Creates a temporary tarball of the project source or build artifacts.
 *
 * This function packages the specified directory into a `.tar.gz` file, respecting
 * ignore patterns (like `.git`, `firebase-debug.log`, etc.). It is used to prepare
 * the code/artifacts for upload to Google Cloud Storage.
 * @param config - The App Hosting backend configuration.
 * @param rootDir - The root directory of the project.
 * @param targetSubDir - Optional subdirectory to simplify (e.g. if we only want to zip 'dist').
 * @return A promise that resolves to the absolute path of the created temporary tarball.
 */
export async function createLocalBuildTarArchive(
  config: AppHostingSingle,
  rootDir: string,
  targetSubDir?: string,
): Promise<string> {
  const tmpFile = tmp.fileSync({ prefix: `${config.backendId}-`, postfix: ".tar.gz" }).name;

  const isAppHostingDir =
    targetSubDir === ".apphosting" ||
    (!!targetSubDir && path.basename(targetSubDir) === ".apphosting");
  const targetDir = targetSubDir
    ? path.isAbsolute(targetSubDir)
      ? targetSubDir
      : path.join(rootDir, targetSubDir)
    : rootDir;
  const ignore = ["firebase-debug.log", "firebase-debug.*.log", ".git"];

  let archiveCwd = rootDir;
  let pathsToPack: string[];

  if (isAppHostingDir) {
    // create temporary directory to bundle things flattened
    const tempDir = tmp.dirSync({ unsafeCleanup: true }).name;
    fs.cpSync(targetDir, tempDir, { recursive: true });

    const rootPackageJson = path.join(rootDir, "package.json");
    if (fs.existsSync(rootPackageJson)) {
      fs.copyFileSync(rootPackageJson, path.join(tempDir, "package.json"));
    }
    const rootFiles = fs.readdirSync(rootDir);
    for (const file of rootFiles) {
      if (APPHOSTING_YAML_FILE_REGEX.test(file)) {
        fs.copyFileSync(path.join(rootDir, file), path.join(tempDir, file));
      }
    }

    const rdrFiles = await fsAsync.readdirRecursive({
      path: tempDir,
      ignore: ignore,
      isGitIgnore: false,
    });
    pathsToPack = rdrFiles.map((rdrf) => path.relative(tempDir, rdrf.name));
    archiveCwd = tempDir;
  } else {
    const rdrFiles = await fsAsync.readdirRecursive({
      path: targetDir,
      ignore: ignore,
      isGitIgnore: !targetSubDir, // Disable gitignore if we are anchored to a build output subdirectory
    });
    pathsToPack = rdrFiles.map((rdrf) => path.relative(rootDir, rdrf.name));

    if (targetSubDir) {
      const defaultFiles = fs.readdirSync(rootDir).filter((file) => {
        return APPHOSTING_YAML_FILE_REGEX.test(file);
      });
      for (const file of defaultFiles) {
        const relativePath = path.relative(rootDir, path.join(rootDir, file));
        if (!pathsToPack.includes(relativePath)) {
          pathsToPack.push(relativePath);
        }
      }
    }
  }

  try {
    fs.statSync(archiveCwd);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      throw new FirebaseError(`Could not read directory "${archiveCwd}"`);
    }
    throw err;
  }
  if (!pathsToPack.length) {
    throw new FirebaseError(
      `Cannot create a tar archive with 0 files from directory "${archiveCwd}"`,
    );
  }

  await tar.create(
    {
      gzip: true,
      file: tmpFile,
      cwd: archiveCwd,
      portable: true,
    },
    pathsToPack,
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
  const ignore = config.ignore || ["node_modules", ".git"];
  ignore.push("firebase-debug.log", "firebase-debug.*.log");
  const gitIgnorePatterns = parseGitIgnorePatterns(targetDir);
  ignore.push(...gitIgnorePatterns);
  try {
    const files = await fsAsync.readdirRecursive({
      path: targetDir,
      ignore: ignore,
      isGitIgnore: true,
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
      `Could not read source directory. Remove links and shortcuts and try again. Original: ${err}`,
      { original: err as Error, exit: 1 },
    );
  }
  return tmpFile;
}

function parseGitIgnorePatterns(projectRoot: string, gitIgnorePath = ".gitignore"): string[] {
  const absoluteFilePath = path.resolve(projectRoot, gitIgnorePath);
  if (!fs.existsSync(absoluteFilePath)) {
    return [];
  }
  const lines = fs
    .readFileSync(absoluteFilePath)
    .toString() // Buffer -> string
    .split("\n") // split into lines
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("#") && !(line === "")); // remove comments and empty lines
  return lines;
}

async function pipeAsync(from: archiver.Archiver, to: fs.WriteStream): Promise<void> {
  from.pipe(to);
  await from.finalize();
  return new Promise((resolve, reject) => {
    to.on("finish", resolve);
    to.on("error", reject);
  });
}
