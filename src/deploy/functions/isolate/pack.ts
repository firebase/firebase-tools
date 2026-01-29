import * as path from "path";
import * as fs from "fs-extra";
import { spawn } from "cross-spawn";
import { FirebaseError } from "../../../error";
import { WorkspacePackage } from "./types";
import { logger } from "../../../logger";

function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 *
 */
export async function packWorkspacePackage(
  pkg: WorkspacePackage,
  outputDir: string,
): Promise<string> {
  fs.ensureDirSync(outputDir);

  try {
    const { stdout } = await runCommand(
      "pnpm",
      ["pack", "--pack-destination", outputDir],
      pkg.absoluteDir,
    );

    const tarballName = stdout.trim().split("\n").pop()!;
    const tarballPath = path.isAbsolute(tarballName)
      ? tarballName
      : path.join(outputDir, path.basename(tarballName));

    if (!fs.existsSync(tarballPath)) {
      const files = fs.readdirSync(outputDir);
      const tgzFile = files.find((f) => f.endsWith(".tgz"));
      if (tgzFile) {
        return path.join(outputDir, tgzFile);
      }
      throw new FirebaseError(`Failed to find packed tarball for ${pkg.name} in ${outputDir}`);
    }

    return tarballPath;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FirebaseError(`Failed to pack workspace package ${pkg.name}: ${message}`);
  }
}

/**
 *
 */
export async function unpackTarball(tarballPath: string, destDir: string): Promise<void> {
  fs.ensureDirSync(destDir);

  try {
    await runCommand("tar", ["-xzf", tarballPath, "--strip-components=1", "-C", destDir], destDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FirebaseError(`Failed to unpack tarball ${tarballPath}: ${message}`);
  }
}

/**
 *
 */
export async function packAndExtract(
  pkg: WorkspacePackage,
  workspacesDir: string,
): Promise<string> {
  const tempDir = path.join(workspacesDir, ".tmp-pack");
  fs.ensureDirSync(tempDir);

  try {
    const tarballPath = await packWorkspacePackage(pkg, tempDir);
    const destDir = path.join(workspacesDir, pkg.name.replace(/^@/, "").replace(/\//g, "-"));

    await unpackTarball(tarballPath, destDir);

    fs.removeSync(tarballPath);

    logger.debug(`Packed and extracted ${pkg.name} to ${destDir}`);
    return destDir;
  } finally {
    if (fs.existsSync(tempDir)) {
      const remainingFiles = fs.readdirSync(tempDir);
      if (remainingFiles.length === 0) {
        fs.removeSync(tempDir);
      }
    }
  }
}
