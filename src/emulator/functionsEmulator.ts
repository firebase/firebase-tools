import * as _ from "lodash";
import * as path from "path";
import * as express from "express";
import * as request from "request";
import * as clc from "cli-color";
import * as http from "http";

import * as getProjectId from "../getProjectId";
import * as functionsConfig from "../functionsConfig";
import * as utils from "../utils";
import * as logger from "../logger";
import { Constants } from "./constants";
import { EmulatorInstance, EmulatorLog, Emulators } from "./types";
import * as prompt from "../prompt";

import * as spawn from "cross-spawn";
import { spawnSync } from "child_process";
import { FunctionsRuntimeBundle, getTriggersFromDirectory } from "./functionsEmulatorShared";
import { EmulatorRegistry } from "./registry";
import { EventEmitter } from "events";

const SERVICE_FIRESTORE = "firestore.googleapis.com";
const SUPPORTED_SERVICES = [SERVICE_FIRESTORE];

interface FunctionsEmulatorArgs {
  port?: number;
  host?: string;
}

interface RequestWithRawBody extends express.Request {
  rawBody: string;
}

type FunctionsRuntimeMode = "BACKGROUND" | "HTTPS";

export interface FunctionsRuntimeInstance {
  exit: Promise<number>;
  ready: Promise<void>;
  metadata: { [key: string]: any };
  events: EventEmitter;
}

export class FunctionsEmulator implements EmulatorInstance {
  private port: number = Constants.getDefaultPort(Emulators.FUNCTIONS);
  private server: any;
  private firebaseConfig: any;
  private projectId: string = "";
  private functionsDir: string = "";

  constructor(private options: any, private args: FunctionsEmulatorArgs) {}

  async start(): Promise<void> {
    if (this.args.port) {
      this.port = this.args.port;
    }

    this.projectId = getProjectId(this.options, false);
    this.functionsDir = path.join(
      this.options.config.projectDir,
      this.options.config.get("functions.source")
    );

    const nodeBinary = await _askInstallNodeVersion(this.functionsDir);

    // TODO: This call requires authentication, which we should remove eventually
    this.firebaseConfig = await functionsConfig.getFirebaseConfig(this.options);

    const hub = express();

    hub.use((req, res, next) => {
      // Allow CORS to facilitate easier testing.
      // Source: https://enable-cors.org/server_expressjs.html
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

      let data = "";
      req.on("data", (chunk: any) => {
        data += chunk;
      });
      req.on("end", () => {
        (req as RequestWithRawBody).rawBody = data;
        next();
      });
    });

    hub.get("/", async (req, res) => {
      res.send(
        JSON.stringify(
          await getTriggersFromDirectory(this.projectId, this.functionsDir, this.firebaseConfig),
          null,
          2
        )
      );
    });

    // The full trigger URL for the function
    const functionRoute = "/functions/projects/:project_id/triggers/:trigger_name";

    // A short URL, convenient for local testing
    // TODO(abehaskins): Come up with something more permanent here
    const shortFunctionRoute = "/f/p/:project_id/t/:trigger_name";

    // A URL for compatibility with test scripts that used the old functions emulator.
    // TODO(samstern): Get the function's actual region, do not hardcode us-central.
    const oldFunctionRoute = `/:project_id/us-central1/:trigger_name`;

    // A trigger named "foo" needs to respond at "foo" as well as "foo/*" but not "fooBar".
    const functionRoutes = [
      functionRoute,
      `${functionRoute}/*`,
      shortFunctionRoute,
      `${shortFunctionRoute}/*`,
      oldFunctionRoute,
    ];

    // Define a common handler function to use for GET and POST requests.
    const handler: express.RequestHandler = async (req, res) => {
      const method = req.method;
      const triggerName = req.params.trigger_name;

      const triggersByName = await getTriggersFromDirectory(
        this.projectId,
        this.functionsDir,
        this.firebaseConfig
      );
      const trigger = triggersByName[triggerName];

      const isGetRequest = method === "GET";
      const isHttpsTrigger = trigger.definition.httpsTrigger ? true : false;

      if (isGetRequest && !isHttpsTrigger) {
        logger.debug(`[functions] GET request to non-HTTPS function ${triggerName} rejected.`);
        res.json({
          status: "error",
          message: "non-HTTPS trigger must be invoked with POST request",
        });
        return;
      }

      logger.debug(`[functions] ${method} request to function ${triggerName} accepted.`);

      const mode = isHttpsTrigger ? "HTTPS" : "BACKGROUND";
      const reqBody = (req as RequestWithRawBody).rawBody;
      const proto = reqBody ? JSON.parse(reqBody) : undefined;
      const runtime = this.startFunctionRuntime(nodeBinary, triggerName, mode, proto);

      if (isHttpsTrigger) {
        logger.debug(`[functions] Waiting for runtime to be ready!`);
        await runtime.ready;

        logger.debug(
          `[functions] Runtime ready! Sending request! ${JSON.stringify(runtime.metadata)}`
        );

        /*
          We do this instead of just 302'ing because many HTTP clients don't respect 302s so it may cause unexpected
          situations - not to mention CORS troubles and this enables us to use a socketPath (IPC socket) instead of
          consuming yet another port which is probably faster as well.
         */
        const runtimeReq = http.request(
          {
            method,
            path: req.url, // 'url' includes the query params
            headers: req.headers,
            socketPath: runtime.metadata.socketPath,
          },
          (runtimeRes: http.IncomingMessage) => {
            runtimeRes.on("data", (buf) => {
              res.write(buf);
            });

            runtimeRes.on("close", () => {
              res.end();
            });

            runtimeRes.on("end", () => {
              res.end();
            });
          }
        );

        runtimeReq.on("error", () => {
          res.end();
        });

        // If the original request had a body, forward that over the connection.
        // TODO: Why is this not handled by the pipe?
        if (reqBody) {
          runtimeReq.write(reqBody);
          runtimeReq.end();
        }

        // Pipe the incoming request over the socket.
        req
          .pipe(
            runtimeReq,
            { end: true }
          )
          .on("error", () => {
            res.end();
          });

        await runtime.exit;
      } else {
        // Background functions just wait and then ACK
        await runtime.exit;
        res.json({ status: "acknowledged" });
      }
    };

    hub.get(functionRoutes, handler);
    hub.post(functionRoutes, handler);

    this.server = hub.listen(this.port);
  }

  startFunctionRuntime(
    nodeBinary: string,
    triggerName: string,
    mode: FunctionsRuntimeMode,
    proto?: any
  ): FunctionsRuntimeInstance {
    const runtimeBundle: FunctionsRuntimeBundle = {
      mode,
      ports: {
        firestore: EmulatorRegistry.getPort(Emulators.FIRESTORE),
      },
      proto,
      cwd: this.functionsDir,
      triggerId: triggerName,
      projectId: this.projectId,
    };

    const runtime = InvokeRuntime(nodeBinary, runtimeBundle);
    runtime.events.on("log", this.logRuntimeEvent);
    return runtime;
  }

  logRuntimeEvent(log: EmulatorLog): void {
    switch (log.level) {
      case "SYSTEM":
        // Ignore these for now...
        break;
      case "USER":
        logger.info(`${clc.blackBright("> ")} ${log.text}`);
        break;
      case "DEBUG":
        logger.debug(log.text);
        break;
      case "INFO":
        utils.logLabeledBullet("functions", log.text);
      default:
        logger.info(`${log.level}: ${log.text}`);
        break;
    }
  }

  async connect(): Promise<void> {
    const triggersByName = await getTriggersFromDirectory(
      this.projectId,
      this.functionsDir,
      this.firebaseConfig
    );

    const triggerNames = Object.keys(triggersByName);
    for (const name of triggerNames) {
      const trigger = triggersByName[name];

      if (trigger.definition.httpsTrigger) {
        const url = this.getHttpFunctionUrl(name);
        utils.logLabeledBullet("functions", `HTTP trigger initialized at ${clc.bold(url)}`);
      } else {
        const service: string = _.get(trigger.definition, "eventTrigger.service", "unknown");
        switch (service) {
          case SERVICE_FIRESTORE:
            await this.addFirestoreTrigger(this.projectId, name, trigger);
            break;
          default:
            logger.debug(`Unsupported trigger: ${JSON.stringify(trigger)}`);
            utils.logWarning(
              `Ignoring trigger "${name}" because the service "${service}" is not yet supported.`
            );
            break;
        }
      }
    }
  }

  getHttpFunctionUrl(name: string): string {
    return `http://localhost:${this.port}/f/p/${this.projectId}/t/${name}`;
  }

  addFirestoreTrigger(projectId: string, name: string, trigger: any): Promise<any> {
    const firestorePort = EmulatorRegistry.getPort(Emulators.FIRESTORE);
    if (firestorePort <= 0) {
      utils.logWarning(`Ignoring trigger "${name}" because the Firestore emulator is not running.`);
      return Promise.resolve();
    }

    const bundle = JSON.stringify({ eventTrigger: trigger.definition.eventTrigger });
    utils.logLabeledBullet("functions", `Setting up firestore trigger "${name}"`);

    utils.logLabeledBullet(
      "functions",
      `Attempting to contact firestore emulator on port ${firestorePort}`
    );

    return new Promise((resolve, reject) => {
      request.put(
        `http://localhost:${firestorePort}/emulator/v1/projects/${projectId}/triggers/${name}`,
        {
          body: bundle,
        },
        (err, res, body) => {
          if (err) {
            utils.logWarning("Error adding trigger: " + err);
            reject();
            return;
          }

          if (JSON.stringify(JSON.parse(body)) === "{}") {
            utils.logLabeledSuccess(
              "functions",
              `Trigger "${name}" has been acknowledged by the firestore emulator.`
            );
          }

          resolve();
        }
      );
    });
  }

  stop(): Promise<void> {
    return Promise.resolve(this.server.close());
  }
}

export function InvokeRuntime(
  nodeBinary: string,
  frb: FunctionsRuntimeBundle,
  opts?: { serializedTriggers?: string; env?: { [key: string]: string } }
): FunctionsRuntimeInstance {
  opts = opts || {};

  const emitter = new EventEmitter();
  const metadata: { [key: string]: any } = {};
  let readyResolve: (value?: void | PromiseLike<void>) => void;
  const ready = new Promise<void>((resolve) => (readyResolve = resolve));

  const runtime = spawn(
    nodeBinary,
    [
      path.join(__dirname, "functionsEmulatorRuntime.js"),
      JSON.stringify(frb),
      opts.serializedTriggers || "",
    ],
    { env: opts.env || {} }
  );

  const buffers: { [pipe: string]: string } = { stderr: "", stdout: "" };
  for (const pipe in buffers) {
    if (buffers.hasOwnProperty(pipe)) {
      (runtime as any)[pipe].on("data", (buf: Buffer) => {
        buffers[pipe] += buf;
        const lines = buffers[pipe].split("\n");

        if (lines.length > 1) {
          lines.slice(0, -1).forEach((line: string) => {
            const log = EmulatorLog.fromJSON(line);
            emitter.emit("log", log);

            if (log.level === "SYSTEM" && log.type === "runtime-status" && log.text === "ready") {
              metadata.socketPath = log.data.socketPath;
              readyResolve();
            }
          });
        }

        buffers[pipe] = lines[lines.length - 1];
      });
    }
  }

  return {
    exit: new Promise<number>((resolve, reject) => {
      runtime.on("exit", (code) => {
        if (code === 0) {
          resolve(code);
        } else {
          reject(buffers.stderr);
        }
      });
    }),
    ready,
    metadata,
    events: emitter,
  };
}

/**
 * Returns the path to a "node" executable to use.
 */
async function _askInstallNodeVersion(cwd: string): Promise<string> {
  const pkg = require(path.join(cwd, "package.json"));

  // If the developer hasn't specified a Node to use, inform them that it's an option and use default
  if (!pkg.engines || !pkg.engines.node) {
    utils.logWarning(
      "Your functions directory does not specify a Node version. " +
        "Learn more https://firebase.google.com/docs/functions/manage-functions#set_runtime_options"
    );
    return process.execPath;
  }

  const hostMajorVersion = process.versions.node.split(".")[0];
  const requestedMajorVersion = pkg.engines.node;
  let localMajorVersion = "0";
  const localNodePath = path.join(cwd, "node_modules/.bin/node");

  // Next check if we have a Node install in the node_modules folder
  try {
    const localNodeOutput = spawnSync(localNodePath, ["--version"]).stdout.toString();
    localMajorVersion = localNodeOutput.slice(1).split(".")[0];
  } catch (err) {
    // Will happen if we haven't asked about local version yet
  }

  // If the requested version is the same as the host, let's use that
  if (requestedMajorVersion === hostMajorVersion) {
    utils.logLabeledSuccess("functions", `Using node@${requestedMajorVersion} from host.`);
    return process.execPath;
  }

  // If the requested version is already locally available, let's use that
  if (localMajorVersion === requestedMajorVersion) {
    utils.logLabeledSuccess("functions", `Using node@${requestedMajorVersion} from local cache.`);
    return localNodePath;
  }

  /*
    Otherwise we'll begin the conversational flow to install the correct version locally
   */

  utils.logWarning(
    `Your requested "node" version "${requestedMajorVersion}" doesn't match your global version "${hostMajorVersion}"`
  );
  utils.logBullet(
    `We can install node@${requestedMajorVersion} to "node_modules" without impacting your global "node" install`
  );
  const response = await prompt({}, [
    {
      name: "node_install",
      type: "confirm",
      message: ` Would you like to setup Node ${requestedMajorVersion} for these functions?`,
      default: true,
    },
  ]);

  // If they say yes, install their requested major version locally
  if (response.node_install) {
    await spawnSync("npm", ["install", `node@${requestedMajorVersion}`, "--save-dev"], {
      cwd,
      stdio: "inherit",
    });
    // TODO(abehaskins): Switching Node versions can result in node-gyp errors, run a rebuild after switching
    //                   versions and probably on exit to original node version
    // TODO(abehaskins): Certain npm commands appear to mess up npm globally, maybe
    //                   remove node_modules/.bin/node to avoid this?

    return localNodePath;
  }

  // If they say no, just warn them about using host version and continue on.
  utils.logWarning(`Using node@${requestedMajorVersion} from host.`);

  return process.execPath;
}
