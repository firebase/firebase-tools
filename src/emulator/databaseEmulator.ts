import * as chokidar from "chokidar";
import * as clc from "cli-color";
import * as fs from "fs";
import * as path from "path";

import * as api from "../api";
import * as downloadableEmulators from "./downloadableEmulators";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "./constants";
import { EmulatorRegistry } from "./registry";
import { EmulatorLogger } from "./emulatorLogger";

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
  private rulesWatcher?: chokidar.FSWatcher;
  private logger = EmulatorLogger.forEmulator(Emulators.DATABASE);

  constructor(private args: DatabaseEmulatorArgs) {}

  async start(): Promise<void> {
    const functionsInfo = EmulatorRegistry.getInfo(Emulators.FUNCTIONS);
    if (functionsInfo) {
      this.args.functions_emulator_host = functionsInfo.host;
      this.args.functions_emulator_port = functionsInfo.port;
    }
    if (this.args.rules) {
      for (const c of this.args.rules) {
        if (!c.instance) {
          this.logger.log("DEBUG", `args.rules=${JSON.stringify(this.args.rules)}`);
          this.logger.logLabeled(
            "WARN_ONCE",
            "database",
            "Could not determine your Realtime Database instance name, so rules hot reloading is disabled."
          );
          continue;
        }

        const rulesPath = c.rules;
        this.rulesWatcher = chokidar.watch(rulesPath, { persistent: true, ignoreInitial: true });
        this.rulesWatcher.on("change", async (event, stats) => {
          // There have been some race conditions reported (on Windows) where reading the
          // file too quickly after the watcher fires results in an empty file being read.
          // Adding a small delay prevents that at very little cost.
          await new Promise((res) => setTimeout(res, 5));

          this.logger.logLabeled(
            "BULLET",
            "database",
            `Change detected, updating rules for ${c.instance}...`
          );
          const newContent = fs.readFileSync(rulesPath, "utf8").toString();
          try {
            await this.updateRules(c.instance, newContent);
            this.logger.logLabeled("SUCCESS", "database", "Rules updated.");
          } catch (e) {
            this.logger.logLabeled("WARN", "database", this.prettyPrintRulesError(rulesPath, e));
            this.logger.logLabeled("WARN", "database", "Failed to update rules");
          }
        });
      }
    }

    return downloadableEmulators.start(Emulators.DATABASE, this.args);
  }

  async connect(): Promise<void> {
    // The chokidar watcher will handle updating rules but we need to set the initial ruleset for
    // each namespace here.
    if (this.args.rules) {
      for (const c of this.args.rules) {
        if (!c.instance) {
          continue;
        }

        await this.updateRules(c.instance, fs.readFileSync(c.rules, "utf8").toString());
      }
    }
  }

  stop(): Promise<void> {
    return downloadableEmulators.stop(Emulators.DATABASE);
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.DATABASE);
    const port = this.args.port || Constants.getDefaultPort(Emulators.DATABASE);

    return {
      name: this.getName(),
      host,
      port,
      pid: downloadableEmulators.getPID(Emulators.DATABASE),
    };
  }

  getName(): Emulators {
    return Emulators.DATABASE;
  }

  private async updateRules(instance: string, content: string): Promise<any> {
    const { host, port } = this.getInfo();
    try {
      await api.request("PUT", `/.settings/rules.json?ns=${instance}`, {
        origin: `http://${host}:${port}`,
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
