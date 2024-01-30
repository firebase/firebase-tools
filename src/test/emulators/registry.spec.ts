import { ALL_EMULATORS, Emulators } from "../../emulator/types";
import { EmulatorRegistry } from "../../emulator/registry";
import { expect } from "chai";
import { FakeEmulator } from "./fakeEmulator";
import * as express from "express";
import * as os from "os";

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
    const emu = await FakeEmulator.create(name);

    expect(EmulatorRegistry.isRunning(name)).to.be.false;

    await EmulatorRegistry.start(emu);

    expect(EmulatorRegistry.isRunning(name)).to.be.true;
    expect(EmulatorRegistry.listRunning()).to.eql([name]);
    expect(EmulatorRegistry.get(name)).to.eql(emu);
    expect(EmulatorRegistry.getInfo(name)!.port).to.eql(emu.getInfo().port);
  });

  it("once stopped, an emulator is no longer running", async () => {
    const name = Emulators.FUNCTIONS;
    const emu = await FakeEmulator.create(name);

    expect(EmulatorRegistry.isRunning(name)).to.be.false;
    await EmulatorRegistry.start(emu);
    expect(EmulatorRegistry.isRunning(name)).to.be.true;
    await EmulatorRegistry.stop(name);
    expect(EmulatorRegistry.isRunning(name)).to.be.false;
  });

  describe("#url", () => {
    // Only run IPv4 / IPv6 tests if supported respectively.
    let ipv4Supported = false;
    let ipv6Supported = false;
    before(() => {
      for (const ifaces of Object.values(os.networkInterfaces())) {
        if (!ifaces) {
          continue;
        }
        for (const iface of ifaces) {
          switch (iface.family) {
            case "IPv4":
              ipv4Supported = true;
              break;
            case "IPv6":
              ipv6Supported = true;
              break;
          }
        }
      }
    });

    const name = Emulators.FUNCTIONS;
    afterEach(() => {
      return EmulatorRegistry.stopAll();
    });

    it("should craft URL from host and port in registry", async () => {
      const emu = await FakeEmulator.create(name);
      await EmulatorRegistry.start(emu);

      expect(EmulatorRegistry.url(name).host).to.eql(`${emu.getInfo().host}:${emu.getInfo().port}`);
    });

    it("should quote IPv6 addresses", async function (this) {
      if (!ipv6Supported) {
        return this.skip();
      }
      const emu = await FakeEmulator.create(name, "::1");
      await EmulatorRegistry.start(emu);

      expect(EmulatorRegistry.url(name).host).to.eql(`[::1]:${emu.getInfo().port}`);
    });

    it("should use 127.0.0.1 instead of 0.0.0.0", async function (this) {
      if (!ipv4Supported) {
        return this.skip();
      }

      const emu = await FakeEmulator.create(name, "0.0.0.0");
      await EmulatorRegistry.start(emu);

      expect(EmulatorRegistry.url(name).host).to.eql(`127.0.0.1:${emu.getInfo().port}`);
    });

    it("should use ::1 instead of ::", async function (this) {
      if (!ipv6Supported) {
        return this.skip();
      }

      const emu = await FakeEmulator.create(name, "::");
      await EmulatorRegistry.start(emu);

      expect(EmulatorRegistry.url(name).host).to.eql(`[::1]:${emu.getInfo().port}`);
    });

    it("should use protocol from request if available", async () => {
      const emu = await FakeEmulator.create(name);
      await EmulatorRegistry.start(emu);

      const req = { protocol: "https", headers: {} } as express.Request;
      expect(EmulatorRegistry.url(name, req).protocol).to.eql(`https:`);
      expect(EmulatorRegistry.url(name, req).host).to.eql(
        `${emu.getInfo().host}:${emu.getInfo().port}`,
      );
    });

    it("should use host from request if available", async () => {
      const emu = await FakeEmulator.create(name);
      await EmulatorRegistry.start(emu);

      const hostFromHeader = "mydomain.example.test:9999";
      const req = {
        protocol: "http",
        headers: { host: hostFromHeader },
      } as express.Request;
      expect(EmulatorRegistry.url(name, req).host).to.eql(hostFromHeader);
    });
  });
});
