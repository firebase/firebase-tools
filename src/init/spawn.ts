import * as spawn from "cross-spawn";
import { logger } from "../logger";

export function wrapSpawn(
  cmd: string,
  args: string[],
  projectDir: string,
  environmentVariables?: any,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const installer = spawn(cmd, args, {
      cwd: projectDir,
      stdio: "inherit",
      env: { ...process.env, ...environmentVariables },
    });

    installer.on("error", (err: any) => {
      logger.debug(err.stack);
    });

    installer.on("close", (code) => {
      if (code === 0) {
        return resolve();
      }
      return reject();
    });
  });
}

/**
 * Spawn a child process with a command string.
 */
export function spawnWithCommandString(
  cmd: string,
  projectDir: string,
  environmentVariables?: Record<string, string>,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const installer = spawn(cmd, {
      cwd: projectDir,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...environmentVariables },
    });

    installer.on("error", (err: any) => {
      logger.log("DEBUG", err.stack);
    });

    installer.on("close", (code) => {
      if (code === 0) {
        return resolve();
      }
      return reject();
    });
  });
}
