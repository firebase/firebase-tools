import * as spawn from "cross-spawn";
import { logger } from "../logger";
import { getErrStack, isObject } from "../error";

/**
 * wrapSpawn is cross platform spawn
 * @param cmd The command to run
 * @param args The args for the command
 * @param projectDir The current working directory to set
 */
export function wrapSpawn(cmd: string, args: string[], projectDir: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const installer = spawn(cmd, args, {
      cwd: projectDir,
      stdio: "inherit",
      env: { ...process.env },
    });

    installer.on("error", (err: unknown) => {
      logger.debug(getErrStack(err));
    });

    installer.on("close", (code) => {
      if (code === 0) {
        return resolve();
      }
      return reject(
        new Error(
          `Error: spawn(${cmd}, [${args.join(", ")}]) \n exited with code: ${code || "null"}`,
        ),
      );
    });
  });
}

/**
 * spawnWithOutput uses cross-spawn to spawn a child process and get
 * the output from it.
 * @param cmd The command to run
 * @param args The arguments for the command
 * @return The stdout string from the command.
 */
export function spawnWithOutput(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);

    let output = "";

    child.stdout?.on("data", (data) => {
      if (isObject(data) && data.toString) {
        output += data.toString();
      } else {
        output += JSON.stringify(data);
      }
    });

    child.stderr?.on("data", (data) => {
      logger.debug(
        `Error: spawn(${cmd}, ${args.join(", ")})\n  Stderr:\n${JSON.stringify(data)}\n`,
      );
    });

    child.on("error", (err: unknown) => {
      logger.debug(getErrStack(err));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(
          new Error(
            `Error: spawn(${cmd}, [${args.join(", ")}]) \n exited with code: ${code || "null"}`,
          ),
        );
      }
    });
  });
}

/**
 * spawnWithCommandString spawns a child process with a command string
 * @param cmd The command to run
 * @param projectDir The directory to run it in
 * @param environmentVariables Environment variables to set
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

    installer.on("error", (err: unknown) => {
      logger.log("DEBUG", getErrStack(err));
    });

    installer.on("close", (code) => {
      if (code === 0) {
        return resolve();
      }
      return reject(new Error(`Error: spawn(${cmd}) \n exited with code: ${code || "null"}`));
    });
  });
}
