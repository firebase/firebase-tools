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
import * as track from "../track";
import { Constants } from "./constants";
import { EmulatorInfo, EmulatorInstance, EmulatorLog, Emulators } from "./types";
import * as chokidar from "chokidar";

import * as spawn from "cross-spawn";
import { spawnSync } from "child_process";
import {
  EmulatedTriggerDefinition,
  EmulatedTriggerMap,
  FunctionsRuntimeBundle,
  FunctionsRuntimeFeatures,
  getFunctionRegion,
  getTriggersFromDirectory,
} from "./functionsEmulatorShared";
import { EmulatorRegistry } from "./registry";
import { EventEmitter } from "events";
import * as stream from "stream";

const EVENT_INVOKE = "functions:invoke";

const SERVICE_FIRESTORE = "firestore.googleapis.com";

interface FunctionsEmulatorArgs {
  port?: number;
  host?: string;
  disabledRuntimeFeatures?: FunctionsRuntimeFeatures;
}

interface RequestWithRawBody extends express.Request {
  rawBody: string;
}

// FunctionsRuntimeInstance is the handler for a running function invocation
export interface FunctionsRuntimeInstance {
  // A promise which is fulfilled when the runtime is ready to accept requests
  ready: Promise<void>;
  // A map of arbitrary data from the runtime (ports, etc)
  metadata: { [key: string]: any };
  // An emitter which sends our EmulatorLog events from the runtime.
  events: EventEmitter;
  // A promise which is fulfilled when the runtime has exited
  exit: Promise<number>;
  // A function to manually kill the child process
  kill: (signal?: string) => void;
}

export class FunctionsEmulator implements EmulatorInstance {
  static getHttpFunctionUrl(port: number, projectId: string, name: string, region: string): string {
    return `http://localhost:${port}/${projectId}/${region}/${name}`;
  }

  private readonly port: number;
  private readonly projectId: string = "";

  private server?: http.Server;
  private firebaseConfig: any;
  private functionsDir: string = "";
  private nodeBinary: string = "";
  private knownTriggerIDs: { [triggerId: string]: boolean } = {};

  constructor(private options: any, private args: FunctionsEmulatorArgs) {
    this.port = this.args.port || Constants.getDefaultPort(Emulators.FUNCTIONS);
    this.projectId = getProjectId(this.options, false);
  }

  async start(): Promise<void> {
    this.functionsDir = path.join(
      this.options.config.projectDir,
      this.options.config.get("functions.source")
    );

    this.nodeBinary = await askInstallNodeVersion(this.functionsDir);

    // TODO: This call requires authentication, which we should remove eventually
    this.firebaseConfig = await functionsConfig.getFirebaseConfig(this.options);

    const hub = express();

    hub.use((req, res, next) => {
      // Allow CORS to facilitate easier testing.
      // Source: https://enable-cors.org/server_expressjCannot understand what targets to deploys.html
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

    // The URL for the function that the other emulators (Firestore, etc) use.
    // TODO(abehaskins): Make the other emulators use the route below and remove this.
    const internalRoute = "/functions/projects/:project_id/triggers/:trigger_name";

    // The URL that the developer sees, this is the same URL that the legacy emulator used.
    const externalRoute = `/:project_id/:region/:trigger_name`;

    // A trigger named "foo" needs to respond at "foo" as well as "foo/*" but not "fooBar".
    const functionRoutes = [
      internalRoute,
      `${internalRoute}/*`,
      externalRoute,
      `${externalRoute}/*`,
    ];

    // Define a common handler function to use for GET and POST requests.
    const handler: express.RequestHandler = async (req, res) => {
      const method = req.method;
      const triggerName = req.params.trigger_name;

      logger.debug(`[functions] ${method} request to function ${triggerName} accepted.`);

      const reqBody = (req as RequestWithRawBody).rawBody;
      const proto = reqBody ? JSON.parse(reqBody) : undefined;

      const runtime = this.startFunctionRuntime(triggerName, proto);

      runtime.events.on("log", (el: EmulatorLog) => {
        if (el.level === "FATAL") {
          res.send(el.text);
        }
      });

      // This "waiter" must be established before we block on "ready" since we expect
      // this log entry to happen during the readying.
      const triggerLogPromise = waitForLog(runtime.events, "SYSTEM", "triggers-parsed");

      logger.debug(`[functions] Waiting for runtime to be ready!`);
      await runtime.ready;
      logger.debug(JSON.stringify(runtime.metadata));

      const triggerLog = await triggerLogPromise;
      const triggerMap: EmulatedTriggerMap = triggerLog.data.triggers;

      const trigger = triggerMap[triggerName];
      const isHttpsTrigger = trigger.definition.httpsTrigger ? true : false;

      // Log each invocation and the service type.
      if (isHttpsTrigger) {
        track(EVENT_INVOKE, "https");
      } else {
        const service: string = _.get(trigger.definition, "eventTrigger.service", "unknown");
        track(EVENT_INVOKE, service);
      }

      if (!isHttpsTrigger) {
        // Background functions just wait and then ACK
        await runtime.exit;
        return res.json({ status: "acknowledged" });
      }

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
          function forwardStatusAndHeaders(): void {
            res.status(runtimeRes.statusCode || 200);
            if (!res.headersSent) {
              Object.keys(runtimeRes.headers).forEach((key) => {
                const val = runtimeRes.headers[key];
                if (val) {
                  res.setHeader(key, val);
                }
              });
            }
          }

          runtimeRes.on("data", (buf) => {
            forwardStatusAndHeaders();
            res.write(buf);
          });

          runtimeRes.on("close", () => {
            forwardStatusAndHeaders();
            res.end();
          });

          runtimeRes.on("end", () => {
            forwardStatusAndHeaders();
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
    };

    hub.get(functionRoutes, handler);
    hub.post(functionRoutes, handler);

    this.server = hub.listen(this.port);
  }

  startFunctionRuntime(triggerName: string, proto?: any): FunctionsRuntimeInstance {
    const runtimeBundle: FunctionsRuntimeBundle = {
      ports: {
        firestore: EmulatorRegistry.getPort(Emulators.FIRESTORE),
      },
      proto,
      cwd: this.functionsDir,
      triggerId: triggerName,
      projectId: this.projectId,
      disabled_features: this.args.disabledRuntimeFeatures,
    };

    const runtime = InvokeRuntime(this.nodeBinary, runtimeBundle);
    runtime.events.on("log", this.handleRuntimeLog.bind(this));
    return runtime;
  }

  handleSystemLog(systemLog: EmulatorLog): void {
    switch (systemLog.type) {
      case "runtime-status":
        if (systemLog.text === "killed") {
          utils.logWarning(`Your function was killed because it raised an unhandled error.`);
        }
        break;
      case "googleapis-network-access":
        utils.logWarning(
          `Google API requested!\n   - URL: "${
            systemLog.data.href
          }"\n   - Be careful, this may be a production service.`
        );
        break;
      case "unidentified-network-access":
        utils.logWarning(`Unknown network resource requested!\n   - URL: "${systemLog.data.href}"`);
        break;
      case "functions-config-missing-value":
        utils.logWarning(
          `Non-existent functions.config() value requested!\n   - Path: "${
            systemLog.data.valuePath
          }"\n   - Learn more at https://firebase.google.com/docs/functions/local-emulator`
        );
        break;
      case "default-admin-app-used":
        utils.logWarning(`Default "firebase-admin" instance created!`);
        break;
      case "non-default-admin-app-used":
        utils.logWarning(
          `Non-default "firebase-admin" instance created!\n   ` +
            `- This instance will *not* be mocked and will access production resources.`
        );
        break;
      case "missing-module":
        utils.logWarning(
          `The Cloud Functions emulator requires the module "${
            systemLog.data.name
          }" to be installed as a ${
            systemLog.data.isDev ? "development dependency" : "dependency"
          }. To fix this, run "npm install ${systemLog.data.isDev ? "--save-dev" : "--save"} ${
            systemLog.data.name
          }" in your functions directory.`
        );
        break;
      case "uninstalled-module":
        utils.logWarning(
          `The Cloud Functions emulator requires the module "${
            systemLog.data.name
          }" to be installed. This package is in your package.json, but it's not available. \
You probably need to run "npm install" in your functions directory.`
        );
        break;
      case "out-of-date-module":
        utils.logWarning(
          `The Cloud Functions emulator requires the module "${
            systemLog.data.name
          }" to be version >${systemLog.data.minVersion}.0.0 so your version is too old. \
You can probably fix this by running "npm install ${
            systemLog.data.name
          }@latest" in your functions directory.`
        );
        break;
      case "missing-package-json":
        utils.logWarning(
          `The Cloud Functions directory you specified does not have a "package.json" file, so we can't load it.`
        );
        break;
      case "missing-package-json":
        utils.logWarning(
          `The Cloud Functions directory you specified does not have a "package.json" file, so we can't load it.`
        );
        break;
      case "admin-not-initialized":
        utils.logWarning(
          "The Firebase Admin module has not been initialized early enough. Make sure you run " +
            '"admin.initializeApp()" outside of any function and at the top of your code'
        );
        break;
      default:
      // Silence
    }
  }

  handleRuntimeLog(log: EmulatorLog, ignore: string[] = []): void {
    if (ignore.indexOf(log.level) >= 0) {
      return;
    }
    switch (log.level) {
      case "SYSTEM":
        this.handleSystemLog(log);
        break;
      case "USER":
        logger.info(`${clc.blackBright("> ")} ${log.text}`);
        break;
      case "DEBUG":
        logger.debug(log.text);
        break;
      case "INFO":
        utils.logLabeledBullet("functions", log.text);
        break;
      case "WARN":
        utils.logWarning(log.text);
        break;
      case "FATAL":
        utils.logWarning(log.text);
        break;
      default:
        logger.info(`${log.level}: ${log.text}`);
        break;
    }
  }

  async connect(): Promise<void> {
    utils.logLabeledBullet("functions", `Watching "${this.functionsDir}" for Cloud Functions...`);

    const watcher = chokidar.watch(this.functionsDir, {
      ignored: [
        /(^|[\/\\])\../ /* Ignore files which begin the a period */,
        /.+\.log/ /* Ignore files which have a .log extension */,
      ],
      persistent: true,
    });

    const diagnosticBundle: FunctionsRuntimeBundle = {
      cwd: this.functionsDir,
      projectId: this.projectId,
      triggerId: "",
      ports: {},
      disabled_features: this.args.disabledRuntimeFeatures,
    };

    // TODO(abehaskins): Gracefully handle removal of deleted function definitions
    const loadTriggers = async () => {
      const runtime = InvokeRuntime(this.nodeBinary, diagnosticBundle);

      runtime.events.on("log", (el: EmulatorLog) => {
        this.handleRuntimeLog(el);
      });

      const triggerParseEvent = await waitForLog(runtime.events, "SYSTEM", "triggers-parsed");
      const triggerDefinitions = triggerParseEvent.data
        .triggerDefinitions as EmulatedTriggerDefinition[];

      const toSetup = triggerDefinitions.filter(
        (definition) => !this.knownTriggerIDs[definition.name]
      );

      for (const definition of toSetup) {
        if (definition.httpsTrigger) {
          // TODO(samstern): Right now we only emulate each function in one region, but it's possible
          //                 that a developer is running the same function in multiple regions.
          const region = getFunctionRegion(definition);
          const url = FunctionsEmulator.getHttpFunctionUrl(
            this.port,
            this.projectId,
            definition.name,
            region
          );
          utils.logLabeledBullet("functions", `HTTP trigger initialized at ${clc.bold(url)}`);
        } else {
          const service: string = _.get(definition, "eventTrigger.service", "unknown");
          switch (service) {
            case SERVICE_FIRESTORE:
              await this.addFirestoreTrigger(this.projectId, definition);
              break;
            default:
              logger.debug(`Unsupported trigger: ${JSON.stringify(definition)}`);
              utils.logWarning(
                `Ignoring trigger "${
                  definition.name
                }" because the service "${service}" is not yet supported.`
              );
              break;
          }
        }
        this.knownTriggerIDs[definition.name] = true;
      }
    };

    const debouncedLoadTriggers = _.debounce(loadTriggers, 1000);
    watcher.on("change", (filePath) => {
      logger.debug(`File ${filePath} changed, reloading triggers`);
      return debouncedLoadTriggers();
    });

    return loadTriggers();
  }

  addFirestoreTrigger(projectId: string, definition: EmulatedTriggerDefinition): Promise<any> {
    const firestorePort = EmulatorRegistry.getPort(Emulators.FIRESTORE);
    if (!firestorePort) {
      utils.logWarning(
        `Ignoring trigger "${definition.name}" because the Cloud Firestore emulator is not running.`
      );
      return Promise.resolve();
    }

    const bundle = JSON.stringify({ eventTrigger: definition.eventTrigger });
    utils.logLabeledBullet("functions", `Setting up Cloud Firestore trigger "${definition.name}"`);

    return new Promise((resolve, reject) => {
      request.put(
        `http://localhost:${firestorePort}/emulator/v1/projects/${projectId}/triggers/${
          definition.name
        }`,
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
              `Trigger "${definition.name}" has been acknowledged by the Cloud Firestore emulator.`
            );
          }

          resolve();
        }
      );
    });
  }

  async stop(): Promise<void> {
    Promise.resolve(this.server && this.server.close());
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.FUNCTIONS);
    const port = this.args.port || Constants.getDefaultPort(Emulators.FUNCTIONS);

    return {
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.FUNCTIONS;
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
  const runtime = spawn(
    nodeBinary,
    [
      // "--no-warnings",
      path.join(__dirname, "functionsEmulatorRuntime"),
      JSON.stringify(frb),
      opts.serializedTriggers || "",
    ],
    { env: { node: nodeBinary, ...opts.env, ...process.env }, cwd: frb.cwd }
  );

  const buffers: {
    [pipe: string]: {
      pipe: stream.Readable;
      value: string;
    };
  } = { stderr: { pipe: runtime.stderr, value: "" }, stdout: { pipe: runtime.stdout, value: "" } };

  for (const id in buffers) {
    if (buffers.hasOwnProperty(id)) {
      const buffer = buffers[id];
      buffer.pipe.on("data", (buf: Buffer) => {
        buffer.value += buf;
        const lines = buffer.value.split("\n");

        if (lines.length > 1) {
          lines.slice(0, -1).forEach((line: string) => {
            const log = EmulatorLog.fromJSON(line);
            emitter.emit("log", log);

            if (log.level === "FATAL") {
              /*
              Something went wrong, if we don't kill the process it'll wait for timeoutMs.
               */
              emitter.emit("log", new EmulatorLog("SYSTEM", "runtime-status", "killed"));
              runtime.kill();
            }
          });
        }

        buffer.value = lines[lines.length - 1];
      });
    }
  }

  const ready = waitForLog(emitter, "SYSTEM", "runtime-status", (log) => {
    return log.text === "ready";
  }).then((el) => {
    metadata.socketPath = el.data.socketPath;
  });

  return {
    exit: new Promise<number>((resolve) => {
      runtime.on("exit", resolve);
    }),
    ready,
    metadata,
    events: emitter,
    kill: (signal?: string) => {
      runtime.kill(signal);
      emitter.emit("log", new EmulatorLog("SYSTEM", "runtime-status", "killed"));
    },
  };
}

function waitForLog(
  emitter: EventEmitter,
  level: string,
  type: string,
  filter?: (el: EmulatorLog) => boolean
): Promise<EmulatorLog> {
  return new Promise((resolve, reject) => {
    emitter.on("log", (el: EmulatorLog) => {
      const levelTypeMatch = el.level === level && el.type === type;
      let filterMatch = true;
      if (filter) {
        filterMatch = filter(el);
      }

      if (levelTypeMatch && filterMatch) {
        resolve(el);
      }
    });
  });
}

/**
 * Returns the path to a "node" executable to use.
 */
async function askInstallNodeVersion(cwd: string): Promise<string> {
  const pkg = require(path.join(cwd, "package.json"));

  // If the developer hasn't specified a Node to use, inform them that it's an option and use default
  if (!pkg.engines || !pkg.engines.node) {
    utils.logWarning(
      "Your functions directory does not specify a Node version.\n   " +
        "- Learn more at https://firebase.google.com/docs/functions/manage-functions#set_runtime_options"
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

  return process.execPath;
}
