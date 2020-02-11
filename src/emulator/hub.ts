import * as http from "http";
import * as express from "express";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

import * as logger from "../logger";
import { Constants } from "./constants";
import { Emulators, EmulatorInstance, EmulatorInfo } from "./types";

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

  private hub: express.Express;
  private server?: http.Server;

  constructor(private args: EmulatorHubArgs) {
    this.hub = express();

    this.hub.get("/", async (req, res) => {
      res.json(this.getLocator());
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

  private static getLocatorFilePath(projectId: string): string {
    const dir = os.tmpdir();
    const filename = `hub-${projectId}.json`;
    return path.join(dir, filename);
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
