/**
 * Start the App Hosting server.
 * @param options the Firebase CLI options.
 */
import { isIPv4 } from "net";
import { checkListenable } from "../portUtils";
import { EmulatorLogger } from "../../emulator/emulatorLogger";
import { Emulators } from "../types";
import { wrapSpawn } from "../../init/spawn";

const logger = EmulatorLogger.forEmulator(Emulators.APPHOSTING);

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

export async function serve(options: any, port: string) {
  // TODO: update to support other package managers and frameworks other than NextJS
  await wrapSpawn("npm", ["run", "dev", "--", `-H`, options.host, `-p`, port], process.cwd());
}
