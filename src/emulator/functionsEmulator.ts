import * as _ from "lodash";
import * as fs from "fs";
import * as path from "path";
import * as express from "express";
import * as clc from "cli-color";
import * as http from "http";
import * as jwt from "jsonwebtoken";
import { URL } from "url";

import { Account } from "../auth";
import * as api from "../api";
import { logger } from "../logger";
import * as track from "../track";
import { Constants } from "./constants";
import {
  EmulatorInfo,
  EmulatorInstance,
  EmulatorLog,
  Emulators,
  FunctionsExecutionMode,
} from "./types";
import * as chokidar from "chokidar";

import * as spawn from "cross-spawn";
import { ChildProcess, spawnSync } from "child_process";
import {
  emulatedFunctionsByRegion,
  EmulatedTriggerDefinition,
  SignatureType,
  EventSchedule,
  EventTrigger,
  formatHost,
  FunctionsRuntimeArgs,
  FunctionsRuntimeBundle,
  FunctionsRuntimeFeatures,
  getFunctionService,
  getSignatureType,
  HttpConstants,
  ParsedTriggerDefinition,
} from "./functionsEmulatorShared";
import { EmulatorRegistry } from "./registry";
import { EventEmitter } from "events";
import * as stream from "stream";
import { EmulatorLogger, Verbosity } from "./emulatorLogger";
import { RuntimeWorker, RuntimeWorkerPool } from "./functionsRuntimeWorker";
import { PubsubEmulator } from "./pubsubEmulator";
import { FirebaseError } from "../error";
import { WorkQueue } from "./workQueue";
import { createDestroyer } from "../utils";
import { getCredentialPathAsync } from "../defaultCredentials";
import {
  AdminSdkConfig,
  constructDefaultAdminSdkConfig,
  getProjectAdminSdkConfigOrCached,
} from "./adminSdkConfig";
import * as functionsEnv from "../functions/env";
import { EventUtils } from "./events/types";

const EVENT_INVOKE = "functions:invoke";

/*
 * The Realtime Database emulator expects the `path` field in its trigger
 * definition to be relative to the database root. This regex is used to extract
 * that path from the `resource` member in the trigger definition used by the
 * functions emulator.
 *
 * Groups:
 *   1 - instance
 *   2 - path
 */
const DATABASE_PATH_PATTERN = new RegExp("^projects/[^/]+/instances/([^/]+)/refs(/.*)$");

export interface FunctionsEmulatorArgs {
  projectId: string;
  functionsDir: string;
  account?: Account;
  port?: number;
  host?: string;
  quiet?: boolean;
  disabledRuntimeFeatures?: FunctionsRuntimeFeatures;
  debugPort?: number;
  env?: Record<string, string>;
  remoteEmulators?: { [key: string]: EmulatorInfo };
  predefinedTriggers?: ParsedTriggerDefinition[];
  nodeMajorVersion?: number; // Lets us specify the node version when emulating extensions.
}

// FunctionsRuntimeInstance is the handler for a running function invocation
export interface FunctionsRuntimeInstance {
  // Process ID
  pid: number;
  // An emitter which sends our EmulatorLog events from the runtime.
  events: EventEmitter;
  // A promise which is fulfilled when the runtime has exited
  exit: Promise<number>;

  // A function to manually kill the child process as normal cleanup
  shutdown(): void;
  // A function to manually kill the child process in case of errors
  kill(signal?: string): void;
  // Send an IPC message to the child process
  send(args: FunctionsRuntimeArgs): boolean;
}

export interface InvokeRuntimeOpts {
  nodeBinary: string;
  serializedTriggers?: string;
  extensionTriggers?: ParsedTriggerDefinition[];
  ignore_warnings?: boolean;
}

interface RequestWithRawBody extends express.Request {
  rawBody: Buffer;
}

interface EmulatedTriggerRecord {
  def: EmulatedTriggerDefinition;
  enabled: boolean;
  ignored: boolean;
  url?: string;
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

  nodeBinary = "";
  private destroyServer?: () => Promise<void>;
  private triggers: { [triggerName: string]: EmulatedTriggerRecord } = {};

  // Keep a "generation number" for triggers so that we can disable functions
  // and reload them with a new name.
  private triggerGeneration = 0;
  private workerPool: RuntimeWorkerPool;
  private workQueue: WorkQueue;
  private logger = EmulatorLogger.forEmulator(Emulators.FUNCTIONS);
  private multicastTriggers: { [s: string]: string[] } = {};

  private adminSdkConfig: AdminSdkConfig;

  constructor(private args: FunctionsEmulatorArgs) {
    // TODO: Would prefer not to have static state but here we are!
    EmulatorLogger.verbosity = this.args.quiet ? Verbosity.QUIET : Verbosity.DEBUG;
    // When debugging is enabled, the "timeout" feature needs to be disabled so that
    // functions don't timeout while a breakpoint is active.
    if (this.args.debugPort) {
      this.args.disabledRuntimeFeatures = this.args.disabledRuntimeFeatures || {};
      this.args.disabledRuntimeFeatures.timeout = true;
    }

    this.adminSdkConfig = {
      projectId: this.args.projectId,
    };

    const mode = this.args.debugPort
      ? FunctionsExecutionMode.SEQUENTIAL
      : FunctionsExecutionMode.AUTO;
    this.workerPool = new RuntimeWorkerPool(mode);
    this.workQueue = new WorkQueue(mode);
  }

  private async getCredentialsEnvironment(): Promise<Record<string, string>> {
    // Provide default application credentials when appropriate
    const credentialEnv: Record<string, string> = {};
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      this.logger.logLabeled(
        "WARN",
        "functions",
        `Your GOOGLE_APPLICATION_CREDENTIALS environment variable points to ${process.env.GOOGLE_APPLICATION_CREDENTIALS}. Non-emulated services will access production using these credentials. Be careful!`
      );
    } else if (this.args.account) {
      const defaultCredPath = await getCredentialPathAsync(this.args.account);
      if (defaultCredPath) {
        this.logger.log("DEBUG", `Setting GAC to ${defaultCredPath}`);
        credentialEnv.GOOGLE_APPLICATION_CREDENTIALS = defaultCredPath;
      }
    } else {
      // TODO: It would be safer to set GOOGLE_APPLICATION_CREDENTIALS to /dev/null here but we can't because some SDKs don't work
      //       without credentials even when talking to the emulator: https://github.com/firebase/firebase-js-sdk/issues/3144
      this.logger.logLabeled(
        "WARN",
        "functions",
        "You are not signed in to the Firebase CLI. If you have authorized this machine using gcloud application-default credentials those may be discovered and used to access production services."
      );
    }

    return credentialEnv;
  }

  createHubServer(): express.Application {
    // TODO(samstern): Should not need this here but some tests are directly calling this method
    // because FunctionsEmulator.start() is not test-safe due to askInstallNodeVersion.
    this.workQueue.start();

    const hub = express();

    const dataMiddleware: express.RequestHandler = (req, res, next) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      req.on("end", () => {
        (req as RequestWithRawBody).rawBody = Buffer.concat(chunks);
        next();
      });
    };

    // The URL for the function that the other emulators (Firestore, etc) use.
    // TODO(abehaskins): Make the other emulators use the route below and remove this.
    const backgroundFunctionRoute = `/functions/projects/:project_id/triggers/:trigger_name`;

    // The URL that the developer sees, this is the same URL that the legacy emulator used.
    const httpsFunctionRoute = `/${this.args.projectId}/:region/:trigger_name`;

    // The URL for events meant to trigger multiple functions
    const multicastFunctionRoute = `/functions/projects/:project_id/trigger_multicast`;

    // A trigger named "foo" needs to respond at "foo" as well as "foo/*" but not "fooBar".
    const httpsFunctionRoutes = [httpsFunctionRoute, `${httpsFunctionRoute}/*`];

    const backgroundHandler: express.RequestHandler = (req, res) => {
      const region = req.params.region;
      const triggerId = req.params.trigger_name;
      const projectId = req.params.project_id;

      const reqBody = (req as RequestWithRawBody).rawBody;
      let proto = JSON.parse(reqBody.toString());

      if (req.headers["content-type"]?.includes("cloudevent")) {
        // Convert request payload to CloudEvent.
        // TODO(taeold): Converting request payload to CloudEvent object should be done by the functions runtime.
        // However, the Functions Emulator communicates with the runtime via socket not HTTP, and CE metadata
        // embedded in HTTP header may get lost. Once the Functions Emulator is refactored to communicate to the
        // runtime instances via HTTP, move this logic there.
        if (EventUtils.isBinaryCloudEvent(req)) {
          proto = EventUtils.extractBinaryCloudEventContext(req);
          proto.data = req.body;
        }
      }

      this.workQueue.submit(() => {
        this.logger.log("DEBUG", `Accepted request ${req.method} ${req.url} --> ${triggerId}`);

        return this.handleBackgroundTrigger(projectId, triggerId, proto)
          .then((x) => res.json(x))
          .catch((errorBundle: { code: number; body?: string }) => {
            if (errorBundle.body) {
              res.status(errorBundle.code).send(errorBundle.body);
            } else {
              res.sendStatus(errorBundle.code);
            }
          });
      });
    };

    const httpsHandler: express.RequestHandler = (req, res) => {
      this.workQueue.submit(() => {
        return this.handleHttpsTrigger(req, res);
      });
    };

    const multicastHandler: express.RequestHandler = (req, res) => {
      const projectId = req.params.project_id;
      const reqBody = (req as RequestWithRawBody).rawBody;
      let proto = JSON.parse(reqBody.toString());
      let triggerKey: string;
      if (req.headers["content-type"]?.includes("cloudevent")) {
        triggerKey = `${this.args.projectId}:${proto.type}`;

        if (EventUtils.isBinaryCloudEvent(req)) {
          proto = EventUtils.extractBinaryCloudEventContext(req);
          proto.data = req.body;
        }
      } else {
        triggerKey = `${this.args.projectId}:${proto.eventType}`;
      }
      const triggers = this.multicastTriggers[triggerKey] || [];

      triggers.forEach((triggerId) => {
        this.workQueue.submit(() => {
          this.logger.log(
            "DEBUG",
            `Accepted multicast request ${req.method} ${req.url} --> ${triggerId}`
          );

          return this.handleBackgroundTrigger(projectId, triggerId, proto);
        });
      });

      res.json({ status: "multicast_acknowledged" });
    };

    // The ordering here is important. The longer routes (background)
    // need to be registered first otherwise the HTTP functions consume
    // all events.
    hub.post(backgroundFunctionRoute, dataMiddleware, backgroundHandler);
    hub.post(multicastFunctionRoute, dataMiddleware, multicastHandler);
    hub.all(httpsFunctionRoutes, dataMiddleware, httpsHandler);
    hub.all("*", dataMiddleware, (req, res) => {
      logger.debug(`Functions emulator received unknown request at path ${req.path}`);
      res.sendStatus(404);
    });
    return hub;
  }

  startFunctionRuntime(
    triggerId: string,
    targetName: string,
    signatureType: SignatureType,
    proto?: any,
    runtimeOpts?: InvokeRuntimeOpts
  ): RuntimeWorker {
    const bundleTemplate = this.getBaseBundle();
    const runtimeBundle: FunctionsRuntimeBundle = {
      ...bundleTemplate,
      emulators: {
        firestore: this.getEmulatorInfo(Emulators.FIRESTORE),
        database: this.getEmulatorInfo(Emulators.DATABASE),
        pubsub: this.getEmulatorInfo(Emulators.PUBSUB),
        auth: this.getEmulatorInfo(Emulators.AUTH),
        storage: this.getEmulatorInfo(Emulators.STORAGE),
      },
      nodeMajorVersion: this.args.nodeMajorVersion,
      proto,
      triggerId,
      targetName,
    };
    const opts = runtimeOpts || {
      nodeBinary: this.nodeBinary,
      extensionTriggers: this.args.predefinedTriggers,
    };
    const worker = this.invokeRuntime(
      runtimeBundle,
      opts,
      this.getRuntimeEnvs({ targetName, signatureType })
    );
    return worker;
  }

  async start(): Promise<void> {
    this.nodeBinary = this.askInstallNodeVersion(
      this.args.functionsDir,
      this.args.nodeMajorVersion
    );

    const credentialEnv = await this.getCredentialsEnvironment();
    this.args.env = {
      ...credentialEnv,
      ...this.args.env,
    };

    const adminSdkConfig = await getProjectAdminSdkConfigOrCached(this.args.projectId);
    if (adminSdkConfig) {
      this.adminSdkConfig = adminSdkConfig;
    } else {
      this.logger.logLabeled(
        "WARN",
        "functions",
        "Unable to fetch project Admin SDK configuration, Admin SDK behavior in Cloud Functions emulator may be incorrect."
      );
      this.adminSdkConfig = constructDefaultAdminSdkConfig(this.args.projectId);
    }

    const { host, port } = this.getInfo();
    this.workQueue.start();
    const server = this.createHubServer().listen(port, host);
    this.destroyServer = createDestroyer(server);
    return Promise.resolve();
  }

  async connect(): Promise<void> {
    this.logger.logLabeled(
      "BULLET",
      "functions",
      `Watching "${this.args.functionsDir}" for Cloud Functions...`
    );

    const watcher = chokidar.watch(this.args.functionsDir, {
      ignored: [
        /.+?[\\\/]node_modules[\\\/].+?/, // Ignore node_modules
        /(^|[\/\\])\../, // Ignore files which begin the a period
        /.+\.log/, // Ignore files which have a .log extension
      ],
      persistent: true,
    });

    const debouncedLoadTriggers = _.debounce(() => this.loadTriggers(), 1000);
    watcher.on("change", (filePath) => {
      this.logger.log("DEBUG", `File ${filePath} changed, reloading triggers`);
      return debouncedLoadTriggers();
    });

    return this.loadTriggers(/* force= */ true);
  }

  async stop(): Promise<void> {
    try {
      await this.workQueue.flush();
    } catch (e) {
      this.logger.logLabeled(
        "WARN",
        "functions",
        "Functions emulator work queue did not empty before stopping"
      );
    }

    this.workQueue.stop();
    this.workerPool.exit();
    if (this.destroyServer) {
      await this.destroyServer();
    }
  }

  /**
   * When a user changes their code, we need to look for triggers defined in their updates sources.
   * To do this, we spin up a "diagnostic" runtime invocation. In other words, we pretend we're
   * going to invoke a cloud function in the emulator, but stop short of actually running a function.
   * Instead, we set up the environment and catch a special "triggers-parsed" log from the runtime
   * then exit out.
   *
   * A "diagnostic" FunctionsRuntimeBundle looks just like a normal bundle except triggerId == "".
   *
   * TODO(abehaskins): Gracefully handle removal of deleted function definitions
   */
  async loadTriggers(force = false): Promise<void> {
    // Before loading any triggers we need to make sure there are no 'stale' workers
    // in the pool that would cause us to run old code.
    this.workerPool.refresh();

    const worker = this.invokeRuntime(
      this.getBaseBundle(),
      {
        nodeBinary: this.nodeBinary,
        extensionTriggers: this.args.predefinedTriggers,
      },
      // Don't include user envs when parsing triggers.
      {
        ...this.getSystemEnvs(),
        ...this.getEmulatorEnvs(),
        FIREBASE_CONFIG: this.getFirebaseConfig(),
        ...this.args.env,
      }
    );

    const triggerParseEvent = await EmulatorLog.waitForLog(
      worker.runtime.events,
      "SYSTEM",
      "triggers-parsed"
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const parsedDefinitions = triggerParseEvent.data
      .triggerDefinitions as ParsedTriggerDefinition[];

    const triggerDefinitions: EmulatedTriggerDefinition[] = emulatedFunctionsByRegion(
      parsedDefinitions
    );

    // When force is true we set up all triggers, otherwise we only set up
    // triggers which have a unique function name
    const toSetup = triggerDefinitions.filter((definition) => {
      if (force) {
        return true;
      }

      // We want to add a trigger if we don't already have an enabled trigger
      // with the same entryPoint / trigger.
      const anyEnabledMatch = Object.values(this.triggers).some((record) => {
        const sameEntryPoint = record.def.entryPoint === definition.entryPoint;

        // If they both have event triggers, make sure they match
        const sameEventTrigger =
          JSON.stringify(record.def.eventTrigger) === JSON.stringify(definition.eventTrigger);

        if (sameEntryPoint && !sameEventTrigger) {
          this.logger.log(
            "DEBUG",
            `Definition for trigger ${definition.entryPoint} changed from ${JSON.stringify(
              record.def.eventTrigger
            )} to ${JSON.stringify(definition.eventTrigger)}`
          );
        }

        return record.enabled && sameEntryPoint && sameEventTrigger;
      });
      return !anyEnabledMatch;
    });

    for (const definition of toSetup) {
      let added = false;
      let url: string | undefined = undefined;

      if (definition.httpsTrigger) {
        const { host, port } = this.getInfo();
        added = true;
        url = FunctionsEmulator.getHttpFunctionUrl(
          host,
          port,
          this.args.projectId,
          definition.name,
          definition.region
        );
      } else if (definition.eventTrigger) {
        const service: string = getFunctionService(definition);
        const key = this.getTriggerKey(definition);
        const signature = getSignatureType(definition);

        switch (service) {
          case Constants.SERVICE_FIRESTORE:
            added = await this.addFirestoreTrigger(
              this.args.projectId,
              key,
              definition.eventTrigger
            );
            break;
          case Constants.SERVICE_REALTIME_DATABASE:
            added = await this.addRealtimeDatabaseTrigger(
              this.args.projectId,
              key,
              definition.eventTrigger
            );
            break;
          case Constants.SERVICE_PUBSUB:
            added = await this.addPubsubTrigger(
              definition.name,
              key,
              definition.eventTrigger,
              signature,
              definition.schedule
            );
            break;
          case Constants.SERVICE_AUTH:
            added = this.addAuthTrigger(this.args.projectId, key, definition.eventTrigger);
            break;
          case Constants.SERVICE_STORAGE:
            added = this.addStorageTrigger(this.args.projectId, key, definition.eventTrigger);
            break;
          default:
            this.logger.log("DEBUG", `Unsupported trigger: ${JSON.stringify(definition)}`);
            break;
        }
      } else {
        this.logger.log(
          "WARN",
          `Trigger trigger "${definition.name}" has has neither "httpsTrigger" or "eventTrigger" member`
        );
      }

      const ignored = !added;
      this.addTriggerRecord(definition, { ignored, url });

      const type = definition.httpsTrigger
        ? "http"
        : Constants.getServiceName(getFunctionService(definition));

      if (ignored) {
        const msg = `function ignored because the ${type} emulator does not exist or is not running.`;
        this.logger.logLabeled("BULLET", `functions[${definition.id}]`, msg);
      } else {
        const msg = url
          ? `${clc.bold(type)} function initialized (${url}).`
          : `${clc.bold(type)} function initialized.`;
        this.logger.logLabeled("SUCCESS", `functions[${definition.id}]`, msg);
      }
    }
  }

  addRealtimeDatabaseTrigger(
    projectId: string,
    key: string,
    eventTrigger: EventTrigger
  ): Promise<boolean> {
    const databaseEmu = EmulatorRegistry.get(Emulators.DATABASE);
    if (!databaseEmu) {
      return Promise.resolve(false);
    }

    const result: string[] | null = DATABASE_PATH_PATTERN.exec(eventTrigger.resource);
    if (result === null || result.length !== 3) {
      this.logger.log(
        "WARN",
        `Event trigger "${key}" has malformed "resource" member. ` + `${eventTrigger.resource}`
      );
      return Promise.reject();
    }

    const instance = result[1];
    const bundle = JSON.stringify({
      name: `projects/${projectId}/locations/_/functions/${key}`,
      path: result[2], // path stored in the second capture group
      event: eventTrigger.eventType,
      topic: `projects/${projectId}/topics/${key}`,
    });

    logger.debug(`addRealtimeDatabaseTrigger[${instance}]`, JSON.stringify(bundle));

    let setTriggersPath = "/.settings/functionTriggers.json";
    if (instance !== "") {
      setTriggersPath += `?ns=${instance}`;
    } else {
      this.logger.log(
        "WARN",
        `No project in use. Registering function trigger for sentinel namespace '${Constants.DEFAULT_DATABASE_EMULATOR_NAMESPACE}'`
      );
    }

    return api
      .request("POST", setTriggersPath, {
        origin: `http://${EmulatorRegistry.getInfoHostString(databaseEmu.getInfo())}`,
        headers: {
          Authorization: "Bearer owner",
        },
        data: bundle,
        json: false,
      })
      .then(() => {
        return true;
      })
      .catch((err) => {
        this.logger.log("WARN", "Error adding trigger: " + err);
        throw err;
      });
  }

  addFirestoreTrigger(
    projectId: string,
    key: string,
    eventTrigger: EventTrigger
  ): Promise<boolean> {
    const firestoreEmu = EmulatorRegistry.get(Emulators.FIRESTORE);
    if (!firestoreEmu) {
      return Promise.resolve(false);
    }

    const bundle = JSON.stringify({ eventTrigger });
    logger.debug(`addFirestoreTrigger`, JSON.stringify(bundle));

    return api
      .request("PUT", `/emulator/v1/projects/${projectId}/triggers/${key}`, {
        origin: `http://${EmulatorRegistry.getInfoHostString(firestoreEmu.getInfo())}`,
        data: bundle,
        json: false,
      })
      .then(() => {
        return true;
      })
      .catch((err) => {
        this.logger.log("WARN", "Error adding trigger: " + err);
        throw err;
      });
  }

  async addPubsubTrigger(
    triggerName: string,
    key: string,
    eventTrigger: EventTrigger,
    signatureType: SignatureType,
    schedule: EventSchedule | undefined
  ): Promise<boolean> {
    const pubsubPort = EmulatorRegistry.getPort(Emulators.PUBSUB);
    if (!pubsubPort) {
      return false;
    }

    const pubsubEmulator = EmulatorRegistry.get(Emulators.PUBSUB) as PubsubEmulator;

    logger.debug(`addPubsubTrigger`, JSON.stringify({ eventTrigger }));

    // "resource":\"projects/{PROJECT_ID}/topics/{TOPIC_ID}";
    const resource = eventTrigger.resource;
    let topic;
    if (schedule) {
      // In production this topic looks like
      // "firebase-schedule-{FUNCTION_NAME}-{DEPLOY-LOCATION}", we simply drop
      // the deploy location to match as closely as possible.
      topic = "firebase-schedule-" + triggerName;
    } else {
      const resourceParts = resource.split("/");
      topic = resourceParts[resourceParts.length - 1];
    }

    try {
      await pubsubEmulator.addTrigger(topic, key, signatureType);
      return true;
    } catch (e) {
      return false;
    }
  }

  addAuthTrigger(projectId: string, key: string, eventTrigger: EventTrigger): boolean {
    logger.debug(`addAuthTrigger`, JSON.stringify({ eventTrigger }));

    const eventTriggerId = `${projectId}:${eventTrigger.eventType}`;
    const triggers = this.multicastTriggers[eventTriggerId] || [];
    triggers.push(key);
    this.multicastTriggers[eventTriggerId] = triggers;
    return true;
  }

  addStorageTrigger(projectId: string, key: string, eventTrigger: EventTrigger): boolean {
    logger.debug(`addStorageTrigger`, JSON.stringify({ eventTrigger }));

    const eventTriggerId = `${projectId}:${eventTrigger.eventType}`;
    const triggers = this.multicastTriggers[eventTriggerId] || [];
    triggers.push(key);
    this.multicastTriggers[eventTriggerId] = triggers;
    return true;
  }

  getProjectId(): string {
    return this.args.projectId;
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.FUNCTIONS);
    const port = this.args.port || Constants.getDefaultPort(Emulators.FUNCTIONS);

    return {
      name: this.getName(),
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.FUNCTIONS;
  }

  getTriggerDefinitions(): EmulatedTriggerDefinition[] {
    return Object.values(this.triggers).map((record) => record.def);
  }

  getTriggerDefinitionByKey(triggerKey: string): EmulatedTriggerDefinition {
    const record = this.triggers[triggerKey];
    if (!record) {
      logger.debug(`Could not find key=${triggerKey} in ${JSON.stringify(this.triggers)}`);
      throw new FirebaseError(`No trigger with key ${triggerKey}`);
    }

    return record.def;
  }

  getTriggerKey(def: EmulatedTriggerDefinition): string {
    // For background triggers we attach the current generation as a suffix
    return def.eventTrigger ? `${def.id}-${this.triggerGeneration}` : def.id;
  }

  addTriggerRecord(
    def: EmulatedTriggerDefinition,
    opts: {
      ignored: boolean;
      url?: string;
    }
  ): void {
    const key = this.getTriggerKey(def);
    this.triggers[key] = { def, enabled: true, ignored: opts.ignored, url: opts.url };
  }

  setTriggersForTesting(triggers: EmulatedTriggerDefinition[]) {
    triggers.forEach((def) => this.addTriggerRecord(def, { ignored: false }));
  }

  getBaseBundle(): FunctionsRuntimeBundle {
    return {
      cwd: this.args.functionsDir,
      projectId: this.args.projectId,
      triggerId: "",
      targetName: "",
      emulators: {
        firestore: EmulatorRegistry.getInfo(Emulators.FIRESTORE),
        database: EmulatorRegistry.getInfo(Emulators.DATABASE),
        pubsub: EmulatorRegistry.getInfo(Emulators.PUBSUB),
        auth: EmulatorRegistry.getInfo(Emulators.AUTH),
        storage: EmulatorRegistry.getInfo(Emulators.STORAGE),
      },
      adminSdkConfig: {
        databaseURL: this.adminSdkConfig.databaseURL,
        storageBucket: this.adminSdkConfig.storageBucket,
      },
      disabled_features: this.args.disabledRuntimeFeatures,
    };
  }
  /**
   * Returns a node major version ("10", "8") or null
   * @param frb the current Functions Runtime Bundle
   */
  getRequestedNodeRuntimeVersion(frb: FunctionsRuntimeBundle): string | undefined {
    const pkg = require(path.join(frb.cwd, "package.json"));
    return frb.nodeMajorVersion || (pkg.engines && pkg.engines.node);
  }
  /**
   * Returns the path to a "node" executable to use.
   * @param cwd the directory to checkout for a package.json file.
   * @param nodeMajorVersion forces the emulator to choose this version. Used when emulating extensions,
   *  since in production, extensions ignore the node version provided in package.json and use the version
   *  specified in extension.yaml. This will ALWAYS be populated when emulating extensions, even if they
   *  are using the default version.
   */
  askInstallNodeVersion(cwd: string, nodeMajorVersion?: number): string {
    const pkg = require(path.join(cwd, "package.json"));
    // If the developer hasn't specified a Node to use, inform them that it's an option and use default
    if ((!pkg.engines || !pkg.engines.node) && !nodeMajorVersion) {
      this.logger.log(
        "WARN",
        "Your functions directory does not specify a Node version.\n   " +
          "- Learn more at https://firebase.google.com/docs/functions/manage-functions#set_runtime_options"
      );
      return process.execPath;
    }

    const hostMajorVersion = process.versions.node.split(".")[0];
    const requestedMajorVersion: string = nodeMajorVersion
      ? `${nodeMajorVersion}`
      : pkg.engines.node;
    let localMajorVersion = "0";
    const localNodePath = path.join(cwd, "node_modules/.bin/node");

    // Next check if we have a Node install in the node_modules folder
    try {
      const localNodeOutput = spawnSync(localNodePath, ["--version"]).stdout.toString();
      localMajorVersion = localNodeOutput.slice(1).split(".")[0];
    } catch (err) {
      // Will happen if we haven't asked about local version yet
    }

    // If the requested version is already locally available, let's use that
    if (requestedMajorVersion === localMajorVersion) {
      this.logger.logLabeled(
        "SUCCESS",
        "functions",
        `Using node@${requestedMajorVersion} from local cache.`
      );
      return localNodePath;
    }

    // If the requested version is the same as the host, let's use that
    if (requestedMajorVersion === hostMajorVersion) {
      this.logger.logLabeled(
        "SUCCESS",
        "functions",
        `Using node@${requestedMajorVersion} from host.`
      );
      return process.execPath;
    }

    // Otherwise we'll begin the conversational flow to install the correct version locally
    this.logger.log(
      "WARN",
      `Your requested "node" version "${requestedMajorVersion}" doesn't match your global version "${hostMajorVersion}"`
    );

    return process.execPath;
  }

  getUserEnvs(): Record<string, string> {
    const projectInfo = {
      functionsSource: this.args.functionsDir,
      projectId: this.args.projectId,
      isEmulator: true,
    };

    if (functionsEnv.hasUserEnvs(projectInfo)) {
      try {
        return functionsEnv.loadUserEnvs(projectInfo);
      } catch (e) {
        // Ignore - user envs are optional.
        logger.debug("Failed to load local environment variables", e);
      }
    }
    return {};
  }

  getSystemEnvs(triggerDef?: {
    targetName: string;
    signatureType: SignatureType;
  }): Record<string, string> {
    const envs: Record<string, string> = {};

    // Env vars guaranteed by GCF platform.
    //   https://cloud.google.com/functions/docs/env-var
    envs.GCLOUD_PROJECT = this.args.projectId;
    envs.K_REVISION = "1";
    envs.PORT = "80";

    if (triggerDef) {
      const service = triggerDef.targetName;
      const target = service.replace(/-/g, ".");
      envs.FUNCTION_TARGET = target;
      envs.FUNCTION_SIGNATURE_TYPE = triggerDef.signatureType;
      envs.K_SERVICE = service;
    }
    return envs;
  }

  getEmulatorEnvs(): Record<string, string> {
    const envs: Record<string, string> = {};

    envs.FUNCTIONS_EMULATOR = "true";
    envs.TZ = "UTC"; // Fixes https://github.com/firebase/firebase-tools/issues/2253
    envs.FIREBASE_DEBUG_MODE = "true";
    envs.FIREBASE_DEBUG_FEATURES = JSON.stringify({ skipTokenVerification: true });

    // Make firebase-admin point at the Firestore emulator
    const firestoreEmulator = this.getEmulatorInfo(Emulators.FIRESTORE);
    if (firestoreEmulator != null) {
      envs[Constants.FIRESTORE_EMULATOR_HOST] = formatHost(firestoreEmulator);
    }

    // Make firebase-admin point at the Database emulator
    const databaseEmulator = this.getEmulatorInfo(Emulators.DATABASE);
    if (databaseEmulator) {
      envs[Constants.FIREBASE_DATABASE_EMULATOR_HOST] = formatHost(databaseEmulator);
    }

    // Make firebase-admin point at the Auth emulator
    const authEmulator = this.getEmulatorInfo(Emulators.AUTH);
    if (authEmulator) {
      envs[Constants.FIREBASE_AUTH_EMULATOR_HOST] = formatHost(authEmulator);
    }

    // Make firebase-admin point at the Storage emulator
    const storageEmulator = this.getEmulatorInfo(Emulators.STORAGE);
    if (storageEmulator) {
      envs[Constants.FIREBASE_STORAGE_EMULATOR_HOST] = formatHost(storageEmulator);
      // TODO(taeold): We only need FIREBASE_STORAGE_EMULATOR_HOST, as long as the users are using new-ish SDKs.
      //   Clean up and update documentation in a subsequent patch.
      envs[Constants.CLOUD_STORAGE_EMULATOR_HOST] = `http://${formatHost(storageEmulator)}`;
    }

    const pubsubEmulator = this.getEmulatorInfo(Emulators.PUBSUB);
    if (pubsubEmulator) {
      const pubsubHost = formatHost(pubsubEmulator);
      process.env.PUBSUB_EMULATOR_HOST = pubsubHost;
    }

    return envs;
  }

  getFirebaseConfig(): string {
    const databaseEmulator = this.getEmulatorInfo(Emulators.DATABASE);

    let emulatedDatabaseURL = undefined;
    if (databaseEmulator) {
      // Database URL will look like one of:
      //  - https://${namespace}.firebaseio.com
      //  - https://${namespace}.${location}.firebasedatabase.app
      let ns = this.args.projectId;
      if (this.adminSdkConfig.databaseURL) {
        const asUrl = new URL(this.adminSdkConfig.databaseURL);
        ns = asUrl.hostname.split(".")[0];
      }
      emulatedDatabaseURL = `http://${formatHost(databaseEmulator)}/?ns=${ns}`;
    }
    return JSON.stringify({
      storageBucket: this.adminSdkConfig.storageBucket,
      databaseURL: emulatedDatabaseURL || this.adminSdkConfig.databaseURL,
      projectId: this.args.projectId,
    });
  }

  getRuntimeEnvs(triggerDef?: {
    targetName: string;
    signatureType: SignatureType;
  }): Record<string, string> {
    return {
      ...this.getUserEnvs(),
      ...this.getSystemEnvs(triggerDef),
      ...this.getEmulatorEnvs(),
      FIREBASE_CONFIG: this.getFirebaseConfig(),
      ...this.args.env,
    };
  }

  invokeRuntime(
    frb: FunctionsRuntimeBundle,
    opts: InvokeRuntimeOpts,
    runtimeEnv?: Record<string, string>
  ): RuntimeWorker {
    // If we can use an existing worker there is almost nothing to do.
    if (this.workerPool.readyForWork(frb.triggerId)) {
      return this.workerPool.submitWork(frb.triggerId, frb, opts);
    }

    const emitter = new EventEmitter();
    const args = [path.join(__dirname, "functionsEmulatorRuntime")];

    if (opts.ignore_warnings) {
      args.unshift("--no-warnings");
    }

    if (this.args.debugPort) {
      if (process.env.FIREPIT_VERSION && process.execPath == opts.nodeBinary) {
        const requestedMajorNodeVersion = this.getRequestedNodeRuntimeVersion(frb);
        this.logger.log(
          "WARN",
          `To enable function inspection, please run "${process.execPath} is:npm i node@${requestedMajorNodeVersion} --save-dev" in your functions directory`
        );
      } else {
        const { host } = this.getInfo();
        args.unshift(`--inspect=${host}:${this.args.debugPort}`);
      }
    }

    // Yarn 2 has a new feature called PnP (Plug N Play) which aims to completely take over
    // module resolution. This feature is mostly incompatible with CF3 (prod or emulated) so
    // if we detect it we should warn the developer.
    // See: https://classic.yarnpkg.com/en/docs/pnp/
    const pnpPath = path.join(frb.cwd, ".pnp.js");
    if (fs.existsSync(pnpPath)) {
      EmulatorLogger.forEmulator(Emulators.FUNCTIONS).logLabeled(
        "WARN_ONCE",
        "functions",
        "Detected yarn@2 with PnP. " +
          "Cloud Functions for Firebase requires a node_modules folder to work correctly and is therefore incompatible with PnP. " +
          "See https://yarnpkg.com/getting-started/migration#step-by-step for more information."
      );
    }

    const childProcess = spawn(opts.nodeBinary, args, {
      env: { node: opts.nodeBinary, ...process.env, ...(runtimeEnv ?? {}) },
      cwd: frb.cwd,
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });

    const buffers: {
      [pipe: string]: {
        pipe: stream.Readable;
        value: string;
      };
    } = {
      stderr: { pipe: childProcess.stderr, value: "" },
      stdout: { pipe: childProcess.stdout, value: "" },
    };

    const ipcBuffer = { value: "" };
    childProcess.on("message", (message: any) => {
      this.onData(childProcess, emitter, ipcBuffer, message);
    });

    for (const id in buffers) {
      if (buffers.hasOwnProperty(id)) {
        const buffer = buffers[id];
        buffer.pipe.on("data", (buf: Buffer) => {
          this.onData(childProcess, emitter, buffer, buf);
        });
      }
    }

    const runtime: FunctionsRuntimeInstance = {
      pid: childProcess.pid,
      exit: new Promise<number>((resolve) => {
        childProcess.on("exit", resolve);
      }),
      events: emitter,
      shutdown: () => {
        childProcess.kill();
      },
      kill: (signal?: string) => {
        childProcess.kill(signal);
        emitter.emit("log", new EmulatorLog("SYSTEM", "runtime-status", "killed"));
      },
      send: (args: FunctionsRuntimeArgs) => {
        return childProcess.send(JSON.stringify(args));
      },
    };

    this.workerPool.addWorker(frb.triggerId, runtime);
    return this.workerPool.submitWork(frb.triggerId, frb, opts);
  }

  async disableBackgroundTriggers() {
    Object.values(this.triggers).forEach((record) => {
      if (record.def.eventTrigger && record.enabled) {
        this.logger.logLabeled(
          "BULLET",
          `functions[${record.def.entryPoint}]`,
          "function temporarily disabled."
        );
        record.enabled = false;
      }
    });

    await this.workQueue.flush();
  }

  async reloadTriggers() {
    this.triggerGeneration++;
    return this.loadTriggers();
  }

  private async handleBackgroundTrigger(projectId: string, triggerKey: string, proto: any) {
    // If background triggers are disabled, exit early
    const record = this.triggers[triggerKey];
    if (record && !record.enabled) {
      return Promise.reject({ code: 204, body: "Background triggers are curently disabled." });
    }

    const trigger = this.getTriggerDefinitionByKey(triggerKey);
    const service = getFunctionService(trigger);
    const worker = this.startFunctionRuntime(
      trigger.id,
      trigger.name,
      getSignatureType(trigger),
      proto
    );

    return new Promise((resolve, reject) => {
      if (projectId !== this.args.projectId) {
        // RTDB considers each namespace a "project", but for any other trigger we want to reject
        // incoming triggers to a different project.
        if (service !== Constants.SERVICE_REALTIME_DATABASE) {
          logger.debug(
            `Received functions trigger for service "${service}" for unknown project "${projectId}".`
          );
          reject({ code: 404 });
          return;
        }

        // The eventTrigger 'resource' property will look something like this:
        // "projects/_/instances/<project>/refs/foo/bar"
        // If the trigger's resource does not match the invoked projet ID, we should 404.
        if (!trigger.eventTrigger!.resource.startsWith(`projects/_/instances/${projectId}`)) {
          logger.debug(
            `Received functions trigger for function "${
              trigger.name
            }" of project "${projectId}" that did not match definition: ${JSON.stringify(trigger)}.`
          );
          reject({ code: 404 });
          return;
        }
      }

      worker.onLogs((el: EmulatorLog) => {
        if (el.level === "FATAL") {
          reject({ code: 500, body: el.text });
        }
      });

      // For analytics, track the invoked service
      track(EVENT_INVOKE, getFunctionService(trigger));

      worker.waitForDone().then(() => {
        resolve({ status: "acknowledged" });
      });
    });
  }

  /**
   * Gets the address of a running emulator, either from explicit args or by
   * consulting the emulator registry.
   *
   * @param emulator
   */
  private getEmulatorInfo(emulator: Emulators): EmulatorInfo | undefined {
    if (this.args.remoteEmulators) {
      if (this.args.remoteEmulators[emulator]) {
        return this.args.remoteEmulators[emulator];
      }
    }

    return EmulatorRegistry.getInfo(emulator);
  }

  private tokenFromAuthHeader(authHeader: string) {
    const match = authHeader.match(/^Bearer (.*)$/);
    if (!match) {
      return;
    }

    let idToken = match[1];
    logger.debug(`ID Token: ${idToken}`);

    // The @firebase/testing library sometimes produces JWTs with invalid padding, so we
    // remove that via regex. This is the spec that says trailing = should be removed:
    // https://tools.ietf.org/html/rfc7515#section-2
    if (idToken && idToken.includes("=")) {
      idToken = idToken.replace(/[=]+?\./g, ".");
      logger.debug(`ID Token contained invalid padding, new value: ${idToken}`);
    }

    try {
      const decoded = jwt.decode(idToken, { complete: true });
      if (!decoded || typeof decoded !== "object") {
        logger.debug(`Failed to decode ID Token: ${decoded}`);
        return;
      }

      // In firebase-functions we manually copy 'sub' to 'uid'
      // https://github.com/firebase/firebase-admin-node/blob/0b2082f1576f651e75069e38ce87e639c25289af/src/auth/token-verifier.ts#L249
      const claims = decoded.payload;
      claims.uid = claims.sub;

      return claims;
    } catch (e) {
      return;
    }
  }

  private async handleHttpsTrigger(req: express.Request, res: express.Response) {
    const method = req.method;
    const region = req.params.region;
    const triggerName = req.params.trigger_name;
    const triggerId = `${region}-${triggerName}`;

    if (!this.triggers[triggerId]) {
      res
        .status(404)
        .send(
          `Function ${triggerId} does not exist, valid triggers are: ${Object.keys(
            this.triggers
          ).join(", ")}`
        );
      return;
    }

    const trigger = this.getTriggerDefinitionByKey(triggerId);
    logger.debug(`Accepted request ${method} ${req.url} --> ${triggerId}`);

    const reqBody = (req as RequestWithRawBody).rawBody;

    // For callable functions we want to accept tokens without actually calling verifyIdToken
    const isCallable = trigger.labels && trigger.labels["deployment-callable"] === "true";
    const authHeader = req.header("Authorization");
    if (authHeader && isCallable && trigger.platform !== "gcfv2") {
      const token = this.tokenFromAuthHeader(authHeader);
      if (token) {
        const contextAuth = {
          uid: token.uid,
          token: token,
        };

        // Stash the "Authorization" header in a temporary place, we will replace it
        // when invoking the callable handler
        req.headers[HttpConstants.ORIGINAL_AUTH_HEADER] = req.headers["authorization"];
        delete req.headers["authorization"];

        req.headers[HttpConstants.CALLABLE_AUTH_HEADER] = encodeURIComponent(
          JSON.stringify(contextAuth)
        );
      }
    }
    const worker = this.startFunctionRuntime(trigger.id, trigger.name, "http", undefined);

    worker.onLogs((el: EmulatorLog) => {
      if (el.level === "FATAL") {
        res.status(500).send(el.text);
      }
    });

    // Wait for the worker to set up its internal HTTP server
    await worker.waitForSocketReady();

    track(EVENT_INVOKE, "https");

    this.logger.log("DEBUG", `[functions] Runtime ready! Sending request!`);

    if (!worker.lastArgs) {
      throw new FirebaseError("Cannot execute on a worker with no arguments");
    }

    if (!worker.lastArgs.frb.socketPath) {
      throw new FirebaseError(
        `Cannot execute on a worker without a socketPath: ${JSON.stringify(worker.lastArgs)}`
      );
    }

    // To match production behavior we need to drop the path prefix
    // req.url = /:projectId/:region/:trigger_name/*
    const url = new URL(`${req.protocol}://${req.hostname}${req.url}`);
    const path = `${url.pathname}${url.search}`.replace(
      new RegExp(`\/${this.args.projectId}\/[^\/]*\/${triggerName}\/?`),
      "/"
    );

    // We do this instead of just 302'ing because many HTTP clients don't respect 302s so it may
    // cause unexpected situations - not to mention CORS troubles and this enables us to use
    // a socketPath (IPC socket) instead of consuming yet another port which is probably faster as well.
    this.logger.log("DEBUG", `[functions] Got req.url=${req.url}, mapping to path=${path}`);
    const runtimeReq = http.request(
      {
        method,
        path,
        headers: req.headers,
        socketPath: worker.lastArgs.frb.socketPath,
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
    req.pipe(runtimeReq, { end: true }).on("error", () => {
      res.end();
    });

    await worker.waitForDone();
  }

  private onData(
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
}
