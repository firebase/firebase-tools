import { createServer } from "node:net";

import { Emulators, ListenSpec } from "../types";
import { ExpressBasedEmulator } from "../ExpressBasedEmulator";
import { resolveHostAndAssignPorts } from "../portUtils";

/**
 * Ask the OS for an unused ephemeral port so parallel test workers do not race
 * starting their port search from the same fixed number.
 */
function getEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (err) => {
      server.removeAllListeners();
      reject(err);
    });
    server.once("listening", () => {
      server.removeAllListeners();
      const addr = server.address();
      const port = addr && typeof addr === "object" ? addr.port : undefined;
      server.close((err) => {
        server.removeAllListeners();
        if (err) {
          reject(err);
        } else if (port === undefined) {
          reject(new Error("Failed to determine ephemeral port from net.Server"));
        } else {
          resolve(port);
        }
      });
    });
    server.listen(0, "127.0.0.1");
  });
}

/**
 * A thing that acts like an emulator by just occupying a port.
 */
export class FakeEmulator extends ExpressBasedEmulator {
  constructor(
    public name: Emulators,
    listen: ListenSpec[],
  ) {
    super({ listen, noBodyParser: true, noCors: true });
  }
  getName(): Emulators {
    return this.name;
  }

  static async create(name: Emulators, host = "127.0.0.1"): Promise<FakeEmulator> {
    const port = await getEphemeralPort();
    const listen = await resolveHostAndAssignPorts({
      [name]: {
        host,
        port,
      },
    });
    return new FakeEmulator(name, listen[name]);
  }
}
