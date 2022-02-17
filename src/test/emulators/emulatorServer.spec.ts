import { Emulators } from "../../emulator/types";
import { EmulatorRegistry } from "../../emulator/registry";
import { expect } from "chai";
import { FakeEmulator } from "./fakeEmulator";
import { EmulatorServer } from "../../emulator/emulatorServer";
import { findAvailablePort } from "../../emulator/portUtils";

describe("EmulatorServer", () => {
  it("should correctly start and stop an emulator", async () => {
    const name = Emulators.FUNCTIONS;
    const port = await findAvailablePort("localhost", 5000);
    const emulator = new FakeEmulator(name, "localhost", port);
    const server = new EmulatorServer(emulator);

    await server.start();

    expect(EmulatorRegistry.isRunning(name)).to.be.true;
    expect(EmulatorRegistry.get(name)).to.eql(emulator);

    await server.stop();

    expect(EmulatorRegistry.isRunning(name)).to.be.false;
  });
});
