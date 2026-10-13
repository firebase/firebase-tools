import { expect } from "chai";
import { LogEntry } from "winston";
import * as WebSocket from "ws";
import { LoggingEmulator } from "./loggingEmulator";
import { logger } from "../logger";

describe("LoggingEmulator", () => {
  let emulator: LoggingEmulator;
  let client: WebSocket | undefined;
  const port = 4501;

  afterEach(async () => {
    if (client) {
      client.close();
      client = undefined;
    }
    if (emulator) {
      await emulator.stop();
    }
  });

  it("should start and broadcast log messages", async () => {
    emulator = new LoggingEmulator({ port, host: "127.0.0.1" });
    await emulator.start();

    client = new WebSocket(`ws://127.0.0.1:${port}`);

    const messagePromise = new Promise<LogEntry>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for message"));
      }, 5000);

      client!.on("message", (data) => {
        clearTimeout(timeout);
        try {
          resolve(JSON.parse(data.toString()) as LogEntry);
        } catch (e) {
          reject(e);
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      client!.on("open", () => resolve());
      client!.on("error", (err) => reject(err));
    });

    logger.info("Hello world from unit test!");

    const receivedMessage = await messagePromise;
    expect(receivedMessage.message).to.contain("Hello world from unit test!");
  });

  it("should discard debug messages when DEBUG env is not set", async () => {
    const originalDebug = process.env.DEBUG;
    const originalLevel = logger.level;
    delete process.env.DEBUG;
    logger.level = "info";

    try {
      emulator = new LoggingEmulator({ port, host: "127.0.0.1" });
      await emulator.start();

      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      client = ws;

      const received: LogEntry[] = [];
      const infoPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Timeout waiting for info message"));
        }, 5000);

        ws.on("message", (data) => {
          try {
            const entry = JSON.parse(data.toString()) as LogEntry;
            received.push(entry);
            if (entry.message.includes("Info message after debug")) {
              clearTimeout(timeout);
              resolve();
            }
          } catch (e) {
            clearTimeout(timeout);
            reject(e);
          }
        });
      });

      await new Promise<void>((resolve, reject) => {
        ws.on("open", () => resolve());
        ws.on("error", (err) => reject(err));
      });

      logger.debug("Should be ignored");
      logger.info("Info message after debug");

      await infoPromise;
      expect(received.some((m) => m.message.includes("Should be ignored"))).to.be.false;
      expect(received.some((m) => m.message.includes("Info message after debug"))).to.be.true;
    } finally {
      if (originalDebug !== undefined) {
        process.env.DEBUG = originalDebug;
      } else {
        delete process.env.DEBUG;
      }
      logger.level = originalLevel;
    }
  });

  it("should broadcast debug messages when DEBUG env is set", async () => {
    const originalDebug = process.env.DEBUG;
    const originalLevel = logger.level;
    process.env.DEBUG = "true";
    logger.level = "debug";

    try {
      emulator = new LoggingEmulator({ port, host: "127.0.0.1" });
      await emulator.start();

      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      client = ws;

      const messagePromise = new Promise<LogEntry>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Timeout waiting for debug message"));
        }, 5000);

        ws.on("message", (data) => {
          clearTimeout(timeout);
          try {
            resolve(JSON.parse(data.toString()) as LogEntry);
          } catch (e) {
            reject(e);
          }
        });
      });

      await new Promise<void>((resolve, reject) => {
        ws.on("open", () => resolve());
        ws.on("error", (err) => reject(err));
      });

      logger.debug("Debug message from unit test!");

      const receivedMessage = await messagePromise;
      expect(receivedMessage.level).to.equal("debug");
      expect(receivedMessage.message).to.contain("Debug message from unit test!");
    } finally {
      if (originalDebug !== undefined) {
        process.env.DEBUG = originalDebug;
      } else {
        delete process.env.DEBUG;
      }
      logger.level = originalLevel;
    }
  });
});
