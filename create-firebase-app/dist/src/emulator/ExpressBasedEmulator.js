"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpressBasedEmulator = void 0;
const cors = require("cors");
const express = require("express");
const bodyParser = require("body-parser");
const utils = require("../utils");
const node_http_1 = require("node:http");
const dns_1 = require("./dns");
/**
 * An EmulatorInstance that starts express servers with multi-listen support.
 *
 * This class correctly destroys the server(s) when `stop()`-ed. When overriding
 * life-cycle methods, make sure to call the super methods for those behaviors.
 */
class ExpressBasedEmulator {
    constructor(options) {
        this.options = options;
        this.destroyers = new Set();
    }
    createExpressApp() {
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
            app.use(bodyParser.json({ limit: "130mb" })); // used in most emulators
        }
        app.set("json spaces", 2);
        return Promise.resolve(app);
    }
    async start() {
        const app = await this.createExpressApp();
        const promises = [];
        const specs = this.options.listen;
        for (const opt of ExpressBasedEmulator.listenOptionsFromSpecs(specs)) {
            promises.push(new Promise((resolve, reject) => {
                const server = (0, node_http_1.createServer)(app).listen(opt);
                server.once("listening", resolve);
                server.once("error", reject);
                this.destroyers.add(utils.createDestroyer(server));
            }));
        }
    }
    /**
     * Translate addresses and ports to low-level net/http server options.
     */
    static listenOptionsFromSpecs(specs) {
        const listenOptions = [];
        const dualStackPorts = new Set();
        for (const spec of specs) {
            if (spec.address === dns_1.IPV6_UNSPECIFIED.address) {
                if (specs.some((s) => s.port === spec.port && s.address === dns_1.IPV4_UNSPECIFIED.address)) {
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
    async connect() {
        // no-op
    }
    async stop() {
        const promises = [];
        for (const destroyer of this.destroyers) {
            promises.push(destroyer().then(() => this.destroyers.delete(destroyer)));
        }
        await Promise.all(promises);
    }
    getInfo() {
        return {
            name: this.getName(),
            listen: this.options.listen,
            host: this.options.listen[0].address,
            port: this.options.listen[0].port,
        };
    }
}
exports.ExpressBasedEmulator = ExpressBasedEmulator;
ExpressBasedEmulator.PATH_EXPORT = "/_admin/export";
ExpressBasedEmulator.PATH_DISABLE_FUNCTIONS = "/functions/disableBackgroundTriggers";
ExpressBasedEmulator.PATH_ENABLE_FUNCTIONS = "/functions/enableBackgroundTriggers";
ExpressBasedEmulator.PATH_EMULATORS = "/emulators";
