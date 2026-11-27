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
});
