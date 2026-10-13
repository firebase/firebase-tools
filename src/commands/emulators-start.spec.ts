import { expect } from "chai";
import * as sinon from "sinon";
import { stripVTControlCharacters } from "node:util";

import { printEmulatorOverview } from "./emulators-start";
import { EmulatorRegistry } from "../emulator/registry";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import * as controller from "../emulator/controller";
import * as portUtils from "../emulator/portUtils";
import { logger } from "../logger";
import { Options } from "../options";

function createFakeEmulatorInstance(info: EmulatorInfo): EmulatorInstance {
  return {
    start: () => Promise.resolve(),
    connect: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    getInfo: () => info,
    getName: () => info.name,
  };
}

describe("emulators:start", () => {
  let loggerInfoStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(portUtils, "waitForPortUsed").resolves();
    loggerInfoStub = sinon.stub(logger, "info");
  });

  afterEach(async () => {
    await EmulatorRegistry.stopAll();
    sinon.restore();
  });

  describe("printEmulatorOverview", () => {
    const fakeOptions = {} as Options;

    it("should display connectable URL without listen hint when UI listens on 127.0.0.1", async () => {
      sinon.stub(controller, "filterEmulatorTargets").returns([Emulators.AUTH]);
      await EmulatorRegistry.start(
        createFakeEmulatorInstance({ name: Emulators.UI, host: "127.0.0.1", port: 4000 }),
      );
      await EmulatorRegistry.start(
        createFakeEmulatorInstance({ name: Emulators.HUB, host: "127.0.0.1", port: 4400 }),
      );
      await EmulatorRegistry.start(
        createFakeEmulatorInstance({ name: Emulators.AUTH, host: "127.0.0.1", port: 9099 }),
      );

      printEmulatorOverview(fakeOptions);

      expect(loggerInfoStub).to.have.been.calledOnce;
      const output = stripVTControlCharacters(loggerInfoStub.firstCall.args[0] as string);
      expect(output).to.include("View Emulator UI at http://127.0.0.1:4000/");
      expect(output).to.not.include("(listening on");
      expect(output).to.include("Emulator Hub host: 127.0.0.1 port: 4400");
      expect(output).to.include("127.0.0.1:9099");
      expect(output).to.include("http://127.0.0.1:4000/auth");
    });

    it("should append listen address when UI and Hub listen on 0.0.0.0", async () => {
      sinon
        .stub(controller, "filterEmulatorTargets")
        .returns([Emulators.AUTH, Emulators.FIRESTORE]);
      await EmulatorRegistry.start(
        createFakeEmulatorInstance({ name: Emulators.UI, host: "0.0.0.0", port: 4000 }),
      );
      await EmulatorRegistry.start(
        createFakeEmulatorInstance({ name: Emulators.HUB, host: "0.0.0.0", port: 4400 }),
      );
      await EmulatorRegistry.start(
        createFakeEmulatorInstance({ name: Emulators.AUTH, host: "0.0.0.0", port: 9098 }),
      );
      await EmulatorRegistry.start(
        createFakeEmulatorInstance({ name: Emulators.FIRESTORE, host: "0.0.0.0", port: 8080 }),
      );

      printEmulatorOverview(fakeOptions);

      expect(loggerInfoStub).to.have.been.calledOnce;
      const output = stripVTControlCharacters(loggerInfoStub.firstCall.args[0] as string);
      expect(output).to.include(
        "View Emulator UI at http://127.0.0.1:4000/ (listening on 0.0.0.0:4000)",
      );
      expect(output).to.include("Emulator Hub host: 0.0.0.0 port: 4400");
      expect(output).to.include("0.0.0.0:9098");
      expect(output).to.include("http://127.0.0.1:4000/auth");
      expect(output).to.include("0.0.0.0:8080");
      expect(output).to.include("http://127.0.0.1:4000/firestore");
    });

    it("should append bracketed IPv6 listen address when UI and Hub listen on ::", async () => {
      sinon.stub(controller, "filterEmulatorTargets").returns([Emulators.AUTH]);
      await EmulatorRegistry.start(
        createFakeEmulatorInstance({ name: Emulators.UI, host: "::", port: 4000 }),
      );
      await EmulatorRegistry.start(
        createFakeEmulatorInstance({ name: Emulators.HUB, host: "::", port: 4400 }),
      );
      await EmulatorRegistry.start(
        createFakeEmulatorInstance({ name: Emulators.AUTH, host: "::", port: 9098 }),
      );

      printEmulatorOverview(fakeOptions);

      expect(loggerInfoStub).to.have.been.calledOnce;
      const output = stripVTControlCharacters(loggerInfoStub.firstCall.args[0] as string);
      expect(output).to.include("View Emulator UI at http://[::1]:4000/ (listening on [::]:4000)");
      expect(output).to.include("Emulator Hub host: :: port: 4400");
      expect(output).to.include("[::]:9098");
      expect(output).to.include("http://[::1]:4000/auth");
    });

    it("should handle when Emulator UI and Emulator Hub are not running", async () => {
      sinon.stub(controller, "filterEmulatorTargets").returns([Emulators.AUTH]);
      await EmulatorRegistry.start(
        createFakeEmulatorInstance({ name: Emulators.AUTH, host: "127.0.0.1", port: 9099 }),
      );

      printEmulatorOverview(fakeOptions);

      expect(loggerInfoStub).to.have.been.calledOnce;
      const output = stripVTControlCharacters(loggerInfoStub.firstCall.args[0] as string);
      expect(output).to.not.include("View Emulator UI at");
      expect(output).to.include("Emulator Hub not running.");
    });
  });
});
