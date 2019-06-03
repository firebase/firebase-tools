import * as _ from "lodash";
import * as chokidar from "chokidar";
import * as fs from "fs";
import * as request from "request";

import * as utils from "../utils";
import * as javaEmulators from "../serve/javaEmulators";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { EmulatorRegistry } from "./registry";
import { EmulatorLogger } from "../emulator/emulatorLogger";
import { Constants } from "./constants";

// Args that should be passed from here to the JAR, if present.
const JAR_ARGS: string[] = ["port", "host", "rules", "functions_emulator"];

export interface FirestoreEmulatorArgs {
  port?: number;
  host?: string;
  projectId?: string;
  rules?: string;
  functions_emulator?: string;
}

export class FirestoreEmulator implements EmulatorInstance {
  static FIRESTORE_EMULATOR_ENV = "FIREBASE_FIRESTORE_EMULATOR_ADDRESS";

  rulesWatcher?: chokidar.FSWatcher;

  constructor(private args: FirestoreEmulatorArgs) {}

  async start(): Promise<void> {
    const functionsPort = EmulatorRegistry.getPort(Emulators.FUNCTIONS);
    if (functionsPort) {
      this.args.functions_emulator = `localhost:${functionsPort}`;
    }

    if (this.args.rules && this.args.projectId) {
      const path = this.args.rules;
      this.rulesWatcher = chokidar.watch(path, { persistent: true, ignoreInitial: true });
      this.rulesWatcher.on("change", (event, stats) => {
        const newContent = fs.readFileSync(path).toString();

        utils.logLabeledBullet("firestore", "Change detected, updating rules...");
        this.updateRules(newContent)
          .then(() => {
            utils.logLabeledSuccess("firestore", "Rules updated.");
          })
          .catch((err) => {
            utils.logWarning("Failed to update rules.");
            EmulatorLogger.log("DEBUG", err);
          });
      });
    }

    const jarArgs = _.pick(this.args, JAR_ARGS);
    return javaEmulators.start(Emulators.FIRESTORE, jarArgs);
  }

  async connect(): Promise<void> {
    // The Firestore emulator has no "connect" phase.
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    if (this.rulesWatcher) {
      this.rulesWatcher.close();
    }

    return javaEmulators.stop(Emulators.FIRESTORE);
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.FIRESTORE);
    const port = this.args.port || Constants.getDefaultPort(Emulators.FIRESTORE);

    return {
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.FIRESTORE;
  }

  private updateRules(content: string): Promise<any> {
    const projectId = this.args.projectId;

    const { host, port } = this.getInfo();
    const url = `http://${host}:${port}/emulator/v1/projects/${projectId}:securityRules`;
    const body = {
      rules: {
        files: [
          {
            name: "security.rules",
            content,
          },
        ],
      },
    };

    return new Promise((resolve, reject) => {
      request.put(url, { json: body }, (err, res, resBody) => {
        if (err) {
          reject(err);
          return;
        }

        if (res.statusCode !== 200) {
          reject("Error updating rules: " + res.statusCode);
          return;
        }

        resolve();
      });
    });
  }
}
