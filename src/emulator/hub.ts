import * as cors from "cors";
import * as express from "express";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import * as bodyParser from "body-parser";

import * as utils from "../utils";
import { logger } from "../logger";
import { Constants } from "./constants";
import { Emulators, EmulatorInstance, EmulatorInfo } from "./types";
import { HubExport } from "./hubExport";
import { EmulatorRegistry } from "./registry";
import { FunctionsEmulator } from "./functionsEmulator";

// We use the CLI version from package.json
const pkg = require("../../package.json");

export interface Locator {
  version: string;
  host: string;
  port: number;
}

export interface EmulatorHubArgs {
  projectId: string;
  port?: number;
  host?: string;
}

export type GetEmulatorsResponse = Record<string, EmulatorInfo>;

export class EmulatorHub implements EmulatorInstance {
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

  private hub: express.Express;
  private destroyServer?: () => Promise<void>;

  constructor(private args: EmulatorHubArgs) {
    this.hub = express();
    // Enable CORS for all APIs, all origins (reflected), and all headers (reflected).
    // Safe since all Hub APIs are cookieless.
    this.hub.use(cors({ origin: true }));
    this.hub.use(bodyParser.json());

    this.hub.get("/", (req, res) => {
      res.json(this.getLocator());
    });

    this.hub.get(EmulatorHub.PATH_EMULATORS, (req, res) => {
      const body: GetEmulatorsResponse = {};
      for (const emulator of EmulatorRegistry.listRunning()) {
        const info = EmulatorRegistry.getInfo(emulator);
        body[emulator] = info!;
      }
      res.json(body);
    });

    this.hub.post(EmulatorHub.PATH_EXPORT, async (req, res) => {
      const exportPath = req.body.path;
      utils.logLabeledBullet(
        "emulators",
        `Received export request. Exporting data to ${exportPath}.`
      );
      try {
        await new HubExport(this.args.projectId, exportPath).exportAll();
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

    this.hub.put(EmulatorHub.PATH_DISABLE_FUNCTIONS, async (req, res) => {
      utils.logLabeledBullet(
        "emulators",
        `Disabling Cloud Functions triggers, non-HTTP functions will not execute.`
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

    this.hub.put(EmulatorHub.PATH_ENABLE_FUNCTIONS, async (req, res) => {
      utils.logLabeledBullet(
        "emulators",
        `Enabling Cloud Functions triggers, non-HTTP functions will execute.`
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
  }

  async start(): Promise<void> {
    const { host, port } = this.getInfo();
    const server = this.hub.listen(port, host);
    this.destroyServer = utils.createDestroyer(server);
    await this.writeLocatorFile();
  }

  async connect(): Promise<void> {
    // No-op
  }

  async stop(): Promise<void> {
    if (this.destroyServer) {
      await this.destroyServer();
    }
    await this.deleteLocatorFile();
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.HUB);
    const port = this.args.port || Constants.getDefaultPort(Emulators.HUB);

    return {
      name: this.getName(),
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.HUB;
  }

  private getLocator(): Locator {
    const { host, port } = this.getInfo();
    const version = pkg.version;
    return {
      version,
      host,
      port,
    };
  }

  private async writeLocatorFile(): Promise<void> {
    const projectId = this.args.projectId;
    const locatorPath = EmulatorHub.getLocatorFilePath(projectId);
    const locator = this.getLocator();

    if (fs.existsSync(locatorPath)) {
      utils.logLabeledWarning(
        "emulators",
        `It seems that you are running multiple instances of the emulator suite for project ${projectId}. This may result in unexpected behavior.`
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
