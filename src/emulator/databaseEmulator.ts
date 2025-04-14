import * as chokidar from "chokidar";
import * as clc from "colorette";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";

import * as downloadableEmulators from "./downloadableEmulators";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "./constants";
import { EmulatorRegistry } from "./registry";
import { EmulatorLogger } from "./emulatorLogger";
import { FirebaseError } from "../error";
import { parseBoltRules } from "../parseBoltRules";
import { connectableHostname } from "../utils";

export interface DatabaseEmulatorArgs {
  port?: number;
  host?: string;
  projectId?: string;
  rules?: { rules: string; instance: string }[];
  functions_emulator_port?: number;
  functions_emulator_host?: string;
  auto_download?: boolean;
  single_project_mode?: string;
}

export class DatabaseEmulator implements EmulatorInstance {
  private importedNamespaces: string[] = [];
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
            "Could not determine your Realtime Database instance name, so rules hot reloading is disabled.",
          );
          continue;
        }

        this.rulesWatcher = chokidar.watch(c.rules, { persistent: true, ignoreInitial: true });
        this.rulesWatcher.on("change", async () => {
          // There have been some race conditions reported (on Windows) where reading the
          // file too quickly after the watcher fires results in an empty file being read.
          // Adding a small delay prevents that at very little cost.
          await new Promise((res) => setTimeout(res, 5));

          this.logger.logLabeled(
            "BULLET",
            "database",
            `Change detected, updating rules for ${c.instance}...`,
          );

          try {
            await this.updateRules(c.instance, c.rules);
            this.logger.logLabeled("SUCCESS", "database", "Rules updated.");
          } catch (e: any) {
            this.logger.logLabeled("WARN", "database", this.prettyPrintRulesError(c.rules, e));
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
        try {
          await this.updateRules(c.instance, c.rules);
        } catch (e: any) {
          const rulesError = this.prettyPrintRulesError(c.rules, e);
          this.logger.logLabeled("WARN", "database", rulesError);
          this.logger.logLabeled("WARN", "database", "Failed to update rules");
          throw new FirebaseError(
            `Failed to load initial ${Constants.description(this.getName())} rules:\n${rulesError}`,
          );
        }
      }
    }
  }

  stop(): Promise<void> {
    return downloadableEmulators.stop(Emulators.DATABASE);
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost();
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

  getImportedNamespaces(): string[] {
    return this.importedNamespaces;
  }

  async importData(ns: string, fPath: string): Promise<void> {
    this.logger.logLabeled("BULLET", "database", `Importing data from ${fPath}`);

    const readStream = fs.createReadStream(fPath);
    const { host, port } = this.getInfo();

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          method: "PUT",
          host: connectableHostname(host),
          port,
          path: `/.json?ns=${ns}&disableTriggers=true&writeSizeLimit=unlimited`,
          headers: {
            Authorization: "Bearer owner",
            "Content-Type": "application/json",
          },
        },
        (response) => {
          if (response.statusCode === 200) {
            this.importedNamespaces.push(ns);
            resolve();
          } else {
            this.logger.log("DEBUG", "Database import failed: " + response.statusCode);
            response
              .on("data", (d) => {
                this.logger.log("DEBUG", d.toString());
              })
              .on("end", reject);
          }
        },
      );

      req.on("error", reject);
      readStream.pipe(req, { end: true });
    }).catch((e) => {
      throw new FirebaseError("Error during database import.", { original: e, exit: 1 });
    });
  }

  private async updateRules(instance: string, rulesPath: string): Promise<any> {
    const rulesExt = path.extname(rulesPath);
    const content =
      rulesExt === ".bolt"
        ? parseBoltRules(rulesPath).toString()
        : fs.readFileSync(rulesPath, "utf8");

    try {
      await EmulatorRegistry.client(Emulators.DATABASE).put(`/.settings/rules.json`, content, {
        headers: { Authorization: "Bearer owner" },
        queryParams: { ns: instance },
      });
    } catch (e: any) {
      // The body is already parsed as JSON
      if (e.context && e.context.body) {
        throw e.context.body.error;
      }
      throw e.original ?? e;
    }
  }

  // TODO: tests
  private prettyPrintRulesError(filePath: string, error: unknown): string {
    let errStr;
    switch (typeof error) {
      case "string":
        errStr = error;
        break;
      case "object":
        if (error != null && "message" in error) {
          const message = (error as { message: unknown }).message;
          errStr = `${message}`;
          if (typeof message === "string") {
            try {
              // message may be JSON with {error: string} in it
              const parsed = JSON.parse(message);
              if (typeof parsed === "object" && parsed.error) {
                errStr = `${parsed.error}`;
              }
            } catch (_) {
              // Probably not JSON, just output the string itself as above.
            }
          }
          break;
        }
      // fallthrough
      default:
        errStr = `Unknown error: ${JSON.stringify(error)}`;
    }
    const relativePath = path.relative(process.cwd(), filePath);
    return `${clc.cyan(relativePath)}:${errStr.trim()}`;
  }
}
