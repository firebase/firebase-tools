import * as express from "express";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

import * as utils from "../utils";
import { logger } from "../logger";
import { Emulators, EmulatorInfo, ListenSpec } from "./types";
import { HubExport } from "./hubExport";
import { EmulatorRegistry } from "./registry";
import { FunctionsEmulator } from "./functionsEmulator";
import { ExpressBasedEmulator } from "./ExpressBasedEmulator";
import { PortName } from "./portUtils";

// We use the CLI version from package.json
const pkg = require("../../package.json");

export interface Locator {
  version: string;
  // Ways of reaching the hub as URL prefix, such as http://127.0.0.1:4000
  origins: string[];
}

export interface EmulatorHubArgs {
  projectId: string;
  listen: ListenSpec[];
  listenForEmulator: Record<PortName, ListenSpec[]>;
}

export type GetEmulatorsResponse = Record<string, EmulatorInfo>;

export class EmulatorHub extends ExpressBasedEmulator {
  static CLI_VERSION = pkg.version;
  static PATH_EXPORT = "/_admin/export";
  static PATH_DISABLE_FUNCTIONS = "/functions/disableBackgroundTriggers";
  static PATH_ENABLE_FUNCTIONS = "/functions/enableBackgroundTriggers";
  static PATH_EMULATORS = "/emulators";

  /**
   * Given a project ID, find and read the Locator file for the emulator hub.
   * This is useful so that multiple copies of the Firebase CLI can discover
   * each other.
   */
  static readLocatorFile(projectId: string): Locator | undefined {
    const locatorPath = this.getLocatorFilePath(projectId);
    if (!fs.existsSync(locatorPath)) {
      return undefined;
    }

    const data = fs.readFileSync(locatorPath, "utf8").toString();
    const locator = JSON.parse(data) as Locator;

    if (locator.version !== this.CLI_VERSION) {
      logger.debug(`Found locator with mismatched version, ignoring: ${JSON.stringify(locator)}`);
      return undefined;
    }

    return locator;
  }

  static getLocatorFilePath(projectId: string): string {
    const dir = os.tmpdir();
    const filename = `hub-${projectId}.json`;
    return path.join(dir, filename);
  }

  constructor(private args: EmulatorHubArgs) {
    super({
      listen: args.listen,
    });
  }

  override async start(): Promise<void> {
    await super.start();
    await this.writeLocatorFile();
  }

  protected override async createExpressApp(): Promise<express.Express> {
    const app = await super.createExpressApp();
    app.get("/", (req, res) => {
      res.json({
        ...this.getLocator(),
        // For backward compatibility:
        host: utils.connectableHostname(this.args.listen[0].address),
        port: this.args.listen[0].port,
      });
    });

    app.get(EmulatorHub.PATH_EMULATORS, (req, res) => {
      const body: GetEmulatorsResponse = {};
      for (const info of EmulatorRegistry.listRunningWithInfo()) {
        body[info.name] = {
          listen: this.args.listenForEmulator[info.name],
          ...info,
        };
      }
      res.json(body);
    });

    app.post(EmulatorHub.PATH_EXPORT, async (req, res) => {
      const path: string = req.body.path;
      const initiatedBy: string = req.body.initiatedBy || "unknown";
      utils.logLabeledBullet("emulators", `Received export request. Exporting data to ${path}.`);
      try {
        await new HubExport(this.args.projectId, {
          path,
          initiatedBy,
        }).exportAll();
        utils.logLabeledSuccess("emulators", "Export complete.");
        res.status(200).send({
          message: "OK",
        });
      } catch (e: any) {
        const errorString = e.message || JSON.stringify(e);
        utils.logLabeledWarning("emulators", `Export failed: ${errorString}`);
        res.status(500).json({
          message: errorString,
        });
      }
    });

    app.put(EmulatorHub.PATH_DISABLE_FUNCTIONS, async (req, res) => {
      utils.logLabeledBullet(
        "emulators",
        `Disabling Cloud Functions triggers, non-HTTP functions will not execute.`,
      );

      const instance = EmulatorRegistry.get(Emulators.FUNCTIONS);
      if (!instance) {
        res.status(400).json({ error: "The Cloud Functions emulator is not running." });
        return;
      }

      const emu = instance as FunctionsEmulator;
      await emu.disableBackgroundTriggers();
      res.status(200).json({ enabled: false });
    });

    app.put(EmulatorHub.PATH_ENABLE_FUNCTIONS, async (req, res) => {
      utils.logLabeledBullet(
        "emulators",
        `Enabling Cloud Functions triggers, non-HTTP functions will execute.`,
      );

      const instance = EmulatorRegistry.get(Emulators.FUNCTIONS);
      if (!instance) {
        res.status(400).send("The Cloud Functions emulator is not running.");
        return;
      }

      const emu = instance as FunctionsEmulator;
      await emu.reloadTriggers();
      res.status(200).json({ enabled: true });
    });

    return app;
  }

  async stop(): Promise<void> {
    await super.stop();
    await this.deleteLocatorFile();
  }

  getName(): Emulators {
    return Emulators.HUB;
  }

  private getLocator(): Locator {
    const version = pkg.version;
    const origins: string[] = [];
    for (const spec of this.args.listen) {
      if (spec.family === "IPv6") {
        origins.push(`http://[${utils.connectableHostname(spec.address)}]:${spec.port}`);
      } else {
        origins.push(`http://${utils.connectableHostname(spec.address)}:${spec.port}`);
      }
    }
    return {
      version,
      origins,
    };
  }

  private async writeLocatorFile(): Promise<void> {
    const projectId = this.args.projectId;
    const locatorPath = EmulatorHub.getLocatorFilePath(projectId);
    const locator = this.getLocator();

    if (fs.existsSync(locatorPath)) {
      utils.logLabeledWarning(
        "emulators",
        `It seems that you are running multiple instances of the emulator suite for project ${projectId}. This may result in unexpected behavior.`,
      );
    }

    logger.debug(`[hub] writing locator at ${locatorPath}`);
    return new Promise((resolve, reject) => {
      fs.writeFile(locatorPath, JSON.stringify(locator), (e) => {
        if (e) {
          reject(e);
        } else {
          resolve();
        }
      });
    });
  }

  private async deleteLocatorFile(): Promise<void> {
    const locatorPath = EmulatorHub.getLocatorFilePath(this.args.projectId);
    return new Promise((resolve, reject) => {
      fs.unlink(locatorPath, (e) => {
        if (e) {
          reject(e);
        } else {
          resolve();
        }
      });
    });
  }
}
