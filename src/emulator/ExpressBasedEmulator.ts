import * as cors from "cors";
import * as express from "express";
import * as bodyParser from "body-parser";

import * as utils from "../utils";
import { Emulators, EmulatorInstance, EmulatorInfo, ListenSpec } from "./types";
import { createServer } from "node:http";
import { IPV4_UNSPECIFIED, IPV6_UNSPECIFIED } from "./dns";
import { ListenOptions } from "node:net";

export interface ExpressBasedEmulatorOptions {
  listen: ListenSpec[];
  noCors?: boolean;
  noBodyParser?: boolean;
}

/**
 * An EmulatorInstance that starts express servers with multi-listen support.
 *
 * This class correctly destroys the server(s) when `stop()`-ed. When overriding
 * life-cycle methods, make sure to call the super methods for those behaviors.
 */
export abstract class ExpressBasedEmulator implements EmulatorInstance {
  static PATH_EXPORT = "/_admin/export";
  static PATH_DISABLE_FUNCTIONS = "/functions/disableBackgroundTriggers";
  static PATH_ENABLE_FUNCTIONS = "/functions/enableBackgroundTriggers";
  static PATH_EMULATORS = "/emulators";

  private destroyers = new Set<() => Promise<void>>();

  constructor(private options: ExpressBasedEmulatorOptions) {}

  protected createExpressApp(): Promise<express.Express> {
    const app = express();
    if (!this.options.noCors) {
      // Enable CORS for all APIs, all origins (reflected), and all headers (reflected).
      // This is enabled by default since most emulators are cookieless.
      app.use(cors({ origin: true }));

      // Return access-control-allow-private-network heder if requested
      // Enables accessing locahost when site is exposed via tunnel see https://github.com/firebase/firebase-tools/issues/4227
      // Aligns with https://wicg.github.io/private-network-access/#headers
      // Replace with cors option if adopted, see https://github.com/expressjs/cors/issues/236
      app.use((req, res, next) => {
        if (req.headers["access-control-request-private-network"]) {
          res.setHeader("access-control-allow-private-network", "true");
        }
        next();
      });
    }
    if (!this.options.noBodyParser) {
      app.use(bodyParser.json()); // used in most emulators
    }
    app.set("json spaces", 2);

    return Promise.resolve(app);
  }

  async start(): Promise<void> {
    const app = await this.createExpressApp();

    const promises = [];
    const specs = this.options.listen;

    for (const opt of ExpressBasedEmulator.listenOptionsFromSpecs(specs)) {
      promises.push(
        new Promise((resolve, reject) => {
          const server = createServer(app).listen(opt);
          server.once("listening", resolve);
          server.once("error", reject);
          this.destroyers.add(utils.createDestroyer(server));
        }),
      );
    }
  }

  /**
   * Translate addresses and ports to low-level net/http server options.
   */
  static listenOptionsFromSpecs(specs: ListenSpec[]): ListenOptions[] {
    const listenOptions: ListenOptions[] = [];

    const dualStackPorts = new Set();
    for (const spec of specs) {
      if (spec.address === IPV6_UNSPECIFIED.address) {
        if (specs.some((s) => s.port === spec.port && s.address === IPV4_UNSPECIFIED.address)) {
          // We can use the default dual-stack behavior in Node.js to listen on
          // the same port on both IPv4 and IPv6 unspecified addresses on most OSes.
          // https://nodejs.org/api/net.html#serverlistenport-host-backlog-callback
          listenOptions.push({
            port: spec.port,
            ipv6Only: false,
          });
          dualStackPorts.add(spec.port);
        }
      }
    }
    // Then add options for non-dual-stack addresses and ports.
    for (const spec of specs) {
      if (!dualStackPorts.has(spec.port)) {
        listenOptions.push({
          host: spec.address,
          port: spec.port,
          ipv6Only: spec.family === "IPv6",
        });
      }
    }
    return listenOptions;
  }

  async connect(): Promise<void> {
    // no-op
  }

  async stop(): Promise<void> {
    const promises = [];
    for (const destroyer of this.destroyers) {
      promises.push(destroyer().then(() => this.destroyers.delete(destroyer)));
    }
    await Promise.all(promises);
  }

  getInfo(): EmulatorInfo {
    return {
      name: this.getName(),
      listen: this.options.listen,
      host: this.options.listen[0].address,
      port: this.options.listen[0].port,
    };
  }

  abstract getName(): Emulators;
}
