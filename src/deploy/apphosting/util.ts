import * as archiver from "archiver";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import { FirebaseError } from "../../error";
import { AppHostingSingle } from "../../firebaseConfig";
import * as fsAsync from "../../fsAsync";

/**
 * Locates the source code for a backend and creates an archive to eventually upload to GCS.
 * Based heavily on functions upload logic in src/deploy/functions/prepareFunctionsUpload.ts.
 */
export async function createArchive(
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
      "Could not read source directory. Remove links and shortcuts and try again.",
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
