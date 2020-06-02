import * as chokidar from "chokidar";
import * as clc from "cli-color";
import * as fs from "fs";
import * as path from "path";

import * as api from "../api";
import * as utils from "../utils";
import * as downloadableEmulators from "./downloadableEmulators";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "./constants";
import { EmulatorRegistry } from "./registry";

export interface DatabaseEmulatorArgs {
  port?: number;
  host?: string;
  projectId?: string;
  rules?: { rules: string; instance: string }[];
  functions_emulator_port?: number;
  functions_emulator_host?: string;
  auto_download?: boolean;
}

export class DatabaseEmulator implements EmulatorInstance {
  rulesWatcher?: chokidar.FSWatcher;

  constructor(private args: DatabaseEmulatorArgs) {}

  async start(): Promise<void> {
    const functionsInfo = EmulatorRegistry.getInfo(Emulators.FUNCTIONS);
    if (functionsInfo) {
      this.args.functions_emulator_host = functionsInfo.host;
      this.args.functions_emulator_port = functionsInfo.port;
    }
    if (this.args.rules) {
      for (const c of this.args.rules) {
        const rulesPath = c.rules;
        this.rulesWatcher = chokidar.watch(rulesPath, { persistent: true, ignoreInitial: true });
        this.rulesWatcher.on("change", async (event, stats) => {
          // There have been some race conditions reported (on Windows) where reading the
          // file too quickly after the watcher fires results in an empty file being read.
          // Adding a small delay prevents that at very little cost.
          await new Promise((res) => setTimeout(res, 5));

          utils.logLabeledBullet(
            "database",
            `Change detected, updating rules for ${c.instance}...`
          );
          const newContent = fs.readFileSync(rulesPath, "utf8").toString();
          try {
            await this.updateRules(c.instance, newContent);
            utils.logLabeledSuccess("database", "Rules updated.");
          } catch (e) {
            utils.logWarning(this.prettyPrintRulesError(rulesPath, e));
            utils.logWarning("Failed to update rules");
          }
        });
      }
    }

    return downloadableEmulators.start(Emulators.DATABASE, this.args);
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return downloadableEmulators.stop(Emulators.DATABASE);
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

  private async updateRules(instance: string, content: string): Promise<any> {
    const { host, port } = this.getInfo();
    try {
      await api.request("PUT", `/.settings/rules.json?ns=${instance}`, {
        origin: `http://${host}:${[port]}`,
        headers: { Authorization: "Bearer owner" },
        data: content,
        json: false,
      });
    } catch (e) {
      // The body is already parsed as JSON
      if (e.context && e.context.body) {
        throw e.context.body.error;
      }
      throw e.original;
    }
  }

  private prettyPrintRulesError(filePath: string, error: string): string {
    const relativePath = path.relative(process.cwd(), filePath);
    return `${clc.cyan(relativePath)}:${error.trim()}`;
  }
}
