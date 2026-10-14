import { Emulators, ListenSpec } from "../types";
import { ExpressBasedEmulator } from "../ExpressBasedEmulator";
import { resolveHostAndAssignPorts } from "../portUtils";

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
    const listen = await resolveHostAndAssignPorts({
      [name]: {
        host,
        port: 4000,
      },
    });
    return new FakeEmulator(name, listen[name]);
  }
}
