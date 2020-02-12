import * as http from "http";
import * as express from "express";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import * as bodyParser from "body-parser";

import * as utils from "../utils";
import * as logger from "../logger";
import { Constants } from "./constants";
import { Emulators, EmulatorInstance, EmulatorInfo, IMPORT_EXPORT_EMULATORS } from "./types";
import { HubExport } from "./hubExport";

// We use the CLI version from package.json
const pkg = require("../../package.json");
const version = pkg.version;

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

export class EmulatorHub implements EmulatorInstance {
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

    const data = fs.readFileSync(locatorPath).toString();
    const locator = JSON.parse(data) as Locator;

    if (locator.version !== version) {
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
  private server?: http.Server;

  constructor(private args: EmulatorHubArgs) {
    this.hub = express();
    this.hub.use(bodyParser.json());

    this.hub.get("/", async (req, res) => {
      res.json(this.getLocator());
    });

    // TODO: Route paths should be constants
    // TODO: use api.js here and elsewhere
    this.hub.post("/_admin/export", async (req, res) => {
      const exportPath = req.body.path;
      utils.logLabeledBullet(
        "emulators",
        `Received export request. Exporting data to ${exportPath}.`
      );
      try {
        await new HubExport(this.args.projectId, exportPath).exportAll();
        utils.logLabeledSuccess("emulators", "Export complete.");
        res.status(200).send("OK");
      } catch (e) {
        utils.logLabeledWarning("emulators", "Export failed.");
        res.status(500).send(e);
      }
    });
  }

  async start(): Promise<void> {
    const { host, port } = this.getInfo();
    this.server = this.hub.listen(port, host);
    await this.writeLocatorFile();
  }

  async connect(): Promise<void> {
    // No-op
  }

  async stop(): Promise<void> {
    this.server && this.server.close();
    await this.deleteLocatorFile();
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.HUB);
    const port = this.args.port || Constants.getDefaultPort(Emulators.HUB);

    return {
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
    const locatorPath = EmulatorHub.getLocatorFilePath(this.args.projectId);
    const locator = this.getLocator();

    logger.debug(`[hub] wriing locator at ${locatorPath}`);
    return new Promise((res, rej) => {
      fs.writeFile(locatorPath, JSON.stringify(locator), (e) => {
        if (e) {
          rej(e);
        } else {
          res();
        }
      });
    });
  }

  private async deleteLocatorFile(): Promise<void> {
    const locatorPath = EmulatorHub.getLocatorFilePath(this.args.projectId);
    return new Promise((res, rej) => {
      fs.unlink(locatorPath, (e) => {
        if (e) {
          rej(e);
        } else {
          res();
        }
      });
    });
  }
}
