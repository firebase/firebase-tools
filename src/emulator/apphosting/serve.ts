/**
 * Start the App Hosting server.
 * @param options the Firebase CLI options.
 */

import { spawn } from "cross-spawn";
import { discoverPackageManager } from "./utils";

/**
 * Spins up a project locally by running the project's dev command.
 */

export async function start(options: any): Promise<{ hostname: string; port: number }> {
  const hostUrl = await serve(options);

  const { hostname, port } = new URL(hostUrl);
  return { hostname, port: +port };
}

/**
 * Exported for unit testing
 */
export async function serve(options: any): Promise<string> {
  const rootDir = process.cwd();
  const packageManager = await discoverPackageManager(rootDir);

  /**
   *  TODO: Should add a timeout here. If the hostUrl cannot be retrieved
   *  the user is probably using an unsupported framework.
   * */

  const hostUrl = new Promise<string>((resolve, reject) => {
    const serve = spawn(packageManager, ["run", "dev"], {
      cwd: rootDir,
    });

    serve.stdout.on("data", (data: any) => {
      process.stdout.write(data);
      const match = data.toString().match(/(http:\/\/.*:\d+)/);
      if (match) resolve(match[1]);
    });
    serve.stderr.on("data", (data: any) => {
      process.stderr.write(data);
    });
    serve.on("exit", reject);
  });

  return await hostUrl;
}
