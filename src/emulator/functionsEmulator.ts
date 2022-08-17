import * as fs from "fs";
import * as path from "path";
import * as express from "express";
import * as clc from "colorette";
import * as http from "http";
import * as jwt from "jsonwebtoken";
import * as cors from "cors";
import { URL } from "url";
import { EventEmitter } from "events";

import { Account } from "../auth";
import { logger } from "../logger";
import { track, trackEmulator } from "../track";
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
import { ChildProcess } from "child_process";
import {
  EmulatedTriggerDefinition,
  SignatureType,
  EventSchedule,
  EventTrigger,
  formatHost,
  FunctionsRuntimeBundle,
  FunctionsRuntimeFeatures,
  getFunctionService,
  getSignatureType,
  HttpConstants,
  ParsedTriggerDefinition,
  emulatedFunctionsFromEndpoints,
  emulatedFunctionsByRegion,
  getSecretLocalPath,
  toBackendInfo,
  prepareEndpoints,
  BlockingTrigger,
  getTemporarySocketPath,
} from "./functionsEmulatorShared";
import { EmulatorRegistry } from "./registry";
import { EmulatorLogger, Verbosity } from "./emulatorLogger";
import { RuntimeWorker, RuntimeWorkerPool } from "./functionsRuntimeWorker";
import { PubsubEmulator } from "./pubsubEmulator";
import { FirebaseError } from "../error";
import { WorkQueue } from "./workQueue";
import { allSettled, createDestroyer, debounce } from "../utils";
import { getCredentialPathAsync } from "../defaultCredentials";
import {
  AdminSdkConfig,
  constructDefaultAdminSdkConfig,
  getProjectAdminSdkConfigOrCached,
} from "./adminSdkConfig";
import { functionIdsAreValid } from "../deploy/functions/validate";
import { Extension, ExtensionSpec, ExtensionVersion } from "../extensions/types";
import { accessSecretVersion } from "../gcp/secretManager";
import * as runtimes from "../deploy/functions/runtimes";
import * as backend from "../deploy/functions/backend";
import * as functionsEnv from "../functions/env";
import { AUTH_BLOCKING_EVENTS, BEFORE_CREATE_EVENT } from "../functions/events/v1";
import { BlockingFunctionsConfig } from "../gcp/identityPlatform";
import { Client } from "../apiv2";
import { resolveBackend } from "../deploy/functions/build";

const EVENT_INVOKE = "functions:invoke"; // event name for UA
const EVENT_INVOKE_GA4 = "functions_invoke"; // event name GA4 (alphanumertic)

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

/**
 * EmulatableBackend represents a group of functions to be emulated.
 * This can be a CF3 module, or an Extension.
 */
export interface EmulatableBackend {
  functionsDir: string;
  env: Record<string, string>;
  secretEnv: backend.SecretEnvVar[];
  codebase: string;
  predefinedTriggers?: ParsedTriggerDefinition[];
  nodeMajorVersion?: number;
  nodeBinary?: string;
  extensionInstanceId?: string;
  extension?: Extension; // Only present for published extensions
  extensionVersion?: ExtensionVersion; // Only present for published extensions
  extensionSpec?: ExtensionSpec; // Only present for local extensions
}

/**
 * BackendInfo is an API type used by the Emulator UI containing info about an Extension or CF3 module.
 */
export interface BackendInfo {
  directory: string;
  env: Record<string, string>; // TODO: Consider exposing more information about where param values come from & if they are locally overwritten.
  functionTriggers: ParsedTriggerDefinition[];
  extensionInstanceId?: string;
  extension?: Extension; // Only present for published extensions
  extensionVersion?: ExtensionVersion; // Only present for published extensions
  extensionSpec?: ExtensionSpec; // Only present for local extensions
}

export interface FunctionsEmulatorArgs {
  projectId: string;
  projectDir: string;
  emulatableBackends: EmulatableBackend[];
  account?: Account;
  port?: number;
  host?: string;
  quiet?: boolean;
  disabledRuntimeFeatures?: FunctionsRuntimeFeatures;
  debugPort?: number;
  remoteEmulators?: { [key: string]: EmulatorInfo };
  adminSdkConfig?: AdminSdkConfig;
  projectAlias?: string;
}

// FunctionsRuntimeInstance is the handler for a running function invocation
export interface FunctionsRuntimeInstance {
  process: ChildProcess;
  // An emitter which sends our EmulatorLog events from the runtime.
  events: EventEmitter;
  // A cwd of the process
  cwd: string;
  // Path to socket file used for HTTP-over-IPC comms.
  socketPath: string;
}

export interface InvokeRuntimeOpts {
  nodeBinary: string;
  extensionTriggers?: ParsedTriggerDefinition[];
  ignore_warnings?: boolean;
}

interface RequestWithRawBody extends express.Request {
  rawBody: Buffer;
}

interface EmulatedTriggerRecord {
  backend: EmulatableBackend;
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

  private destroyServer?: () => Promise<void>;
  private triggers: { [triggerName: string]: EmulatedTriggerRecord } = {};

  // Keep a "generation number" for triggers so that we can disable functions
  // and reload them with a new name.
  private triggerGeneration = 0;
  private workerPools: Record<string, RuntimeWorkerPool>;
  private workQueue: WorkQueue;
  private logger = EmulatorLogger.forEmulator(Emulators.FUNCTIONS);
  private multicastTriggers: { [s: string]: string[] } = {};

  private adminSdkConfig: AdminSdkConfig;

  private blockingFunctionsConfig: BlockingFunctionsConfig = {};

  constructor(private args: FunctionsEmulatorArgs) {
    // TODO: Would prefer not to have static state but here we are!
    EmulatorLogger.verbosity = this.args.quiet ? Verbosity.QUIET : Verbosity.DEBUG;
    // When debugging is enabled, the "timeout" feature needs to be disabled so that
    // functions don't timeout while a breakpoint is active.
    if (this.args.debugPort) {
      this.args.disabledRuntimeFeatures = this.args.disabledRuntimeFeatures || {};
      this.args.disabledRuntimeFeatures.timeout = true;
    }

    this.adminSdkConfig = { ...this.args.adminSdkConfig, projectId: this.args.projectId };

    const mode = this.args.debugPort
      ? FunctionsExecutionMode.SEQUENTIAL
      : FunctionsExecutionMode.AUTO;
    this.workerPools = {};
    for (const backend of this.args.emulatableBackends) {
      const pool = new RuntimeWorkerPool(mode);
      this.workerPools[backend.codebase] = pool;
    }
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
    // because FunctionsEmulator.start() used to not be test safe.
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
    const backgroundFunctionRoute = `/functions/projects/:project_id/triggers/:trigger_name(*)`;

    // The URL that the developer sees, this is the same URL that the legacy emulator used.
    const httpsFunctionRoute = `/${this.args.projectId}/:region/:trigger_name`;

    // The URL for events meant to trigger multiple functions
    const multicastFunctionRoute = `/functions/projects/:project_id/trigger_multicast`;

    // A trigger named "foo" needs to respond at "foo" as well as "foo/*" but not "fooBar".
    const httpsFunctionRoutes = [httpsFunctionRoute, `${httpsFunctionRoute}/*`];

    // The URL for the listBackends endpoint, which is used by the Emulator UI.
    const listBackendsRoute = `/backends`;

    const httpsHandler: express.RequestHandler = (req, res) => {
      this.workQueue.submit(() => {
        return this.handleHttpsTrigger(req, res);
      });
    };

    const multicastHandler: express.RequestHandler = (req: express.Request, res) => {
      const projectId = req.params.project_id;
      const rawBody = (req as RequestWithRawBody).rawBody;
      const event = JSON.parse(rawBody.toString());
      let triggerKey: string;
      if (req.headers["content-type"]?.includes("cloudevent")) {
        triggerKey = `${this.args.projectId}:${event.type}`;
      } else {
        triggerKey = `${this.args.projectId}:${event.eventType}`;
      }
      if (event.data.bucket) {
        triggerKey += `:${event.data.bucket}`;
      }
      const triggers = this.multicastTriggers[triggerKey] || [];

      const { host, port } = this.getInfo();
      triggers.forEach((triggerId) => {
        this.workQueue.submit(() => {
          return new Promise((resolve, reject) => {
            const trigReq = http.request(
              {
                host,
                port,
                method: req.method,
                path: `/functions/projects/${projectId}/triggers/${triggerId}`,
                headers: req.headers,
              },
              resolve
            );
            trigReq.on("error", reject);
            trigReq.write(rawBody);
            trigReq.end();
          });
        });
      });
      res.json({ status: "multicast_acknowledged" });
    };

    const listBackendsHandler: express.RequestHandler = (req, res) => {
      res.json({ backends: this.getBackendInfo() });
    };

    // The ordering here is important. The longer routes (background)
    // need to be registered first otherwise the HTTP functions consume
    // all events.
    hub.get(listBackendsRoute, cors({ origin: true }), listBackendsHandler); // This route needs CORS so the Emulator UI can call it.
    hub.post(backgroundFunctionRoute, dataMiddleware, httpsHandler);
    hub.post(multicastFunctionRoute, dataMiddleware, multicastHandler);
    hub.all(httpsFunctionRoutes, dataMiddleware, httpsHandler);
    hub.all("*", dataMiddleware, (req, res) => {
      logger.debug(`Functions emulator received unknown request at path ${req.path}`);
      res.sendStatus(404);
    });
    return hub;
  }

  async sendRequest(worker: RuntimeWorker, body?: any) {
    const reqBody = JSON.stringify(body);
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": `${reqBody.length}`,
    };
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          path: `/`,
          socketPath: worker.runtime.socketPath,
          headers: headers,
        },
        resolve
      );
      req.on("error", reject);
      req.write(reqBody);
      req.end();
    });
  }

  async invokeTrigger(
    trigger: EmulatedTriggerDefinition,
    proto?: any,
    runtimeOpts?: InvokeRuntimeOpts
  ): Promise<RuntimeWorker> {
    const record = this.getTriggerRecordByKey(this.getTriggerKey(trigger));
    const backend = record.backend;
    const bundleTemplate = this.getBaseBundle();
    const runtimeBundle: FunctionsRuntimeBundle = {
      ...bundleTemplate,
      proto,
    };
    if (this.args.debugPort) {
      runtimeBundle.debug = {
        functionTarget: trigger.entryPoint,
        functionSignature: getSignatureType(trigger),
      };
    }
    if (!backend.nodeBinary) {
      throw new FirebaseError(`No node binary for ${trigger.id}. This should never happen.`);
    }
    const opts = runtimeOpts || {
      nodeBinary: backend.nodeBinary,
      extensionTriggers: backend.predefinedTriggers,
    };
    const worker = await this.invokeRuntime(backend, trigger, runtimeBundle, opts);
    return worker;
  }

  async start(): Promise<void> {
    for (const backend of this.args.emulatableBackends) {
      backend.nodeBinary = this.getNodeBinary(backend);
    }
    const credentialEnv = await this.getCredentialsEnvironment();
    for (const e of this.args.emulatableBackends) {
      e.env = { ...credentialEnv, ...e.env };
    }

    if (Object.keys(this.adminSdkConfig || {}).length <= 1) {
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
    }

    const { host, port } = this.getInfo();
    this.workQueue.start();
    const server = this.createHubServer().listen(port, host);
    this.destroyServer = createDestroyer(server);
    return Promise.resolve();
  }

  async connect(): Promise<void> {
    for (const backend of this.args.emulatableBackends) {
      this.logger.logLabeled(
        "BULLET",
        "functions",
        `Watching "${backend.functionsDir}" for Cloud Functions...`
      );

      const watcher = chokidar.watch(backend.functionsDir, {
        ignored: [
          /.+?[\\\/]node_modules[\\\/].+?/, // Ignore node_modules
          /(^|[\/\\])\../, // Ignore files which begin the a period
          /.+\.log/, // Ignore files which have a .log extension
        ],
        persistent: true,
      });

      const debouncedLoadTriggers = debounce(() => this.loadTriggers(backend), 1000);
      watcher.on("change", (filePath) => {
        this.logger.log("DEBUG", `File ${filePath} changed, reloading triggers`);
        return debouncedLoadTriggers();
      });

      await this.loadTriggers(backend, /* force= */ true);
    }
    await this.performPostLoadOperations();
    return;
  }

  async stop(): Promise<void> {
    try {
      await this.workQueue.flush();
    } catch (e: any) {
      this.logger.logLabeled(
        "WARN",
        "functions",
        "Functions emulator work queue did not empty before stopping"
      );
    }

    this.workQueue.stop();
    for (const pool of Object.values(this.workerPools)) {
      pool.exit();
    }
    if (this.destroyServer) {
      await this.destroyServer();
    }
  }

  async discoverTriggers(
    emulatableBackend: EmulatableBackend
  ): Promise<EmulatedTriggerDefinition[]> {
    if (emulatableBackend.predefinedTriggers) {
      return emulatedFunctionsByRegion(
        emulatableBackend.predefinedTriggers,
        emulatableBackend.secretEnv
      );
    } else {
      const runtimeConfig = this.getRuntimeConfig(emulatableBackend);
      const runtimeDelegateContext: runtimes.DelegateContext = {
        projectId: this.args.projectId,
        projectDir: this.args.projectDir,
        sourceDir: emulatableBackend.functionsDir,
      };
      if (emulatableBackend.nodeMajorVersion) {
        runtimeDelegateContext.runtime = `nodejs${emulatableBackend.nodeMajorVersion}`;
      }
      const runtimeDelegate = await runtimes.getRuntimeDelegate(runtimeDelegateContext);
      logger.debug(`Validating ${runtimeDelegate.name} source`);
      await runtimeDelegate.validate();
      logger.debug(`Building ${runtimeDelegate.name} source`);
      await runtimeDelegate.build();
      logger.debug(`Analyzing ${runtimeDelegate.name} backend spec`);
      // Don't include user envs when parsing triggers, but we need some of the options for handling params
      const environment = {
        ...this.getSystemEnvs(),
        ...this.getEmulatorEnvs(),
        FIREBASE_CONFIG: this.getFirebaseConfig(),
        ...emulatableBackend.env,
      };
      const userEnvOpt: functionsEnv.UserEnvsOpts = {
        functionsSource: emulatableBackend.functionsDir,
        projectId: this.args.projectId,
        projectAlias: this.args.projectAlias,
      };
      const discoveredBuild = await runtimeDelegate.discoverBuild(runtimeConfig, environment);
      const resolution = await resolveBackend(discoveredBuild, userEnvOpt, environment);
      const discoveredBackend = resolution.backend;
      const endpoints = backend.allEndpoints(discoveredBackend);
      prepareEndpoints(endpoints);
      for (const e of endpoints) {
        e.codebase = emulatableBackend.codebase;
      }
      return emulatedFunctionsFromEndpoints(endpoints);
    }
  }

  /**
   * When a user changes their code, we need to look for triggers defined in their updates sources.
   *
   * TODO(b/216167890): Gracefully handle removal of deleted function definitions
   */
  async loadTriggers(emulatableBackend: EmulatableBackend, force = false): Promise<void> {
    if (!emulatableBackend.nodeBinary) {
      throw new FirebaseError(
        `No node binary for ${emulatableBackend.functionsDir}. This should never happen.`
      );
    }

    let triggerDefinitions: EmulatedTriggerDefinition[] = [];
    try {
      triggerDefinitions = await this.discoverTriggers(emulatableBackend);
      this.logger.logLabeled(
        "SUCCESS",
        "functions",
        `Loaded functions definitions from source: ${triggerDefinitions
          .map((t) => t.entryPoint)
          .join(", ")}.`
      );
    } catch (e) {
      this.logger.logLabeled(
        "ERROR",
        "functions",
        `Failed to load function definition from source: ${e}`
      );
      return;
    }
    // Before loading any triggers we need to make sure there are no 'stale' workers
    // in the pool that would cause us to run old code.
    this.workerPools[emulatableBackend.codebase].refresh();
    // reset blocking functions config for reloads
    this.blockingFunctionsConfig = {};

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
      // Skip function with invalid id.
      try {
        // Note - in the emulator, functionId = {region}-{functionName}, but in prod, functionId=functionName.
        // To match prod behavior, only validate functionName
        functionIdsAreValid([{ ...definition, id: definition.name }]);
      } catch (e: any) {
        throw new FirebaseError(`functions[${definition.id}]: Invalid function id: ${e.message}`);
      }

      let added = false;
      let url: string | undefined = undefined;

      const { host, port } = this.getInfo();
      if (definition.httpsTrigger) {
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
          case Constants.SERVICE_EVENTARC:
            added = await this.addEventarcTrigger(
              this.args.projectId,
              key,
              definition.eventTrigger
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
      } else if (definition.blockingTrigger) {
        const { host, port } = this.getInfo();
        url = FunctionsEmulator.getHttpFunctionUrl(
          host,
          port,
          this.args.projectId,
          definition.name,
          definition.region
        );
        added = this.addBlockingTrigger(url, definition.blockingTrigger);
      } else {
        this.logger.log(
          "WARN",
          `Unsupported function type on ${definition.name}. Expected either an httpsTrigger, eventTrigger, or blockingTrigger.`
        );
      }

      const ignored = !added;
      this.addTriggerRecord(definition, { backend: emulatableBackend, ignored, url });

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

    // In debug mode, we eagerly start a runtime process to allow debuggers to attach
    // before invoking a function.
    if (this.args.debugPort) {
      await this.startRuntime(emulatableBackend, { nodeBinary: emulatableBackend.nodeBinary });
    }
  }

  addEventarcTrigger(projectId: string, key: string, eventTrigger: EventTrigger): Promise<boolean> {
    const eventarcEmu = EmulatorRegistry.get(Emulators.EVENTARC);
    if (!eventarcEmu) {
      return Promise.resolve(false);
    }
    const bundle = {
      eventTrigger: {
        ...eventTrigger,
        service: "eventarc.googleapis.com",
      },
    };
    logger.debug(`addEventarcTrigger`, JSON.stringify(bundle));
    const client = new Client({
      urlPrefix: `http://${EmulatorRegistry.getInfoHostString(eventarcEmu.getInfo())}`,
      auth: false,
    });
    return client
      .post(`/emulator/v1/projects/${projectId}/triggers/${key}`, bundle)
      .then(() => true)
      .catch((err) => {
        this.logger.log("WARN", "Error adding Eventarc function: " + err);
        return false;
      });
  }

  async performPostLoadOperations(): Promise<void> {
    if (
      !this.blockingFunctionsConfig.triggers &&
      !this.blockingFunctionsConfig.forwardInboundCredentials
    ) {
      return;
    }

    const authEmu = EmulatorRegistry.get(Emulators.AUTH);
    if (!authEmu) {
      return;
    }

    const path = `/identitytoolkit.googleapis.com/v2/projects/${this.getProjectId()}/config?updateMask=blockingFunctions`;

    try {
      const client = new Client({
        urlPrefix: `http://${EmulatorRegistry.getInfoHostString(authEmu.getInfo())}`,
        auth: false,
      });
      await client.patch(
        path,
        { blockingFunctions: this.blockingFunctionsConfig },
        {
          headers: { Authorization: "Bearer owner" },
        }
      );
    } catch (err) {
      this.logger.log(
        "WARN",
        "Error updating blocking functions config to the auth emulator: " + err
      );
      throw err;
    }
  }

  async addRealtimeDatabaseTrigger(
    projectId: string,
    key: string,
    eventTrigger: EventTrigger
  ): Promise<boolean> {
    const databaseEmu = EmulatorRegistry.get(Emulators.DATABASE);
    if (!databaseEmu) {
      return false;
    }

    const result: string[] | null = DATABASE_PATH_PATTERN.exec(eventTrigger.resource);
    if (result === null || result.length !== 3) {
      this.logger.log(
        "WARN",
        `Event function "${key}" has malformed "resource" member. ` + `${eventTrigger.resource}`
      );
      throw new FirebaseError(`Event function ${key} has malformed resource member`);
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
        `No project in use. Registering function for sentinel namespace '${Constants.DEFAULT_DATABASE_EMULATOR_NAMESPACE}'`
      );
    }

    const client = new Client({
      urlPrefix: `http://${EmulatorRegistry.getInfoHostString(databaseEmu.getInfo())}`,
      auth: false,
    });
    try {
      await client.post(setTriggersPath, bundle, { headers: { Authorization: "Bearer owner" } });
    } catch (err: any) {
      this.logger.log("WARN", "Error adding Realtime Database function: " + err);
      throw err;
    }
    return true;
  }

  async addFirestoreTrigger(
    projectId: string,
    key: string,
    eventTrigger: EventTrigger
  ): Promise<boolean> {
    const firestoreEmu = EmulatorRegistry.get(Emulators.FIRESTORE);
    if (!firestoreEmu) {
      return Promise.resolve(false);
    }

    const bundle = JSON.stringify({
      eventTrigger: {
        ...eventTrigger,
        service: "firestore.googleapis.com",
      },
    });
    logger.debug(`addFirestoreTrigger`, JSON.stringify(bundle));

    const client = new Client({
      urlPrefix: `http://${EmulatorRegistry.getInfoHostString(firestoreEmu.getInfo())}`,
      auth: false,
    });
    try {
      await client.put(`/emulator/v1/projects/${projectId}/triggers/${key}`, bundle);
    } catch (err: any) {
      this.logger.log("WARN", "Error adding firestore function: " + err);
      throw err;
    }
    return true;
  }

  async addPubsubTrigger(
    triggerName: string,
    key: string,
    eventTrigger: EventTrigger,
    signatureType: SignatureType,
    schedule: EventSchedule | undefined
  ): Promise<boolean> {
    const pubsubEmulator = EmulatorRegistry.get(Emulators.PUBSUB) as PubsubEmulator | undefined;
    if (!pubsubEmulator) {
      return false;
    }

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
    } catch (e: any) {
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

    const bucket = eventTrigger.resource.startsWith("projects/_/buckets/")
      ? eventTrigger.resource.split("/")[3]
      : eventTrigger.resource;
    const eventTriggerId = `${projectId}:${eventTrigger.eventType}:${bucket}`;
    const triggers = this.multicastTriggers[eventTriggerId] || [];
    triggers.push(key);
    this.multicastTriggers[eventTriggerId] = triggers;
    return true;
  }

  addBlockingTrigger(url: string, blockingTrigger: BlockingTrigger): boolean {
    logger.debug(`addBlockingTrigger`, JSON.stringify({ blockingTrigger }));

    const eventType = blockingTrigger.eventType;
    if (!AUTH_BLOCKING_EVENTS.includes(eventType as any)) {
      return false;
    }

    if (blockingTrigger.eventType === BEFORE_CREATE_EVENT) {
      this.blockingFunctionsConfig.triggers = {
        ...this.blockingFunctionsConfig.triggers,
        beforeCreate: {
          functionUri: url,
        },
      };
    } else {
      this.blockingFunctionsConfig.triggers = {
        ...this.blockingFunctionsConfig.triggers,
        beforeSignIn: {
          functionUri: url,
        },
      };
    }

    this.blockingFunctionsConfig.forwardInboundCredentials = {
      accessToken: !!blockingTrigger.options!.accessToken,
      idToken: !!blockingTrigger.options!.idToken,
      refreshToken: !!blockingTrigger.options!.refreshToken,
    };

    return true;
  }

  getProjectId(): string {
    return this.args.projectId;
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost();
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

  getTriggerRecordByKey(triggerKey: string): EmulatedTriggerRecord {
    const record = this.triggers[triggerKey];
    if (!record) {
      logger.debug(`Could not find key=${triggerKey} in ${JSON.stringify(this.triggers)}`);
      throw new FirebaseError(`No function with key ${triggerKey}`);
    }

    return record;
  }

  getTriggerKey(def: EmulatedTriggerDefinition): string {
    // For background triggers we attach the current generation as a suffix
    if (def.eventTrigger) {
      const triggerKey = `${def.id}-${this.triggerGeneration}`;
      return def.eventTrigger.channel ? `${triggerKey}-${def.eventTrigger.channel}` : triggerKey;
    } else {
      return def.id;
    }
  }

  getBackendInfo(): BackendInfo[] {
    const cf3Triggers = this.getCF3Triggers();
    return this.args.emulatableBackends.map((e: EmulatableBackend) => {
      return toBackendInfo(e, cf3Triggers);
    });
  }

  getCF3Triggers(): ParsedTriggerDefinition[] {
    return Object.values(this.triggers)
      .filter((t) => !t.backend.extensionInstanceId)
      .map((t) => t.def);
  }

  addTriggerRecord(
    def: EmulatedTriggerDefinition,
    opts: {
      ignored: boolean;
      backend: EmulatableBackend;
      url?: string;
    }
  ): void {
    const key = this.getTriggerKey(def);
    this.triggers[key] = {
      def,
      enabled: true,
      backend: opts.backend,
      ignored: opts.ignored,
      url: opts.url,
    };
  }

  setTriggersForTesting(triggers: EmulatedTriggerDefinition[], backend: EmulatableBackend) {
    this.triggers = {};
    triggers.forEach((def) => this.addTriggerRecord(def, { backend, ignored: false }));
  }

  getBaseBundle(): FunctionsRuntimeBundle {
    return {
      proto: {},
      disabled_features: this.args.disabledRuntimeFeatures,
    };
  }

  getNodeBinary(backend: EmulatableBackend): string {
    const pkg = require(path.join(backend.functionsDir, "package.json"));
    // If the developer hasn't specified a Node to use, inform them that it's an option and use default
    if ((!pkg.engines || !pkg.engines.node) && !backend.nodeMajorVersion) {
      this.logger.log(
        "WARN",
        `Your functions directory ${backend.functionsDir} does not specify a Node version.\n   ` +
          "- Learn more at https://firebase.google.com/docs/functions/manage-functions#set_runtime_options"
      );
      return process.execPath;
    }

    const hostMajorVersion = process.versions.node.split(".")[0];
    const requestedMajorVersion: string = backend.nodeMajorVersion
      ? `${backend.nodeMajorVersion}`
      : pkg.engines.node;
    let localMajorVersion = "0";
    const localNodePath = path.join(backend.functionsDir, "node_modules/.bin/node");

    // Next check if we have a Node install in the node_modules folder
    try {
      const localNodeOutput = spawn.sync(localNodePath, ["--version"]).stdout.toString();
      localMajorVersion = localNodeOutput.slice(1).split(".")[0];
    } catch (err: any) {
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
    } else {
      // Otherwise we'll warn and use the version that is currently running this process.
      if (process.env.FIREPIT_VERSION) {
        this.logger.log(
          "WARN",
          `You've requested "node" version "${requestedMajorVersion}", but the standalone Firebase CLI comes with bundled Node "${hostMajorVersion}".`
        );
        this.logger.log(
          "INFO",
          `To use a different Node.js version, consider removing the standalone Firebase CLI and switching to "firebase-tools" on npm.`
        );
      } else {
        this.logger.log(
          "WARN",
          `Your requested "node" version "${requestedMajorVersion}" doesn't match your global version "${hostMajorVersion}". Using node@${hostMajorVersion} from host.`
        );
      }
    }

    return process.execPath;
  }

  getRuntimeConfig(backend: EmulatableBackend): Record<string, string> {
    const configPath = `${backend.functionsDir}/.runtimeconfig.json`;
    try {
      const configContent = fs.readFileSync(configPath, "utf8");
      return JSON.parse(configContent.toString());
    } catch (e) {
      // This is fine - runtime config is optional.
    }
    return {};
  }

  getUserEnvs(backend: EmulatableBackend): Record<string, string> {
    const projectInfo = {
      functionsSource: backend.functionsDir,
      projectId: this.args.projectId,
      projectAlias: this.args.projectAlias,
      isEmulator: true,
    };

    if (functionsEnv.hasUserEnvs(projectInfo)) {
      try {
        return functionsEnv.loadUserEnvs(projectInfo);
      } catch (e: any) {
        // Ignore - user envs are optional.
        logger.debug("Failed to load local environment variables", e);
      }
    }
    return {};
  }

  getSystemEnvs(trigger?: EmulatedTriggerDefinition): Record<string, string> {
    const envs: Record<string, string> = {};

    // Env vars guaranteed by GCF platform.
    //   https://cloud.google.com/functions/docs/env-var
    envs.GCLOUD_PROJECT = this.args.projectId;
    envs.K_REVISION = "1";
    envs.PORT = "80";

    // TODO(danielylee): Later, we want timeout to be enforce by the data plane. For now, we rely on the runtime to
    // enforce timeout.
    if (trigger?.timeoutSeconds) {
      envs.FUNCTIONS_EMULATOR_TIMEOUT_SECONDS = trigger.timeoutSeconds.toString();
    }

    if (trigger) {
      const target = trigger.entryPoint;
      envs.FUNCTION_TARGET = target;
      envs.FUNCTION_SIGNATURE_TYPE = getSignatureType(trigger);
      envs.K_SERVICE = trigger.name;
    }
    return envs;
  }

  getEmulatorEnvs(): Record<string, string> {
    const envs: Record<string, string> = {};

    envs.FUNCTIONS_EMULATOR = "true";
    envs.TZ = "UTC"; // Fixes https://github.com/firebase/firebase-tools/issues/2253
    envs.FIREBASE_DEBUG_MODE = "true";
    envs.FIREBASE_DEBUG_FEATURES = JSON.stringify({
      skipTokenVerification: true,
      enableCors: true,
    });
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

    const eventarcEmulator = this.getEmulatorInfo(Emulators.EVENTARC);
    if (eventarcEmulator) {
      envs[Constants.CLOUD_EVENTARC_EMULATOR_HOST] = `http://${formatHost(eventarcEmulator)}`;
    }

    if (this.args.debugPort) {
      // Start runtime in debug mode to allow triggers to share single runtime process.
      envs["FUNCTION_DEBUG_MODE"] = "true";
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

  getRuntimeEnvs(
    backend: EmulatableBackend,
    trigger?: EmulatedTriggerDefinition
  ): Record<string, string> {
    return {
      ...this.getUserEnvs(backend),
      ...this.getSystemEnvs(trigger),
      ...this.getEmulatorEnvs(),
      FIREBASE_CONFIG: this.getFirebaseConfig(),
      ...backend.env,
    };
  }

  async resolveSecretEnvs(
    backend: EmulatableBackend,
    trigger?: EmulatedTriggerDefinition
  ): Promise<Record<string, string>> {
    let secretEnvs: Record<string, string> = {};

    const secretPath = getSecretLocalPath(backend, this.args.projectDir);
    try {
      const data = fs.readFileSync(secretPath, "utf8");
      secretEnvs = functionsEnv.parseStrict(data);
    } catch (e: any) {
      if (e.code !== "ENOENT") {
        this.logger.logLabeled(
          "ERROR",
          "functions",
          `Failed to read local secrets file ${secretPath}: ${e.message}`
        );
      }
    }

    if (trigger) {
      const secrets: backend.SecretEnvVar[] = trigger.secretEnvironmentVariables || [];
      const accesses = secrets
        .filter((s) => !secretEnvs[s.key])
        .map(async (s) => {
          this.logger.logLabeled("INFO", "functions", `Trying to access secret ${s.secret}@latest`);
          const value = await accessSecretVersion(
            this.getProjectId(),
            s.secret,
            s.version ?? "latest"
          );
          return [s.key, value];
        });
      const accessResults = await allSettled(accesses);

      const errs: string[] = [];
      for (const result of accessResults) {
        if (result.status === "rejected") {
          errs.push(result.reason as string);
        } else {
          const [k, v] = result.value;
          secretEnvs[k] = v;
        }
      }

      if (errs.length > 0) {
        this.logger.logLabeled(
          "ERROR",
          "functions",
          "Unable to access secret environment variables from Google Cloud Secret Manager. " +
            "Make sure the credential used for the Functions Emulator have access " +
            `or provide override values in ${secretPath}:\n\t` +
            errs.join("\n\t")
        );
      }
    }

    return secretEnvs;
  }

  async invokeRuntime(
    backend: EmulatableBackend,
    trigger: EmulatedTriggerDefinition,
    frb: FunctionsRuntimeBundle,
    opts: InvokeRuntimeOpts
  ): Promise<RuntimeWorker> {
    const pool = this.workerPools[backend.codebase];
    if (!pool.readyForWork(trigger.id)) {
      await this.startRuntime(backend, opts, trigger);
    }
    return pool.submitWork(trigger.id, frb, opts);
  }

  async startRuntime(
    backend: EmulatableBackend,
    opts: InvokeRuntimeOpts,
    trigger?: EmulatedTriggerDefinition
  ) {
    const emitter = new EventEmitter();
    const args = [path.join(__dirname, "functionsEmulatorRuntime")];

    if (opts.ignore_warnings) {
      args.unshift("--no-warnings");
    }

    if (this.args.debugPort) {
      if (process.env.FIREPIT_VERSION && process.execPath === opts.nodeBinary) {
        const requestedMajorNodeVersion = this.getNodeBinary(backend);
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
    const pnpPath = path.join(backend.functionsDir, ".pnp.js");
    if (fs.existsSync(pnpPath)) {
      EmulatorLogger.forEmulator(Emulators.FUNCTIONS).logLabeled(
        "WARN_ONCE",
        "functions",
        "Detected yarn@2 with PnP. " +
          "Cloud Functions for Firebase requires a node_modules folder to work correctly and is therefore incompatible with PnP. " +
          "See https://yarnpkg.com/getting-started/migration#step-by-step for more information."
      );
    }

    const runtimeEnv = this.getRuntimeEnvs(backend, trigger);
    const secretEnvs = await this.resolveSecretEnvs(backend, trigger);
    const socketPath = getTemporarySocketPath();

    const childProcess = spawn(opts.nodeBinary, args, {
      cwd: backend.functionsDir,
      env: {
        node: opts.nodeBinary,
        ...process.env,
        ...runtimeEnv,
        ...secretEnvs,
        PORT: socketPath,
      },
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });

    const runtime: FunctionsRuntimeInstance = {
      process: childProcess,
      events: emitter,
      cwd: backend.functionsDir,
      socketPath,
    };
    const extensionLogInfo = {
      instanceId: backend.extensionInstanceId,
      ref: backend.extensionVersion?.ref,
    };
    const pool = this.workerPools[backend.codebase];
    const worker = pool.addWorker(trigger?.id, runtime, extensionLogInfo);
    await worker.waitForSocketReady();
    return;
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
    for (const backend of this.args.emulatableBackends) {
      await this.loadTriggers(backend);
    }
    await this.performPostLoadOperations();
    return;
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
    const match = /^Bearer (.*)$/.exec(authHeader);
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
    } catch (e: any) {
      return;
    }
  }

  private async handleHttpsTrigger(req: express.Request, res: express.Response) {
    const method = req.method;
    let triggerId: string = req.params.trigger_name;
    if (req.params.region) {
      triggerId = `${req.params.region}-${triggerId}`;
    }

    if (!this.triggers[triggerId]) {
      res
        .status(404)
        .send(
          `Function ${triggerId} does not exist, valid functions are: ${Object.keys(
            this.triggers
          ).join(", ")}`
        );
      return;
    }

    const record = this.getTriggerRecordByKey(triggerId);
    const trigger = record.def;
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
    const worker = await this.invokeTrigger(trigger);

    // For analytics, track the invoked service
    void track(EVENT_INVOKE, getFunctionService(trigger));
    void trackEmulator(EVENT_INVOKE_GA4, {
      function_service: getFunctionService(trigger),
    });

    worker.onLogs((el: EmulatorLog) => {
      if (el.level === "FATAL") {
        res.status(500).send(el.text);
      }
    });

    this.logger.log("DEBUG", `[functions] Runtime ready! Sending request!`);

    // To match production behavior we need to drop the path prefix
    // req.url = /:projectId/:region/:trigger_name/*
    const url = new URL(`${req.protocol}://${req.hostname}${req.url}`);
    const path = `${url.pathname}${url.search}`.replace(
      new RegExp(`\/${this.args.projectId}\/[^\/]*\/${req.params.trigger_name}\/?`),
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
        socketPath: worker.runtime.socketPath,
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
}
