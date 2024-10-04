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
