const morgan = require("morgan");
import { isIPv4 } from "net";
import { server as superstatic } from "superstatic";
import * as clc from "colorette";

import { detectProjectRoot } from "../detectProjectRoot";
import { FirebaseError } from "../error";
import { implicitInit, TemplateServerResponse } from "../hosting/implicitInit";
import { initMiddleware } from "../hosting/initMiddleware";
import * as config from "../hosting/config";
import cloudRunProxy from "../hosting/cloudRunProxy";
import { functionsProxy } from "../hosting/functionsProxy";
import { Writable } from "stream";
import { EmulatorLogger } from "../emulator/emulatorLogger";
import { Emulators } from "../emulator/types";
import { createDestroyer } from "../utils";
import { requireHostingSite } from "../requireHostingSite";
import { getProjectId } from "../projectUtils";
import { checkListenable } from "../emulator/portUtils";
import { IncomingMessage, ServerResponse } from "http";

let destroyServer: undefined | (() => Promise<void>) = undefined;

const logger = EmulatorLogger.forEmulator(Emulators.HOSTING);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function startServer(options: any, config: any, port: number, init: TemplateServerResponse): void {
  const firebaseMiddleware = initMiddleware(init);

  const morganStream = new Writable();
  // eslint-disable-next-line @typescript-eslint/unbound-method
  morganStream._write = (
    chunk: any,
    encoding: string,
    callback: (error?: Error | null) => void,
  ) => {
    if (chunk instanceof Buffer) {
      logger.logLabeled("BULLET", "hosting", chunk.toString().trim());
    }

    callback();
  };

  const morganMiddleware = morgan("combined", {
    stream: morganStream,
  });

  const after = options.frameworksDevModeHandle && {
    files: options.frameworksDevModeHandle,
  };

  const server = superstatic({
    debug: false,
    port: port,
    hostname: options.host,
    config: config,
    compression: true,
    cwd: detectProjectRoot(options) || undefined,
    stack: "strict",
    before: {
      files: (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
        // We do these in a single method to ensure order of operations
        morganMiddleware(req, res, () => null);
        firebaseMiddleware(req, res, next);
      },
    },
    after,
    rewriters: {
      function: functionsProxy(options),
      run: cloudRunProxy(options),
    },
  }).listen(() => {
    const siteName = config.target || config.site;
    const label = siteName ? "hosting[" + siteName + "]" : "hosting";

    if (config.public && config.public !== ".") {
      logger.logLabeled("BULLET", label, "Serving hosting files from: " + clc.bold(config.public));
    }
    logger.logLabeled(
      "SUCCESS",
      label,
      "Local server: " + clc.underline(clc.bold("http://" + options.host + ":" + port)),
    );
  });

  destroyServer = createDestroyer(server);

  server.on("error", (err: Error) => {
    logger.log("DEBUG", `Error from superstatic server: ${err.stack || ""}`);
    throw new FirebaseError(
      `An error occurred while starting the hosting development server:\n\n${err.message}`,
    );
  });
}

/**
 * Stop the Hosting server.
 */
export function stop(): Promise<void> {
  return destroyServer ? destroyServer() : Promise.resolve();
}

/**
 * Start the Hosting server.
 * @param options the Firebase CLI options.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function start(options: any): Promise<{ ports: number[] }> {
  const init = await implicitInit(options);
  // N.B. Originally we didn't call this method because it could try to resolve
  // targets and cause us to fail. But we might be calling prepareFrameworks,
  // which modifies the cached result of config.hostingConfig. So if we don't
  // call this, we won't get web frameworks. But we might need to change this
  // as well to avoid validation errors.
  // But hostingConfig tries to resolve targets and a customer might not have
  // site/targets defined
  if (!options.site) {
    try {
      await requireHostingSite(options);
    } catch {
      if (init.json) {
        options.site = JSON.parse(init.json).projectId;
      } else {
        options.site = getProjectId(options) || "site";
      }
    }
  }
  const configs = config.hostingConfig(options);

  // We never want to try and take port 5001 because Functions likes that port
  // quite a bit, and we don't want to make Functions mad.
  const assignedPorts = new Set<number>([5001]);
  for (let i = 0; i < configs.length; i++) {
    // skip over the functions emulator ports to avoid breaking changes
    let port = i === 0 ? options.port : options.port + 4 + i;
    while (assignedPorts.has(port) || !(await availablePort(options.host, port))) {
      port += 1;
    }
    assignedPorts.add(port);
    startServer(options, configs[i], port, init);
  }

  // We are not actually reserving 5001, so remove it from our set before
  // returning.
  assignedPorts.delete(5001);
  return { ports: Array.from(assignedPorts) };
}

/**
 * Connect the Hosting server.
 */
export async function connect(): Promise<void> {
  await Promise.resolve();
}

function availablePort(host: string, port: number): Promise<boolean> {
  return checkListenable({
    address: host,
    port,
    family: isIPv4(host) ? "IPv4" : "IPv6",
  });
}
