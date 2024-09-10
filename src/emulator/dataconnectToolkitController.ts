import { EmulatorInstance, Emulators, EmulatorInfo } from "./types";
import { FirebaseError } from "../error";
import * as portUtils from "./portUtils";
import * as express from "express";
import { connectableHostname } from "../utils";
import { DataConnectEmulator, DataConnectEmulatorArgs } from "./dataconnectEmulator";

const name = "Data Connect Toolkit";
/**
 * Static controller for the VSCode Data Connect Toolkit
 */
export class DataConnectToolkitController {
  static instance: EmulatorInstance;
  static isRunning = false;

  static async start(args: DataConnectEmulatorArgs): Promise<void> {
    if (this.isRunning || this.instance) {
      throw new FirebaseError(`${name} is already running!`, {});
    }
    this.instance = new DataConnectEmulator(args);

    // must be before we start as else on a quick 'Ctrl-C' after starting we could skip this emulator in cleanShutdown
    this.isRunning = true;

    // Start the emulator and wait for it to grab its assigned port.
    await this.instance.start();
    const info = this.instance.getInfo();
    await portUtils.waitForPortUsed(info.port, connectableHostname(info.host), info.timeout);
  }

  static async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.instance.stop();
      this.isRunning = false;
    } catch (e: any) {
      // TODO: log error
    }
  }

  /**
   * Get information about an emulator. Use `url` instead for creating URLs.
   */
  static getInfo(): EmulatorInfo | undefined {
    return this.instance.getInfo();
  }

  /**
   * Return a URL object with the emulator protocol, host, and port populated.
   *
   * Need to make an API request? Use `.client` instead.
   *
   * @param emulator for retrieving host and port from the registry
   * @param req if provided, will prefer reflecting back protocol+host+port from
   *            the express request (if header available) instead of registry
   * @return a WHATWG URL object with .host set to the emulator host + port
   */
  static url(req?: express.Request): URL {
    // WHATWG URL API has no way to create from parts, so let's use a minimal
    // working URL to start. (Let's avoid legacy Node.js `url.format`.)
    const url = new URL("http://unknown/");

    if (req) {
      url.protocol = req.protocol;
      // Try the Host request header, since it contains hostname + port already
      // and has been proved to work (since we've got the client request).
      const host = req.headers.host;
      if (host) {
        url.host = host;
        return url;
      }
    }

    // Fall back to the host and port from registry. This provides a reasonable
    // value in most cases but may not work if the client needs to connect via
    // another host, e.g. in Dockers or behind reverse proxies.
    const info = this.getInfo();
    if (info) {
      if (info.host.includes(":")) {
        url.hostname = `[${info.host}]`; // IPv6 addresses need to be quoted.
      } else {
        url.hostname = info.host;
      }
      url.port = info.port.toString();
    } else {
      throw new Error(`Cannot determine host and port of ${this.instance.getName()}`);
    }

    return url;
  }
}
