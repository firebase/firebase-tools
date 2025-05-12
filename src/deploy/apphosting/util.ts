import * as archiver from "archiver";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import { FirebaseError } from "../../error";
import { AppHostingSingle } from "../../firebaseConfig";
import * as fsAsync from "../../fsAsync";
import * as readline from "readline";

/**
 * Locates the source code for a backend and creates an archive to eventually upload to GCS.
 * Based heavily on functions upload logic in src/deploy/functions/prepareFunctionsUpload.ts.
 */
export async function createArchive(
  config: AppHostingSingle,
  projectRoot?: string,
): Promise<{ projectSourcePath: string; zippedSourcePath: string }> {
  const tmpFile = tmp.fileSync({ prefix: `${config.backendId}-`, postfix: ".zip" }).name;
  const fileStream = fs.createWriteStream(tmpFile, {
    flags: "w",
    encoding: "binary",
  });
  const archive = archiver("zip");

  // We must ignore firebase-debug.log or weird things happen if you're in the public dir when you deploy.
  const ignore = config.ignore || ["node_modules", ".git"];
  ignore.push("firebase-debug.log", "firebase-debug.*.log");
  const gitIgnorePatterns = await parseGitIgnorePatterns();
  ignore.push(...gitIgnorePatterns);

  if (!projectRoot) {
    projectRoot = process.cwd();
  }
  try {
    const files = await fsAsync.readdirRecursive({ path: projectRoot, ignore: ignore });
    for (const file of files) {
      const name = path.relative(projectRoot, file.name);
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
  return { projectSourcePath: projectRoot, zippedSourcePath: tmpFile };
}

async function parseGitIgnorePatterns(filePath = ".gitignore"): Promise<string[]> {
  const absoluteFilePath: string = path.resolve(filePath);
  return new Promise<string[]>((resolve, reject) => {
    if (!fs.existsSync(absoluteFilePath)) {
      resolve([]);
      return;
    }
    const fileStream: fs.ReadStream = fs.createReadStream(absoluteFilePath);
    const rl: readline.Interface = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });
    const lines: string[] = [];
    rl.on("line", (line: string) => {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("#") || trimmedLine === "") {
        return;
      }
      lines.push(trimmedLine);
    });
    rl.on("close", () => {
      resolve(lines);
    });
    rl.on("error", (err: Error) => {
      console.error(`Error reading lines from file ${absoluteFilePath}:`, err);
      reject(err);
    });
    fileStream.on("error", (err: Error) => {
      console.error(`Error with file stream for ${absoluteFilePath}:`, err);
      reject(err);
    });
  });
}

async function pipeAsync(from: archiver.Archiver, to: fs.WriteStream): Promise<void> {
  from.pipe(to);
  await from.finalize();
  return new Promise((resolve, reject) => {
    to.on("finish", resolve);
    to.on("error", reject);
  });
}
