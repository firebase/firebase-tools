import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "./constants";
import { SPLAT } from "triple-beam";
import * as WebSocket from "ws";
import * as TransportStream from "winston-transport";
import logger = require("../logger");
const ansiStrip = require("cli-color/strip");

export interface LoggingEmulatorArgs {
  port?: number;
  host?: string;
}

export class LoggingEmulator implements EmulatorInstance {
  static LOGGING_EMULATOR_ENV = "FIREBASE_LOGGING_EMULATOR_HOST";
  private transport?: WebSocketTransport;

  constructor(private args: LoggingEmulatorArgs) {}

  async start(): Promise<void> {
    this.transport = new WebSocketTransport();
    this.transport.start(this.getInfo());
    logger.add(this.transport);
  }

  async connect(): Promise<void> {
    return;
  }

  async stop(): Promise<void> {
    logger.remove(this.transport);

    if (this.transport && this.transport.wss) {
      const wss = this.transport.wss;
      return new Promise((resolve, reject) => {
        wss.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.LOGGING);
    const port = this.args.port || Constants.getDefaultPort(Emulators.LOGGING);

    return {
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.LOGGING;
  }
}

type LogEntry = {
  level: string;
  data: any;
  timestamp: number;
  message: string;
};

class WebSocketTransport extends TransportStream {
  wss?: WebSocket.Server;
  connections: WebSocket[] = [];
  history: LogEntry[] = [];

  constructor(options = {}) {
    super(options);
    this.setMaxListeners(30);
  }

  start(options: EmulatorInfo) {
    this.wss = new WebSocket.Server(options);
    this.wss.on("connection", (ws) => {
      this.connections.push(ws);
      this.history.forEach((bundle) => {
        ws.send(JSON.stringify(bundle));
      });
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
        if (typeof value == "string") {
          try {
            bundle.data = { ...bundle.data, ...JSON.parse(value) };
            return null;
          } catch (err) {
            // If the value isn't JSONable, just treat it like a string
            return value;
          }
        } else {
          bundle.data = { ...bundle.data, ...value };
        }
      })
      .filter((v) => v);

    bundle.message = ansiStrip(splat.join(" "));

    if (bundle.data && bundle.data.system && bundle.data.system.level) {
      bundle.level = bundle.data.system.level.toLowerCase();
    } else {
      bundle.level = bundle.level.toLowerCase();
    }

    this.history.push(bundle);
    this.connections.forEach((ws) => {
      ws.send(JSON.stringify(bundle));
    });

    if (next) {
      next();
    }
  }
}
