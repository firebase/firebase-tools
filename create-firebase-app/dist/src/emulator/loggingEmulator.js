"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggingEmulator = void 0;
const types_1 = require("./types");
const constants_1 = require("./constants");
const triple_beam_1 = require("triple-beam");
const WebSocket = require("ws");
const TransportStream = require("winston-transport");
const logger_1 = require("../logger");
const node_util_1 = require("node:util");
class LoggingEmulator {
    constructor(args) {
        this.args = args;
    }
    start() {
        this.transport = new WebSocketTransport();
        this.transport.start(this.getInfo());
        logger_1.logger.add(this.transport);
        return Promise.resolve();
    }
    connect() {
        return Promise.resolve();
    }
    async stop() {
        if (this.transport) {
            logger_1.logger.remove(this.transport);
            return this.transport.stop();
        }
    }
    getInfo() {
        const host = this.args.host || constants_1.Constants.getDefaultHost();
        const port = this.args.port || constants_1.Constants.getDefaultPort(types_1.Emulators.LOGGING);
        return {
            name: this.getName(),
            host,
            port,
        };
    }
    getName() {
        return types_1.Emulators.LOGGING;
    }
}
exports.LoggingEmulator = LoggingEmulator;
LoggingEmulator.LOGGING_EMULATOR_ENV = "FIREBASE_LOGGING_EMULATOR_HOST";
class WebSocketTransport extends TransportStream {
    constructor(options = {}) {
        super(options);
        this.connections = new Set();
        this.history = [];
        this.setMaxListeners(30);
    }
    start(options) {
        this.wss = new WebSocket.Server(options);
        this.wss.on("connection", (ws) => {
            this.connections.add(ws);
            ws.once("close", () => this.connections.delete(ws));
            this.history.forEach((bundle) => {
                ws.send(JSON.stringify(bundle));
            });
        });
    }
    stop() {
        return new Promise((resolve, reject) => {
            if (!this.wss) {
                return resolve();
            }
            this.wss.close((err) => {
                if (err)
                    return reject(err);
                resolve();
            });
            this.connections.forEach((socket) => socket.terminate());
        });
    }
    log(info, next) {
        setImmediate(() => this.emit("logged", info));
        const bundle = {
            level: info.level,
            data: {},
            timestamp: new Date().getTime(),
            message: "",
        };
        const splat = [info.message, ...(info[triple_beam_1.SPLAT] || [])]
            .map((value) => {
            if (typeof value === "string") {
                try {
                    bundle.data = Object.assign(Object.assign({}, bundle.data), JSON.parse(value));
                    return null;
                }
                catch (err) {
                    // If the value isn't JSONable, just treat it like a string
                    return value;
                }
            }
            else {
                bundle.data = Object.assign(Object.assign({}, bundle.data), value);
            }
        })
            .filter((v) => v);
        bundle.message = splat.join(" ");
        if (bundle.data && bundle.data.metadata && bundle.data.metadata.level) {
            bundle.level = bundle.data.metadata.level.toLowerCase();
        }
        else {
            bundle.level = bundle.level.toLowerCase();
        }
        if (bundle.data && bundle.data.metadata && bundle.data.metadata.message) {
            bundle.message = bundle.data.metadata.message;
        }
        bundle.message = (0, node_util_1.stripVTControlCharacters)(bundle.message);
        this.history.push(bundle);
        this.connections.forEach((ws) => {
            ws.send(JSON.stringify(bundle));
        });
        if (next) {
            next();
        }
    }
}
