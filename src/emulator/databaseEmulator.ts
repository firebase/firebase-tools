import * as chokidar from "chokidar";
import * as clc from "cli-color";
import * as fs from "fs";
import * as path from "path";
import * as request from "request";

import * as utils from "../utils";
import * as javaEmulators from "../serve/javaEmulators";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "./constants";

export interface DatabaseEmulatorArgs {
  port?: number;
  host?: string;
  projectId?: string;
  rules?: string;
  functions_emulator_port?: number;
  functions_emulator_host?: string;
  auto_download?: boolean;
}

export class DatabaseEmulator implements EmulatorInstance {
  static DATABASE_EMULATOR_ENV = "FIREBASE_DATABASE_EMULATOR_HOST";

  rulesWatcher?: chokidar.FSWatcher;

  constructor(private args: DatabaseEmulatorArgs) {}

  async start(): Promise<void> {
    if (this.args.rules && this.args.projectId) {
      const rulesPath = this.args.rules;
      this.rulesWatcher = chokidar.watch(rulesPath, { persistent: true, ignoreInitial: true });
      this.rulesWatcher.on("change", async (event, stats) => {
        const newContent = fs.readFileSync(rulesPath).toString();

        utils.logLabeledBullet("database", "Change detected, updating rules...");
        try {
          await this.updateRules(newContent);
          utils.logLabeledSuccess("database", "Rules updated.");
        } catch (e) {
          utils.logWarning(this.prettyPrintRulesError(rulesPath, e));
          utils.logWarning("Failed to update rules");
        }
      });
    }

    return javaEmulators.start(Emulators.DATABASE, this.args);
  }

  async connect(): Promise<void> {
    // The Database emulator has no "connect" phase.
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    return javaEmulators.stop(Emulators.DATABASE);
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.DATABASE);
    const port = this.args.port || Constants.getDefaultPort(Emulators.DATABASE);

    return {
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.DATABASE;
  }

  private updateRules(content: string): Promise<any> {
    const { host, port } = this.getInfo();
    return new Promise((resolve, reject) => {
      request.put(
        {
          uri: `http://${host}:${[port]}/.settings/rules.json?ns=${this.args.projectId}`,
          headers: { Authorization: "Bearer owner" },
          body: content,
        },
        (err, resp, body) => {
          if (err) {
            reject(err);
          } else if (resp.statusCode !== 200) {
            reject(JSON.parse(body).error);
          } else {
            resolve();
          }
        }
      );
    });
  }

  private prettyPrintRulesError(filePath: string, error: string): string {
    const relativePath = path.relative(process.cwd(), filePath);
    return `${clc.cyan(relativePath)}:${error.trim()}`;
  }
}
