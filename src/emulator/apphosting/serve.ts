/**
 * Start the App Hosting server.
 * @param options the Firebase CLI options.
 */
import { spawn } from "cross-spawn";
import { isIPv4 } from "net";
import { checkListenable } from "../portUtils";
import { EmulatorLogger } from "../../emulator/emulatorLogger";
import { Emulators } from "../types";
import { wrapSpawn } from "../../init/spawn";

const logger = EmulatorLogger.forEmulator(Emulators.APPHOSTING);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function start(options: any): Promise<{ port: number }> {
  // const config = read in env variables / secrets etc and other config stuff from firebase.json

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
  console.log(`current working directory: ${process.cwd()}`);
  const host = new Promise<string>(async (resolve, reject) => {
    const serve = await wrapSpawn(
      "npm",
      ["run", "dev", "--", `-H`, options.host, `-p`, port],
      process.cwd(),
    );
    // serve.on("error", function (err) {
    //   console.log("error: " + JSON.stringify(err));
    // });
    // serve.stdout.on("data", (data: any) => {
    //   process.stdout.write(data);
    //   const match = data.toString().match(/(http:\/\/localhost:\d+)/);
    //   if (match) resolve(match[1]);
    // });
    // serve.stderr.on("data", (data: any) => {
    //   process.stderr.write(data);
    // });
    // serve.on("exit", reject);
  });

  return host;
}
