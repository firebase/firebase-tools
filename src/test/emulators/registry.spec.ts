import { ALL_EMULATORS, Emulators } from "../../emulator/types";
import { EmulatorRegistry } from "../../emulator/registry";
import { expect } from "chai";
import { FakeEmulator } from "./fakeEmulator";
import { findAvailablePort } from "../../emulator/portUtils";

describe("EmulatorRegistry", () => {
  afterEach(async () => {
    await EmulatorRegistry.stopAll();
  });

  it("should not report any running emulators when empty", () => {
    for (const name of ALL_EMULATORS) {
      expect(EmulatorRegistry.isRunning(name)).to.be.false;
    }

    expect(EmulatorRegistry.listRunning()).to.be.empty;
  });

  it("should correctly return information about a running emulator", async () => {
    const name = Emulators.FUNCTIONS;
    const port = await findAvailablePort("localhost", 5000);
    const emu = new FakeEmulator(name, "localhost", port);

    expect(EmulatorRegistry.isRunning(name)).to.be.false;

    await EmulatorRegistry.start(emu);

    expect(EmulatorRegistry.isRunning(name)).to.be.true;
    expect(EmulatorRegistry.listRunning()).to.eql([name]);
    expect(EmulatorRegistry.get(name)).to.eql(emu);
    expect(EmulatorRegistry.getPort(name)).to.eql(port);
  });

  it("once stopped, an emulator is no longer running", async () => {
    const name = Emulators.FUNCTIONS;
    const port = await findAvailablePort("localhost", 5000);
    const emu = new FakeEmulator(name, "localhost", port);

    expect(EmulatorRegistry.isRunning(name)).to.be.false;
    await EmulatorRegistry.start(emu);
    expect(EmulatorRegistry.isRunning(name)).to.be.true;
    await EmulatorRegistry.stop(name);
    expect(EmulatorRegistry.isRunning(name)).to.be.false;
  });
});
