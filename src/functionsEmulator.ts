"use strict";

import * as _ from "lodash";
import * as clc from "cli-color";
import * as path from "path";
import * as express from "express";
import * as fft from "firebase-functions-test";
import { Change, EventContext } from "firebase-functions";
import * as request from "request";
import * as grpc from "grpc";
import * as admin from "firebase-admin";

import * as getProjectId from "./getProjectId";
import * as functionsConfig from "./functionsConfig";
import * as utils from "./utils";
import * as logger from "./logger";
import * as parseTriggers from "./parseTriggers";

// TODO: Should be a TS import
const jsdiff = require("diff");

class FunctionsEmulator {
  private server: any;

  constructor(private options: any) {}

  async start(...args: any[]): Promise<any> {
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

    const app = admin.initializeApp({ projectId });

    // TODO: This needs to point at the running Firestore emulator
    app.firestore().settings({
      projectId,
      port: 8080,
      servicePath: "localhost",
      service: "firestore.googleapis.com",
      sslCreds: grpc.credentials.createInsecure(),
    });

    const adminResolve = require.resolve("firebase-admin", {
      paths: [path.join(functionsDir, "node_modules")],
    });
    const adminMock = {
      initializeApp(): admin.app.App {
        if (!initializeAppWarned) {
          console.log(
            `${clc.yellow(
              "[HUB]"
            )} Your code attempted to use "admin.initializeApp()" we've ignored your options and provided an emulated app instead.`
          );
          initializeAppWarned = true;
        }
        return app;
      },
    };

    (adminMock as any).default = adminMock;
    require.cache[adminResolve] = {
      exports: adminMock,
    };

    let triggers;
    try {
      triggers = await parseTriggers(projectId, functionsDir, {}, JSON.stringify(firebaseConfig));
    } catch (e) {
      utils.logWarning(
        clc.yellow("functions:") +
          " Failed to load functions source code. " +
          "Ensure that you have the latest SDK by running " +
          clc.bold("npm i --save firebase-functions") +
          " inside the functions directory."
      );
      logger.debug("Error during trigger parsing: ", e.message);
      throw e;
    }

    const triggersByName = triggers.reduce(
      (triggersByName: { [triggerName: string]: any }, trigger: any) => {
        trigger.getRawFunction = () => {
          const oldFunction = _.get(require(functionsDir), trigger.entryPoint);
          delete require.cache[require.resolve(functionsDir)];
          const module = require(functionsDir);

          const newFunction = _.get(module, trigger.entryPoint);

          const oldStr = oldFunction.run.toString();
          const newStr = newFunction.run.toString();

          if (oldStr !== newStr) {
            console.log(
              `${clc.blue("[FUNCTION:FIRESTORE]")} Your function "${
                trigger.name
              }" has been changed, here's the diff...`
            );

            const diff = jsdiff.diffChars(oldStr, newStr);

            diff.forEach((part: any) => {
              const color = part.added ? "green" : part.removed ? "red" : "blackBright";
              process.stderr.write((clc as any)[color](part.value));
            });
            process.stderr.write("\n");
          }

          console.log(
            `${clc.blue("[FUNCTION:FIRESTORE]")} Your function "${
              trigger.name
            }" will be invoked, here's the logs...`
          );
          return newFunction;
        };
        trigger.getWrappedFunction = () => {
          return fft().wrap(trigger.getRawFunction());
        };
        triggersByName[trigger.name] = trigger;
        return triggersByName;
      },
      {}
    );

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
      console.log(
        `${clc.blue("[FUNCTION:HTTP]")} GET request to function ${
          req.params.trigger_name
        } accepted.`
      );
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
        console.log(`${clc.blue("[FUNCTION:HTTP]")} POST request to function rejected`);
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

        const path = proto.context.resource.name;
        const params = _extractParamsFromPath(trigger.eventTrigger.resource, path);

        const ctx = {
          eventId: proto.context.eventId,
          timestamp: proto.context.timestamp,
          params,
          auth: {},
          authType: "UNAUTHENTICATED",
        } as EventContext;

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

          console.log(`${clc.blackBright("> ")}${lines}`);
        }

        console.log(`${clc.blue("[FUNCTION:FIRESTORE]")} Function execution done!`);
        res.json({ status: "success" });
      }
    });

    // TODO: This needs to take a port argument
    // TODO: All of the console.log() statements need to be moved to logger statements
    this.server = hub.listen(5000, () => {
      console.log(`${clc.yellow("[HUB]")} Functions emulator hub is live on port :5000`);
      Object.keys(triggersByName).forEach((name) => {
        const trigger = triggersByName[name];
        if (!trigger.eventTrigger) {
          return;
        }

        const bundle = JSON.stringify({ eventTrigger: trigger.eventTrigger });
        console.log(`${clc.green("[FIRESTORE]")} Attempting to set up trigger "${name}"`);

        request.put(
          `http://localhost:8080/emulator/v1/projects/${projectId}/triggers/${name}`,
          {
            body: bundle,
          },
          (err, res, body) => {
            if (err) {
              console.warn(body);
              return;
            }

            if (JSON.stringify(JSON.parse(body)) === "{}") {
              console.log(
                `${clc.green(
                  "[FIRESTORE]"
                )} Trigger "${name}" has been acknowledged by the Firestore emulator`
              );
            }
          }
        );
      });
    });
  }

  stop(): any {
    this.server.close();
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

export function _trimSlashes(path: string): string {
  return path
    .split("/")
    .filter((c) => c)
    .join("/");
}

module.exports = FunctionsEmulator;
