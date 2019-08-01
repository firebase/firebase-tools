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
import { ChildProcess, spawnSync } from "child_process";
import {
  EmulatedTriggerDefinition,
  EmulatedTriggerMap,
  FunctionsRuntimeBundle,
  FunctionsRuntimeFeatures,
  getFunctionRegion,
  getFunctionService,
} from "./functionsEmulatorShared";
import { EmulatorRegistry } from "./registry";
import { EventEmitter } from "events";
import * as stream from "stream";
import { EmulatorLogger, Verbosity } from "./emulatorLogger";

const EVENT_INVOKE = "functions:invoke";

/*
 * The Realtime Database emulator expects the `path` field in its trigger
 * definition to be relative to the database root. This regex is used to extract
 * that path from the `resource` member in the trigger definition used by the
 * functions emulator.
 */
const DATABASE_PATH_PATTERN = new RegExp("^projects/[^/]+/instances/[^/]+/refs(/.*)$");

export interface FunctionsEmulatorArgs {
  port?: number;
  host?: string;
  quiet?: boolean;
  disabledRuntimeFeatures?: FunctionsRuntimeFeatures;
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

interface RequestWithRawBody extends express.Request {
  rawBody: Buffer;
}

interface TriggerDescription {
  name: string;
  type: string;
  details?: string;
  ignored?: boolean;
}

export class FunctionsEmulator implements EmulatorInstance {
  static getHttpFunctionUrl(
    host: string,
    port: number,
    projectId: string,
    name: string,
    region: string
  ): string {
    return `http://${host}:${port}/${projectId}/${region}/${name}`;
  }

  static createHubServer(
    bundleTemplate: FunctionsRuntimeBundle,
    nodeBinary: string
  ): express.Application {
    const hub = express();

    hub.use((req, res, next) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      req.on("end", () => {
        (req as RequestWithRawBody).rawBody = Buffer.concat(chunks);
        next();
      });
    });

    hub.get("/", async (req, res) => {
      res.json({ status: "alive" });
    });

    // The URL for the function that the other emulators (Firestore, etc) use.
    // TODO(abehaskins): Make the other emulators use the route below and remove this.
    const backgroundFunctionRoute = "/functions/projects/:project_id/triggers/:trigger_name";

    // The URL that the developer sees, this is the same URL that the legacy emulator used.
    const httpsFunctionRoute = `/:project_id/:region/:trigger_name`;

    // A trigger named "foo" needs to respond at "foo" as well as "foo/*" but not "fooBar".
    const httpsFunctionRoutes = [httpsFunctionRoute, `${httpsFunctionRoute}/*`];

    const backgroundHandler = async (req: express.Request, res: express.Response) => {
      const method = req.method;
      const triggerId = req.params.trigger_name;

      EmulatorLogger.log("DEBUG", `Accepted request ${method} ${req.url} --> ${triggerId}`);

      const reqBody = (req as RequestWithRawBody).rawBody;
      const proto = JSON.parse(reqBody.toString());

      const runtime = FunctionsEmulator.startFunctionRuntime(
        bundleTemplate,
        triggerId,
        nodeBinary,
        proto
      );

      runtime.events.on("log", (el: EmulatorLog) => {
        if (el.level === "FATAL") {
          res.send(el.text);
        }
      });

      // This "waiter" must be established before we block on "ready" since we expect
      // this log entry to happen during the readying.
      const triggerLogPromise = waitForLog(runtime.events, "SYSTEM", "triggers-parsed");

      EmulatorLogger.log("DEBUG", `[functions] Waiting for runtime to be ready!`);
      await runtime.ready;
      EmulatorLogger.log("DEBUG", JSON.stringify(runtime.metadata));

      const triggerLog = await triggerLogPromise;
      const triggerMap: EmulatedTriggerMap = triggerLog.data.triggers;

      const trigger = triggerMap[triggerId];
      const service = getFunctionService(trigger.definition);
      track(EVENT_INVOKE, service);

      await runtime.exit;
      return res.json({ status: "acknowledged" });
    };

    // Define a common handler function to use for GET and POST requests.
    const httpsHandler: express.RequestHandler = async (
      req: express.Request,
      res: express.Response
    ) => {
      const method = req.method;
      const triggerId = req.params.trigger_name;

      logger.debug(`Accepted request ${method} ${req.url} --> ${triggerId}`);

      const reqBody = (req as RequestWithRawBody).rawBody;

      const runtime = FunctionsEmulator.startFunctionRuntime(bundleTemplate, triggerId, nodeBinary);

      runtime.events.on("log", (el: EmulatorLog) => {
        if (el.level === "FATAL") {
          res.status(500).send(el.text);
        }
      });

      await runtime.ready;
      logger.debug(JSON.stringify(runtime.metadata));
      track(EVENT_INVOKE, "https");

      EmulatorLogger.log(
        "DEBUG",
        `[functions] Runtime ready! Sending request! ${JSON.stringify(runtime.metadata)}`
      );

      // We do this instead of just 302'ing because many HTTP clients don't respect 302s so it may cause unexpected
      // situations - not to mention CORS troubles and this enables us to use a socketPath (IPC socket) instead of
      // consuming yet another port which is probably faster as well.
      const runtimeReq = http.request(
        {
          method,
          path: req.url || "/",
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

    // The ordering here is important. The longer routes (background)
    // need to be registered first otherwise the HTTP functions consume
    // all events.
    hub.post(backgroundFunctionRoute, backgroundHandler);
    hub.all(httpsFunctionRoutes, httpsHandler);
    return hub;
  }

  static startFunctionRuntime(
    bundleTemplate: FunctionsRuntimeBundle,
    triggerId: string,
    nodeBinary: string,
    proto?: any,
    runtimeOpts?: InvokeRuntimeOpts
  ): FunctionsRuntimeInstance {
    const runtimeBundle: FunctionsRuntimeBundle = {
      ...bundleTemplate,
      ports: {
        firestore: EmulatorRegistry.getPort(Emulators.FIRESTORE),
        database: EmulatorRegistry.getPort(Emulators.DATABASE),
      },
      proto,
      triggerId,
    };

    const runtime = InvokeRuntime(nodeBinary, runtimeBundle, runtimeOpts || {});
    runtime.events.on("log", FunctionsEmulator.handleRuntimeLog.bind(this));
    return runtime;
  }

  static handleSystemLog(systemLog: EmulatorLog): void {
    switch (systemLog.type) {
      case "runtime-status":
        if (systemLog.text === "killed") {
          EmulatorLogger.log(
            "WARN",
            `Your function was killed because it raised an unhandled error.`
          );
        }
        break;
      case "googleapis-network-access":
        EmulatorLogger.log(
          "WARN",
          `Google API requested!\n   - URL: "${
            systemLog.data.href
          }"\n   - Be careful, this may be a production service.`
        );
        break;
      case "unidentified-network-access":
        EmulatorLogger.log(
          "WARN",
          `Unknown network resource requested!\n   - URL: "${systemLog.data.href}"`
        );
        break;
      case "functions-config-missing-value":
        EmulatorLogger.log(
          "WARN",
          `Non-existent functions.config() value requested!\n   - Path: "${
            systemLog.data.valuePath
          }"\n   - Learn more at https://firebase.google.com/docs/functions/local-emulator`
        );
        break;
      case "non-default-admin-app-used":
        EmulatorLogger.log(
          "WARN",
          `Non-default "firebase-admin" instance created!\n   ` +
            `- This instance will *not* be mocked and will access production resources.`
        );
        break;
      case "missing-module":
        EmulatorLogger.log(
          "WARN",
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
        EmulatorLogger.log(
          "WARN",
          `The Cloud Functions emulator requires the module "${
            systemLog.data.name
          }" to be installed. This package is in your package.json, but it's not available. \
You probably need to run "npm install" in your functions directory.`
        );
        break;
      case "out-of-date-module":
        EmulatorLogger.log(
          "WARN",
          `The Cloud Functions emulator requires the module "${
            systemLog.data.name
          }" to be version >${systemLog.data.minVersion}.0.0 so your version is too old. \
You can probably fix this by running "npm install ${
            systemLog.data.name
          }@latest" in your functions directory.`
        );
        break;
      case "missing-package-json":
        EmulatorLogger.log(
          "WARN",
          `The Cloud Functions directory you specified does not have a "package.json" file, so we can't load it.`
        );
        break;
      case "function-code-resolution-failed":
        EmulatorLogger.log("WARN", systemLog.data.error);
        const helper = ["We were unable to load your functions code. (see above)"];
        if (systemLog.data.isPotentially.wrong_directory) {
          helper.push(`   - There is no "package.json" file in your functions directory.`);
        }
        if (systemLog.data.isPotentially.typescript) {
          helper.push(
            "   - It appears your code is written in Typescript, which must be compiled before emulation."
          );
        }
        if (systemLog.data.isPotentially.uncompiled) {
          helper.push(
            `   - You may be able to run "npm run build" in your functions directory to resolve this.`
          );
        }
        utils.logWarning(helper.join("\n"));
      default:
      // Silence
    }
  }

  static handleRuntimeLog(log: EmulatorLog, ignore: string[] = []): void {
    if (ignore.indexOf(log.level) >= 0) {
      return;
    }
    switch (log.level) {
      case "SYSTEM":
        FunctionsEmulator.handleSystemLog(log);
        break;
      case "USER":
        EmulatorLogger.log("USER", `${clc.blackBright("> ")} ${log.text}`);
        break;
      case "DEBUG":
        if (log.data && log.data !== {}) {
          EmulatorLogger.log("DEBUG", `[${log.type}] ${log.text} ${JSON.stringify(log.data)}`);
        } else {
          EmulatorLogger.log("DEBUG", `[${log.type}] ${log.text}`);
        }
        break;
      case "INFO":
        EmulatorLogger.logLabeled("BULLET", "functions", log.text);
        break;
      case "WARN":
        EmulatorLogger.logLabeled("WARN", "functions", log.text);
        break;
      case "FATAL":
        EmulatorLogger.logLabeled("WARN", "functions", log.text);
        break;
      default:
        EmulatorLogger.log("INFO", `${log.level}: ${log.text}`);
        break;
    }
  }

  readonly projectId: string = "";
  nodeBinary: string = "";

  private server?: http.Server;
  private functionsDir: string = "";
  private triggers: EmulatedTriggerDefinition[] = [];
  private knownTriggerIDs: { [triggerId: string]: boolean } = {};

  constructor(private options: any, private args: FunctionsEmulatorArgs) {
    this.projectId = getProjectId(this.options, false);

    this.functionsDir = path.join(
      this.options.config.projectDir,
      this.options.config.get("functions.source")
    );

    // TODO: Would prefer not to have static state but here we are!
    EmulatorLogger.verbosity = this.args.quiet ? Verbosity.QUIET : Verbosity.DEBUG;
  }

  async start(): Promise<void> {
    this.nodeBinary = await this.askInstallNodeVersion(this.functionsDir);
    const { host, port } = this.getInfo();
    this.server = FunctionsEmulator.createHubServer(this.getBaseBundle(), this.nodeBinary).listen(
      port,
      host
    );
  }

  async connect(): Promise<void> {
    EmulatorLogger.logLabeled(
      "BULLET",
      "functions",
      `Watching "${this.functionsDir}" for Cloud Functions...`
    );

    const watcher = chokidar.watch(this.functionsDir, {
      ignored: [
        /.+?[\\\/]node_modules[\\\/].+?/, // Ignore node_modules
        /(^|[\/\\])\../, // Ignore files which begin the a period
        /.+\.log/, // Ignore files which have a .log extension
      ],
      persistent: true,
    });

    // TODO(abehaskins): Gracefully handle removal of deleted function definitions
    const loadTriggers = async () => {
      /*
      When a user changes their code, we need to look for triggers defined in their updates sources.
      To do this, we spin up a "diagnostic" runtime invocation. In other words, we pretend we're
      going to invoke a cloud function in the emulator, but stop short of actually running a function.
      Instead, we set up the environment and catch a special "triggers-parsed" log from the runtime
      then exit out.

      A "diagnostic" FunctionsRuntimeBundle looks just like a normal bundle except functionId == "".
       */
      const runtime = InvokeRuntime(this.nodeBinary, this.getBaseBundle());

      runtime.events.on("log", (el: EmulatorLog) => {
        FunctionsEmulator.handleRuntimeLog(el);
      });

      const triggerParseEvent = await waitForLog(runtime.events, "SYSTEM", "triggers-parsed");
      const triggerDefinitions = triggerParseEvent.data
        .triggerDefinitions as EmulatedTriggerDefinition[];

      const toSetup = triggerDefinitions.filter(
        (definition) => !this.knownTriggerIDs[definition.name]
      );

      this.triggers = triggerDefinitions;

      const triggerResults: TriggerDescription[] = [];

      for (const definition of toSetup) {
        if (definition.httpsTrigger) {
          // TODO(samstern): Right now we only emulate each function in one region, but it's possible
          //                 that a developer is running the same function in multiple regions.
          const region = getFunctionRegion(definition);
          const url = FunctionsEmulator.getHttpFunctionUrl(
            this.getInfo().host,
            this.getInfo().port,
            this.projectId,
            definition.name,
            region
          );

          triggerResults.push({
            name: definition.name,
            type: "http",
            details: url,
          });
        } else {
          const service: string = getFunctionService(definition);
          const result: TriggerDescription = {
            name: definition.name,
            type: Constants.getServiceName(service),
          };

          let added = false;
          switch (service) {
            case Constants.SERVICE_FIRESTORE:
              added = await this.addFirestoreTrigger(this.projectId, definition);
              break;
            case Constants.SERVICE_REALTIME_DATABASE:
              added = await this.addRealtimeDatabaseTrigger(this.projectId, definition);
              break;
            default:
              EmulatorLogger.log("DEBUG", `Unsupported trigger: ${JSON.stringify(definition)}`);
              break;
          }
          result.ignored = !added;
          triggerResults.push(result);
        }

        this.knownTriggerIDs[definition.name] = true;
      }

      const successTriggers = triggerResults.filter((r) => !r.ignored);
      for (const result of successTriggers) {
        const msg = result.details
          ? `${clc.bold(result.type)} function initialized (${result.details}).`
          : `${clc.bold(result.type)} function initialized.`;
        EmulatorLogger.logLabeled("SUCCESS", `functions[${result.name}]`, msg);
      }

      const ignoreTriggers = triggerResults.filter((r) => r.ignored);
      for (const result of ignoreTriggers) {
        const msg = `function ignored because the ${
          result.type
        } emulator does not exist or is not running.`;
        EmulatorLogger.logLabeled("BULLET", `functions[${result.name}]`, msg);
      }
    };

    const debouncedLoadTriggers = _.debounce(loadTriggers, 1000);
    watcher.on("change", (filePath) => {
      EmulatorLogger.log("DEBUG", `File ${filePath} changed, reloading triggers`);
      return debouncedLoadTriggers();
    });

    return loadTriggers();
  }

  addRealtimeDatabaseTrigger(
    projectId: string,
    definition: EmulatedTriggerDefinition
  ): Promise<boolean> {
    const databasePort = EmulatorRegistry.getPort(Emulators.DATABASE);
    if (!databasePort) {
      return Promise.resolve(false);
    }
    if (definition.eventTrigger === undefined) {
      EmulatorLogger.log(
        "WARN",
        `Event trigger "${definition.name}" has undefined "eventTrigger" member`
      );
      return Promise.reject();
    }

    const result: string[] | null = DATABASE_PATH_PATTERN.exec(definition.eventTrigger.resource);
    if (result === null || result.length !== 2) {
      EmulatorLogger.log(
        "WARN",
        `Event trigger "${definition.name}" has malformed "resource" member. ` +
          `${definition.eventTrigger.resource}`
      );
      return Promise.reject();
    }

    const bundle = JSON.stringify({
      name: `projects/${projectId}/locations/_/functions/${definition.name}`,
      path: result[1], // path stored in the first capture group
      event: definition.eventTrigger.eventType,
      topic: `projects/${projectId}/topics/${definition.name}`,
    });

    logger.debug(`addDatabaseTrigger`, JSON.stringify(bundle));
    return new Promise<boolean>((resolve, reject) => {
      let setTriggersPath = `http://localhost:${databasePort}/.settings/functionTriggers.json`;
      if (projectId !== "") {
        setTriggersPath += `?ns=${projectId}`;
      } else {
        EmulatorLogger.log(
          "WARN",
          `No project in use. Registering function trigger for sentinel namespace '${
            Constants.DEFAULT_DATABASE_EMULATOR_NAMESPACE
          }'`
        );
      }
      request.post(
        setTriggersPath,
        {
          auth: {
            bearer: "owner",
          },
          body: bundle,
        },
        (err, res, body) => {
          if (err) {
            EmulatorLogger.log("WARN", "Error adding trigger: " + err);
            reject();
            return;
          }

          resolve(true);
        }
      );
    });
  }

  addFirestoreTrigger(projectId: string, definition: EmulatedTriggerDefinition): Promise<boolean> {
    const firestorePort = EmulatorRegistry.getPort(Emulators.FIRESTORE);
    if (!firestorePort) {
      return Promise.resolve(false);
    }

    const bundle = JSON.stringify({ eventTrigger: definition.eventTrigger });
    logger.debug(`addFirestoreTrigger`, JSON.stringify(bundle));

    return new Promise<boolean>((resolve, reject) => {
      request.put(
        `http://localhost:${firestorePort}/emulator/v1/projects/${projectId}/triggers/${
          definition.name
        }`,
        {
          body: bundle,
        },
        (err, res, body) => {
          if (err) {
            EmulatorLogger.log("WARN", "Error adding trigger: " + err);
            reject();
            return;
          }

          resolve(true);
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

  getTriggers(): EmulatedTriggerDefinition[] {
    return this.triggers;
  }

  getBaseBundle(): FunctionsRuntimeBundle {
    return {
      cwd: this.functionsDir,
      projectId: this.projectId,
      triggerId: "",
      ports: {
        firestore: EmulatorRegistry.getPort(Emulators.FIRESTORE),
        database: EmulatorRegistry.getPort(Emulators.DATABASE),
      },
      disabled_features: this.args.disabledRuntimeFeatures,
    };
  }

  /**
   * Returns the path to a "node" executable to use.
   */
  async askInstallNodeVersion(cwd: string): Promise<string> {
    const pkg = require(path.join(cwd, "package.json"));

    // If the developer hasn't specified a Node to use, inform them that it's an option and use default
    if (!pkg.engines || !pkg.engines.node) {
      EmulatorLogger.log(
        "WARN",
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
      EmulatorLogger.logLabeled(
        "SUCCESS",
        "functions",
        `Using node@${requestedMajorVersion} from host.`
      );
      return process.execPath;
    }

    // If the requested version is already locally available, let's use that
    if (localMajorVersion === requestedMajorVersion) {
      EmulatorLogger.logLabeled(
        "SUCCESS",
        "functions",
        `Using node@${requestedMajorVersion} from local cache.`
      );
      return localNodePath;
    }

    /*
    Otherwise we'll begin the conversational flow to install the correct version locally
   */

    EmulatorLogger.log(
      "WARN",
      `Your requested "node" version "${requestedMajorVersion}" doesn't match your global version "${hostMajorVersion}"`
    );

    return process.execPath;
  }
}

export interface InvokeRuntimeOpts {
  serializedTriggers?: string;
  env?: { [key: string]: string };
  ignore_warnings?: boolean;
}
export function InvokeRuntime(
  nodeBinary: string,
  frb: FunctionsRuntimeBundle,
  opts?: InvokeRuntimeOpts
): FunctionsRuntimeInstance {
  opts = opts || {};

  const emitter = new EventEmitter();
  const metadata: { [key: string]: any } = {};

  const args = [
    path.join(__dirname, "functionsEmulatorRuntime"),
    JSON.stringify(frb),
    opts.serializedTriggers || "",
  ];

  if (opts.ignore_warnings) {
    args.unshift("--no-warnings");
  }

  const runtime = spawn(nodeBinary, args, {
    env: { node: nodeBinary, ...opts.env, ...process.env },
    cwd: frb.cwd,
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });

  const buffers: {
    [pipe: string]: {
      pipe: stream.Readable;
      value: string;
    };
  } = {
    stderr: { pipe: runtime.stderr, value: "" },
    stdout: { pipe: runtime.stdout, value: "" },
  };

  const ipcBuffer = { value: "" };
  runtime.on("message", (message: any) => {
    onData(runtime, emitter, ipcBuffer, message);
  });

  for (const id in buffers) {
    if (buffers.hasOwnProperty(id)) {
      const buffer = buffers[id];
      buffer.pipe.on("data", (buf: Buffer) => {
        onData(runtime, emitter, buffer, buf);
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

function onData(
  runtime: ChildProcess,
  emitter: EventEmitter,
  buffer: { value: string },
  buf: Buffer
): void {
  buffer.value += buf.toString();

  const lines = buffer.value.split("\n");

  if (lines.length > 1) {
    // slice(0, -1) returns all elements but the last
    lines.slice(0, -1).forEach((line: string) => {
      const log = EmulatorLog.fromJSON(line);
      emitter.emit("log", log);

      if (log.level === "FATAL") {
        // Something went wrong, if we don't kill the process it'll wait for timeoutMs.
        emitter.emit("log", new EmulatorLog("SYSTEM", "runtime-status", "killed"));
        runtime.kill();
      }
    });
  }

  buffer.value = lines[lines.length - 1];
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
