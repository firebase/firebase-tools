import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";
import { Constants } from "./constants";
import { SPLAT } from "triple-beam";
import * as WebSocket from "ws";
import { LogEntry } from "winston";
import * as TransportStream from "winston-transport";
import { logger } from "../logger";
const ansiStrip = require("cli-color/strip");

export interface LoggingEmulatorArgs {
  port?: number;
  host?: string;
}

export interface LogData {
  user?: any; // User data, like JSON returned from a function call
  metadata?: {
    // Metadata used for Logger Emulator
    level?: string; // Overrides log level specified in log call (like "USER" becoming "INFO")
    message?: string; // Overrides message specified in log call (like a rich table being hidden)
    emulator?: {
      name: string;
    };
    function?: {
      name: string;
    };
    extension?: {
      ref?: string;
      instanceId?: string;
    };
  };
}

export type LogDataOrUndefined = LogData | undefined;

export class LoggingEmulator implements EmulatorInstance {
  static LOGGING_EMULATOR_ENV = "FIREBASE_LOGGING_EMULATOR_HOST";
  private transport?: WebSocketTransport;

  constructor(private args: LoggingEmulatorArgs) {}

  start(): Promise<void> {
    this.transport = new WebSocketTransport();
    this.transport.start(this.getInfo());
    logger.add(this.transport);
    return Promise.resolve();
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    if (this.transport) {
      logger.remove(this.transport);
      return this.transport.stop();
    }
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.LOGGING);
    const port = this.args.port || Constants.getDefaultPort(Emulators.LOGGING);

    return {
      name: this.getName(),
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.LOGGING;
  }
}

class WebSocketTransport extends TransportStream {
  wss?: WebSocket.Server;
  connections = new Set<WebSocket>();
  history: LogEntry[] = [];

  constructor(options = {}) {
    super(options);
    this.setMaxListeners(30);
  }

  start(options: EmulatorInfo) {
    this.wss = new WebSocket.Server(options);
    this.wss.on("connection", (ws) => {
      this.connections.add(ws);
      ws.once("close", () => this.connections.delete(ws));
      this.history.forEach((bundle) => {
        ws.send(JSON.stringify(bundle));
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.wss) {
        return resolve();
      }
      this.wss.close((err) => {
        if (err) return reject(err);
        resolve();
      });
      this.connections.forEach((socket) => socket.terminate());
    });
  }

  log(info: any, next: () => void) {
    setImmediate(() => this.emit("logged", info));

    const bundle: LogEntry = {
      level: info.level,
      data: {},
      timestamp: new Date().getTime(),
      message: "",
    };

    const splat = [info.message, ...(info[SPLAT] || [])]
      .map((value) => {
        if (typeof value === "string") {
          try {
            bundle.data = { ...bundle.data, ...JSON.parse(value) };
            return null;
          } catch (err: any) {
            // If the value isn't JSONable, just treat it like a string
            return value;
          }
        } else {
          bundle.data = { ...bundle.data, ...value };
        }
      })
      .filter((v) => v);

    bundle.message = splat.join(" ");

    if (bundle.data && bundle.data.metadata && bundle.data.metadata.level) {
      bundle.level = bundle.data.metadata.level.toLowerCase();
    } else {
      bundle.level = bundle.level.toLowerCase();
    }

    if (bundle.data && bundle.data.metadata && bundle.data.metadata.message) {
      bundle.message = bundle.data.metadata.message;
    }

    bundle.message = ansiStrip(bundle.message);

    this.history.push(bundle);
    this.connections.forEach((ws) => {
      ws.send(JSON.stringify(bundle));
    });

    if (next) {
      next();
    }
  }
}
