import { expect } from "chai";
import * as sinon from "sinon";

import { getEventarcEmulatorAddress } from "./dataconnectEmulator";
import { EventarcEmulator } from "./eventarcEmulator";
import { EmulatorRegistry } from "./registry";
import { Emulators } from "./types";
import * as experiments from "../experiments";

describe("dataconnectEmulator", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    experiments.setEnabled("fscEventTriggers", null);
    sandbox.restore();
  });

  describe("getEventarcEmulatorAddress", () => {
    it("returns undefined when fscEventTriggers experiment is disabled", () => {
      experiments.setEnabled("fscEventTriggers", false);
      sandbox.stub(EmulatorRegistry, "isRunning").withArgs(Emulators.FUNCTIONS).returns(true);
      sandbox
        .stub(EmulatorRegistry, "get")
        .withArgs(Emulators.EVENTARC)
        .returns(new EventarcEmulator({ host: "127.0.0.1", port: 9299 }));

      expect(getEventarcEmulatorAddress()).to.be.undefined;
    });

    it("returns undefined when Functions emulator is not running", () => {
      experiments.setEnabled("fscEventTriggers", true);
      sandbox.stub(EmulatorRegistry, "isRunning").withArgs(Emulators.FUNCTIONS).returns(false);
      sandbox
        .stub(EmulatorRegistry, "get")
        .withArgs(Emulators.EVENTARC)
        .returns(new EventarcEmulator({ host: "127.0.0.1", port: 9299 }));

      expect(getEventarcEmulatorAddress()).to.be.undefined;
    });

    it("returns undefined when Eventarc emulator is not running", () => {
      experiments.setEnabled("fscEventTriggers", true);
      sandbox.stub(EmulatorRegistry, "isRunning").withArgs(Emulators.FUNCTIONS).returns(true);
      sandbox.stub(EmulatorRegistry, "get").withArgs(Emulators.EVENTARC).returns(undefined);

      expect(getEventarcEmulatorAddress()).to.be.undefined;
    });

    it("maps 0.0.0.0 wildcard host to 127.0.0.1", () => {
      experiments.setEnabled("fscEventTriggers", true);
      sandbox.stub(EmulatorRegistry, "isRunning").withArgs(Emulators.FUNCTIONS).returns(true);
      sandbox
        .stub(EmulatorRegistry, "get")
        .withArgs(Emulators.EVENTARC)
        .returns(new EventarcEmulator({ host: "0.0.0.0", port: 9299 }));

      expect(getEventarcEmulatorAddress()).to.equal("127.0.0.1:9299");
    });

    it("maps :: wildcard host to 127.0.0.1", () => {
      experiments.setEnabled("fscEventTriggers", true);
      sandbox.stub(EmulatorRegistry, "isRunning").withArgs(Emulators.FUNCTIONS).returns(true);
      sandbox
        .stub(EmulatorRegistry, "get")
        .withArgs(Emulators.EVENTARC)
        .returns(new EventarcEmulator({ host: "::", port: 9301 }));

      expect(getEventarcEmulatorAddress()).to.equal("127.0.0.1:9301");
    });

    it("preserves explicit host and port", () => {
      experiments.setEnabled("fscEventTriggers", true);
      sandbox.stub(EmulatorRegistry, "isRunning").withArgs(Emulators.FUNCTIONS).returns(true);
      sandbox
        .stub(EmulatorRegistry, "get")
        .withArgs(Emulators.EVENTARC)
        .returns(new EventarcEmulator({ host: "localhost", port: 9302 }));

      expect(getEventarcEmulatorAddress()).to.equal("localhost:9302");
    });
  });
});
