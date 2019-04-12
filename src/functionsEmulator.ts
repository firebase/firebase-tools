/* tslint:disable:no-console */
"use strict";

import * as _ from "lodash";
import * as clc from "cli-color";
import * as path from "path";
import * as express from "express";
import * as fft from "firebase-functions-test";
import * as request from "request";

import * as getProjectId from "./getProjectId";
import * as functionsConfig from "./functionsConfig";
import * as utils from "./utils";
import * as logger from "./logger";
import * as parseTriggers from "./parseTriggers";
import { Constants } from "./emulator/constants";
import { EmulatorInstance, Emulators } from "./emulator/types";

const SERVICE_FIRESTORE = "firestore.googleapis.com";
const SUPPORTED_SERVICES = [SERVICE_FIRESTORE];

interface FunctionsEmulatorArgs {
  port?: number;
  firestorePort?: number;
}

export class FunctionsEmulator implements EmulatorInstance {
  private port: number = Constants.getDefaultPort(Emulators.FUNCTIONS);
  private firestorePort: number = -1;
  private server: any;

  constructor(private options: any, private args: FunctionsEmulatorArgs) {}

  async start(): Promise<any> {
    // We do this in start to avoid attempting to initialize admin on require
    const { Change } = require("firebase-functions");

    if (this.args.port) {
      this.port = this.args.port;
    }

    if (this.args.firestorePort) {
      this.firestorePort = this.args.firestorePort;
    }

    const projectId = getProjectId(this.options, false);
    const functionsDir = path.join(
      this.options.config.projectDir,
      this.options.config.get("functions.source")
    );

    // TODO: This call requires authentication, which we should remove eventually
    const firebaseConfig = await functionsConfig.getFirebaseConfig(this.options);

    let initializeAppWarned = false;

    process.env.FIREBASE_CONFIG = JSON.stringify(firebaseConfig);
    process.env.FIREBASE_PROJECT = projectId;
    process.env.GCLOUD_PROJECT = projectId;

    let app: any;
    try {
      const adminResolve = require.resolve("firebase-admin", {
        paths: [path.join(functionsDir, "node_modules")],
      });
      const grpc = require(require.resolve("grpc", {
        paths: [path.join(functionsDir, "node_modules")],
      }));

      const admin = require(adminResolve);
      app = admin.initializeApp({ projectId });

      if (this.firestorePort > 0) {
        app.firestore().settings({
          projectId,
          port: this.firestorePort,
          servicePath: "localhost",
          service: "firestore.googleapis.com",
          sslCreds: grpc.credentials.createInsecure(),
        });
      }

      admin.initializeApp = () => {
        {
          if (!initializeAppWarned) {
            utils.logWarning(
              'Your code attempted to use "admin.initializeApp()" we\'ve ' +
                "ignored your options and provided an emulated app instead."
            );
            initializeAppWarned = true;
          }
          return app;
        }
      };

      require.cache[adminResolve] = {
        exports: admin,
      };
    } catch (err) {
      utils.logWarning(
        `Could not initialize your functions code, did you forget to "npm install"?`
      );
    }

    let triggers;
    try {
      triggers = await parseTriggers(projectId, functionsDir, {}, JSON.stringify(firebaseConfig));
    } catch (e) {
      utils.logWarning(
        "[functions]" +
          " Failed to load functions source code. " +
          "Ensure that you have the latest SDK by running " +
          clc.bold("npm i --save firebase-functions") +
          " inside the functions directory."
      );
      logger.debug("Error during trigger parsing: ", e.message);
      throw e;
    }

    const triggersByName = triggers.reduce((obj: { [triggerName: string]: any }, trigger: any) => {
      trigger.getRawFunction = () => {
        const oldFunction = _.get(require(functionsDir), trigger.entryPoint);
        delete require.cache[require.resolve(functionsDir)];
        const module = require(functionsDir);
        const newFunction = _.get(module, trigger.entryPoint);

        if (newFunction.run && oldFunction.run) {
          const oldStr = oldFunction.run.toString();
          const newStr = newFunction.run.toString();

          if (oldStr !== newStr) {
            logger.debug(`[functions] Function "${trigger.name}" has been updated.`);
            // const diff = jsdiff.diffChars(oldStr, newStr);
            //
            // diff.forEach((part: any) => {
            //   const color = part.added ? "green" : part.removed ? "red" : "blackBright";
            //   process.stderr.write((clc as any)[color](part.value));
            // });
            // process.stderr.write("\n");
          }
        }
        logger.debug(`[functions] Function "${trigger.name}" will be invoked. Logs:`);
        return newFunction;
      };
      trigger.getWrappedFunction = () => {
        return fft().wrap(trigger.getRawFunction());
      };
      obj[trigger.name] = trigger;
      return obj;
    }, {});

    const networkingModules = [
      { module: require("http").globalAgent, method: "createConnection" }, // Handles HTTP
      { module: require("tls"), method: "connect" }, // Handles HTTPs
      { module: require("net"), method: "connect" },
      // require("http2").connect
      // require("google-gax").GrpcClient
    ];

    networkingModules.forEach((bundle) => {
      const mod = bundle.module;
      const original = mod[bundle.method].bind(mod);
      mod[bundle.method] = (...args: any[]) => {
        const hrefs = args.map((arg) => arg.href).filter((v) => v);
        const href = hrefs.length && hrefs[0];
        if (href.indexOf("googleapis.com") !== -1) {
          logger.info(`Your emulated function is attempting to access a production API "${href}".`);
        } else {
          logger.info(`Your emulator function has accessed the URL "${href}".`);
        }

        return original(...args);
      };
    });

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

    hub.get("/", (req, res) => {
      res.json(triggersByName);
    });

    hub.get("/functions/projects/:project_id/triggers/:trigger_name", (req, res) => {
      logger.debug(`[functions] GET request to function ${req.params.trigger_name} accepted.`);
      const trigger = triggersByName[req.params.trigger_name];
      if (trigger.httpsTrigger) {
        trigger.getRawFunction()(req, res);
      } else {
        res.json({
          status: "error",
          message: "non-HTTPS trigger must be invoked with POST request",
        });
      }
    });

    hub.post("/functions/projects/:project_id/triggers/:trigger_name", (req, res) => {
      const trigger = triggersByName[req.params.trigger_name];

      if (trigger.httpsTrigger) {
        logger.debug(`[functions] POST request to function rejected`);
      } else {
        const body = (req as any).rawBody;
        const proto = JSON.parse(body);

        const newSnap =
          proto.data.value &&
          (app.firestore() as any).snapshot_(proto.data.value, new Date().toISOString(), "json");
        const oldSnap =
          proto.data.oldValue &&
          (app.firestore() as any).snapshot_(proto.data.oldValue, new Date().toISOString(), "json");

        let data;
        switch (proto.context.eventType) {
          case "providers/cloud.firestore/eventTypes/document.write":
            data = Change.fromObjects(oldSnap, newSnap);
            break;
          case "providers/cloud.firestore/eventTypes/document.delete":
            data = Change.fromObjects(oldSnap, newSnap);
            break;
          default:
            data = newSnap && oldSnap ? Change.fromObjects(oldSnap, newSnap) : newSnap;
        }

        const resourcePath = proto.context.resource.name;
        const params = _extractParamsFromPath(trigger.eventTrigger.resource, resourcePath);

        const ctx = {
          eventId: proto.context.eventId,
          timestamp: proto.context.timestamp,
          params,
          auth: {},
          authType: "UNAUTHENTICATED",
        };

        const func = trigger.getWrappedFunction();
        const log = console.log;

        console.log = (...messages: any[]) => {
          log(clc.blackBright(">"), ...messages);
        };

        let caughtErr;
        try {
          func(data, ctx);
        } catch (err) {
          caughtErr = err;
        }
        console.log = log;

        if (caughtErr) {
          const lines = caughtErr.stack.split("\n").join(`\n${clc.blackBright("> ")}`);

          logger.debug(`${clc.blackBright("> ")}${lines}`);
        }

        logger.debug(`[functions] Function execution complete.`);
        res.json({ status: "success" });
      }
    });

    this.server = hub.listen(this.port, () => {
      logger.debug(`[functions] Functions emulator is live on port ${this.port}`);
      Object.keys(triggersByName).forEach((name) => {
        const trigger = triggersByName[name];
        if (trigger.httpsTrigger) {
          const url = `http://localhost:${
            this.port
          }/functions/projects/${projectId}/triggers/${name}`;
          utils.logLabeledBullet("functions", `HTTP trigger initialized at "${url}"`);
          return;
        }

        const service: string = _.get(trigger, "eventTrigger.service", "unknown");
        switch (service) {
          case SERVICE_FIRESTORE:
            this.addFirestoreTrigger(projectId, name, trigger);
            break;
          default:
            logger.debug(`Unsupported trigger: ${JSON.stringify(trigger)}`);
            utils.logWarning(
              `Ignpring trigger "${name}" because the service "${service}" is not yet supported.`
            );
            break;
        }
      });
    });
  }

  addFirestoreTrigger(projectId: string, name: string, trigger: any): void {
    if (this.firestorePort <= 0) {
      utils.logWarning(`Ignoring trigger "${name}" because the Firestore emulator is not running.`);
      return;
    }

    const bundle = JSON.stringify({ eventTrigger: trigger.eventTrigger });
    utils.logLabeledBullet("functions", `Setting up firestore trigger "${name}"`);

    utils.logLabeledBullet(
      "functions",
      `Attempting to contact firestore emulator on port ${this.firestorePort}`
    );
    request.put(
      `http://localhost:${this.firestorePort}/emulator/v1/projects/${projectId}/triggers/${name}`,
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

  stop(): Promise<any> {
    return Promise.resolve(this.server.close());
  }
}

const wildcardRegex = new RegExp("{[^/{}]*}", "g");

function _extractParamsFromPath(wildcardPath: string, snapshotPath: string): any {
  if (!_isValidWildcardMatch(wildcardPath, snapshotPath)) {
    return {};
  }

  const wildcardKeyRegex = /{(.+)}/;
  const wildcardChunks = _trimSlashes(wildcardPath).split("/");
  const snapshotChucks = _trimSlashes(snapshotPath).split("/");
  return wildcardChunks
    .slice(-snapshotChucks.length)
    .reduce((params: { [key: string]: string }, chunk, index) => {
      const match = wildcardKeyRegex.exec(chunk);
      if (match) {
        const wildcardKey = match[1];
        const potentialWildcardValue = snapshotChucks[index];
        if (!wildcardKeyRegex.exec(potentialWildcardValue)) {
          params[wildcardKey] = potentialWildcardValue;
        }
      }
      return params;
    }, {});
}

function _isValidWildcardMatch(wildcardPath: string, snapshotPath: string): boolean {
  const wildcardChunks = _trimSlashes(wildcardPath).split("/");
  const snapshotChucks = _trimSlashes(snapshotPath).split("/");

  if (snapshotChucks.length > wildcardChunks.length) {
    return false;
  }

  const mismatchedChunks = wildcardChunks.slice(-snapshotChucks.length).filter((chunk, index) => {
    return !(wildcardRegex.exec(chunk) || chunk === snapshotChucks[index]);
  });

  return !mismatchedChunks.length;
}

function _trimSlashes(str: string): string {
  return str
    .split("/")
    .filter((c) => c)
    .join("/");
}
