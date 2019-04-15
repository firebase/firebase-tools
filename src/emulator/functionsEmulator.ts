"use strict";

import * as _ from "lodash";
import * as path from "path";
import * as express from "express";
import * as request from "request";

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
      let data = "";
      req.on("data", (chunk: any) => {
        data += chunk;
      });
      req.on("end", () => {
        (req as any).rawBody = data;
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

    // TODO: This is trash, I write trash
    hub.get("/functions/projects/:project_id/triggers/:trigger_name", async (req, res) => {
      logger.debug(`[functions] GET request to function ${req.params.trigger_name} accepted.`);
      const triggersByName = await getTriggersFromDirectory(
        this.projectId,
        this.functionsDir,
        this.firebaseConfig
      );
      const trigger = triggersByName[req.params.trigger_name];
      if (trigger.definition.httpsTrigger) {
        trigger.getRawFunction()(req, res);
      } else {
        res.json({
          status: "error",
          message: "non-HTTPS trigger must be invoked with POST request",
        });
      }
    });

    hub.post("/functions/projects/:project_id/triggers/:trigger_name", async (req, res) => {
      const triggersByName = await getTriggersFromDirectory(
        this.projectId,
        this.functionsDir,
        this.firebaseConfig
      );
      const trigger = triggersByName[req.params.trigger_name];

      if (trigger.definition.httpsTrigger) {
        logger.debug(`[functions] POST request to function rejected`);
        return res.json({ status: "rejected" });
      }

      const frb = {
        ports: {
          firestore: EmulatorRegistry.getPort(Emulators.FIRESTORE),
        },
        cwd: this.functionsDir,
        proto: JSON.parse((req as any).rawBody),
        triggerId: req.params.trigger_name,
        projectId: this.projectId,
      } as FunctionsRuntimeBundle;

      const runtime = InvokeRuntime(nodeBinary, frb);

      runtime.events.on("log", (log: EmulatorLog) => {
        if (["SYSTEM", "DEBUG"].indexOf(log.level) >= 0) {
          // Handle system interrupts
          return;
        } else {
          logger.info(`${log.level}: ${log.text}`);
        }
      });
      await runtime.exit;
      res.json({ status: "acknowledged" });
    });

    this.server = hub.listen(this.port);
  }

  async connect(): Promise<void> {
    const triggersByName = await getTriggersFromDirectory(
      this.projectId,
      this.functionsDir,
      this.firebaseConfig
    );
    Object.keys(triggersByName).forEach((name) => {
      const trigger = triggersByName[name];
      if (trigger.definition.httpsTrigger) {
        const url = `http://localhost:${this.port}/functions/projects/${
          this.projectId
        }/triggers/${name}`;
        utils.logLabeledBullet("functions", `HTTP trigger initialized at "${url}"`);
        return;
      }

      const service: string = _.get(trigger.definition, "eventTrigger.service", "unknown");
      switch (service) {
        case SERVICE_FIRESTORE:
          this.addFirestoreTrigger(this.projectId, name, trigger);
          break;
        default:
          logger.debug(`Unsupported trigger: ${JSON.stringify(trigger)}`);
          utils.logWarning(
            `Ignoring trigger "${name}" because the service "${service}" is not yet supported.`
          );
          break;
      }
    });
  }

  addFirestoreTrigger(projectId: string, name: string, trigger: any): void {
    const firestorePort = EmulatorRegistry.getPort(Emulators.FIRESTORE);
    if (firestorePort <= 0) {
      utils.logWarning(`Ignoring trigger "${name}" because the Firestore emulator is not running.`);
      return;
    }

    const bundle = JSON.stringify({ eventTrigger: trigger.definition.eventTrigger });
    utils.logLabeledBullet("functions", `Setting up firestore trigger "${name}"`);

    utils.logLabeledBullet(
      "functions",
      `Attempting to contact firestore emulator on port ${firestorePort}`
    );
    request.put(
      `http://localhost:${firestorePort}/emulator/v1/projects/${projectId}/triggers/${name}`,
      {
        body: bundle,
      },
      (err, res, body) => {
        if (err) {
          utils.logWarning("Error adding trigger: " + err);
          return;
        }

        if (JSON.stringify(JSON.parse(body)) === "{}") {
          utils.logLabeledSuccess(
            "functions",
            `Trigger "${name}" has been acknowledged by the firestore emulator.`
          );
        }
      }
    );
  }

  stop(): Promise<void> {
    return Promise.resolve(this.server.close());
  }
}

export function InvokeRuntime(
  nodeBinary: string,
  frb: FunctionsRuntimeBundle,
  serializedTriggers?: string
): { exit: Promise<number>; events: EventEmitter } {
  const emitter = new EventEmitter();

  const runtime = spawn(
    nodeBinary,
    [
      path.join(__dirname, "functionsEmulatorRuntime.js"),
      JSON.stringify(frb),
      serializedTriggers || "",
    ],
    {}
  );

  let stderr = "";
  runtime.stderr.on("data", (buf) => {
    stderr += buf.toString();
  });

  let stdout = "";
  runtime.stdout.on("data", (buf) => {
    stdout += buf;
    const lines = stdout.split("\n");

    if (lines.length > 1) {
      lines.slice(0, -1).forEach((line) => {
        emitter.emit("log", EmulatorLog.fromJSON(line));
      });
    }

    stdout = lines[lines.length - 1];
  });

  return {
    exit: new Promise<number>((resolve, reject) => {
      runtime.on("exit", (code) => {
        if (code === 0) {
          resolve(code);
        } else {
          reject(stderr);
        }
      });
    }),
    events: emitter,
  };
}

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
    utils.logSuccess(`Using node@${requestedMajorVersion} from host.`);
    return process.execPath;
  }

  // If the requested version is already locally available, let's use that
  if (localMajorVersion === requestedMajorVersion) {
    utils.logSuccess(`Using node@${requestedMajorVersion} from local cache.`);
    return localNodePath;
  }

  /*
    Otherwise we'll begin the conversational flow to install the correct version locally
   */

  utils.logWarning(
    `Your requested "node" version "${requestedMajorVersion}" doesn't match your global version "${hostMajorVersion}"`
  );
  utils.logBullet(
    `We can install node@${requestedMajorVersion} to the "node_modules" without impacting your global "node" install`
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
    await _spawnAsPromise("npm", ["install", `node@${requestedMajorVersion}`, "--save-dev"], {
      cwd,
      stdio: "inherit",
    });
    /* TODO: Switching Node versions can result in node-gyp errors, run a rebuild after switching
      versions and probably on exit to original node version */
    // TODO: Certain npm commands appear to mess up npm globally, maybe remove node_modules/.bin/node to avoid this?

    return localNodePath;
  }

  // If they say no, just warn them about using host version and continue on.
  utils.logWarning(`Using node@${requestedMajorVersion} from host.`);

  return process.execPath;
}

async function _spawnAsPromise(
  command: string,
  args: string[],
  options?: { [s: string]: string }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = spawn(command, args, options);

    bin.on("error", (err) => {
      logger.debug(err.stack);
      reject(err);
    });

    bin.on("close", (code) => {
      if (code === 0) {
        return resolve();
      }
      return reject();
    });
  });
}
