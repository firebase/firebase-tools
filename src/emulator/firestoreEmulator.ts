import * as chokidar from "chokidar";
import * as fs from "fs";
import * as request from "request";

import * as javaEmulators from "../serve/javaEmulators";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { EmulatorRegistry } from "./registry";
import { Constants } from "./constants";

export interface FirestoreEmulatorArgs {
  port?: number;
  host?: string;
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

    if (this.args.rules) {
      const path = this.args.rules;
      this.rulesWatcher = chokidar.watch(path, { persistent: true, ignoreInitial: true });
      this.rulesWatcher.on('change', (event, stats) => {
        const newContent = fs.readFileSync(path).toString();

        console.log("Updating rules...")
        this.updateRules(newContent)
          .then(() => {
            console.log("Done!");
          }).catch((err) => {
            console.warn(err);
          });
      })
    }

    return javaEmulators.start(Emulators.FIRESTORE, this.args);
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
    // TODO: How to get the real one?
    const projectId = 'fir-dumpster';

    const { host, port } = this.getInfo();
    const url = `http://${host}:${port}/emulator/v1/projects/${projectId}:securityRules`;
    const body = {
      rules: {
        files: [
          {
            name: "security.rules",
            content
          }
        ]
      }
    }

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
