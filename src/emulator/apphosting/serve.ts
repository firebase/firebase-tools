/**
 * Start the App Hosting server.
 * @param options the Firebase CLI options.
 */
import { isIPv4 } from "net";
import { checkListenable } from "../portUtils";
import { wrapSpawn } from "../../init/spawn";
import {discover} from "./utils";

/**
 * Spins up a project locally by running the project's dev command.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function start(options: any): Promise<{ port: number }> {
  let port = options.port;
  while (!(await availablePort(options.host, port))) {
    port += 1;
  }

  serve(options, port);

  return { port };
}

function availablePort(host: string, port: number): Promise<boolean> {
  return checkListenable({
    address: host,
    port,
    family: isIPv4(host) ? "IPv4" : "IPv6",
  });
}

/**
 * Exported for unit testing
 */
export async function serve(options: any, port: string) {
  const { packageManager, framework } = await discover();

  if (!framework) {
    console.log(`unable to find framework`)
    // TODO: Default to standard command that our buildpacks use
  }

  //["run", "dev", "--", "-H", options.host, "-p", port]
  await wrapSpawn(packageManager, devArgs, process.cwd());
}
