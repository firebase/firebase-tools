import * as sinon from "sinon";
import { Emulators } from "./types";
import { EmulatorRegistry } from "./registry";
import { expect } from "chai";
import { FakeEmulator } from "./testing/fakeEmulator";
import { shouldStart, startAll } from "./controller";
import { Options } from "../options";
import * as commandUtils from "./commandUtils";
import * as utils from "../utils";

function createMockOptions(
  only: string | undefined,
  configValues: { [key: string]: any },
): Options {
  const config = {
    get: (key: string) => configValues[key],
    has: (key: string) => !!configValues[key],
    src: {
      emulators: configValues,
      functions: configValues.functions,
    },
  };
  return {
    only,
    config,
    project: "test-project",
  } as any;
}

describe("EmulatorController", () => {
  afterEach(async () => {
    sinon.restore();
    await EmulatorRegistry.stopAll();
  });

  it("should start and stop an emulator", async () => {
    const name = Emulators.FUNCTIONS;

    expect(EmulatorRegistry.isRunning(name)).to.be.false;

    const fake = await FakeEmulator.create(name);
    await EmulatorRegistry.start(fake);

    expect(EmulatorRegistry.isRunning(name)).to.be.true;
    expect(EmulatorRegistry.getInfo(name)!.port).to.eql(fake.getInfo().port);
  });

  describe("shouldStart", () => {
    it("should start the hub if a project is specified", () => {
      const options = { project: "test-project" } as Options;
      expect(shouldStart(options, Emulators.HUB)).to.be.true;
    });

    it("should start the hub even if no project is specified", () => {
      const options = {} as Options;
      expect(shouldStart(options, Emulators.HUB)).to.be.true;
    });

    it("should start the UI if options.ui is true", () => {
      const options = createMockOptions(undefined, {});
      options.ui = true;
      expect(shouldStart(options, Emulators.UI)).to.be.true;
    });

    it("should start the UI if a project is specified and a UI-supported emulator is running", () => {
      const options = createMockOptions("firestore", { firestore: {} });
      expect(shouldStart(options, Emulators.UI)).to.be.true;
    });

    it("should start the UI even if no project is specified", () => {
      const options = createMockOptions("firestore", { firestore: {} });
      delete options.project;
      expect(shouldStart(options, Emulators.UI)).to.be.true;
    });

    it("should not start the UI if no UI-supported emulator is running", () => {
      const options = createMockOptions(undefined, {});
      expect(shouldStart(options, Emulators.UI)).to.be.false;
    });

    it("should start an emulator if it's in the only string", () => {
      const options = createMockOptions("functions,hosting", {
        functions: { source: "functions" },
        hosting: {},
      });
      expect(shouldStart(options, Emulators.FUNCTIONS)).to.be.true;
    });

    it("should not start an emulator if it's not in the only string", () => {
      const options = createMockOptions("functions", {
        functions: { source: "functions" },
        hosting: {},
      });
      expect(shouldStart(options, Emulators.HOSTING)).to.be.false;
    });

    it("should not start an emulator if it's in the only string but has no config", () => {
      const options = createMockOptions("hosting,functions", {
        hosting: {},
      });
      expect(shouldStart(options, Emulators.FUNCTIONS)).to.be.false;
    });

    it("should not start functions emulator if source directory is not configured", () => {
      const options = createMockOptions("functions", {
        functions: {}, // Config is present, but no source
      });
      expect(shouldStart(options, Emulators.FUNCTIONS)).to.be.false;
    });
  });

  describe("startAll Java version check", () => {
    it("should error if Java major version is below 21", async () => {
      sinon.stub(commandUtils, "checkJavaMajorVersion").resolves(17);
      const options = createMockOptions("firestore", { firestore: {} });
      await expect(startAll(options)).to.be.rejectedWith(commandUtils.JAVA_UNSUPPORTED_ERROR);
    });

    it("should log a deprecation warning if Java major version is between 21 and 24", async () => {
      sinon.stub(commandUtils, "checkJavaMajorVersion").resolves(21);
      const logStub = sinon.stub(utils, "logLabeledError");
      const options = createMockOptions("firestore,doesnotexist", { firestore: {} });
      await expect(startAll(options)).to.be.rejectedWith(/doesnotexist is not a valid emulator/);
      expect(logStub.calledWith("emulators", commandUtils.JAVA_DEPRECATION_WARNING, "warn")).to.be
        .true;
    });

    it("should not log a deprecation warning if Java major version is 25 or above", async () => {
      sinon.stub(commandUtils, "checkJavaMajorVersion").resolves(25);
      const logStub = sinon.stub(utils, "logLabeledError");
      const options = createMockOptions("firestore,doesnotexist", { firestore: {} });
      await expect(startAll(options)).to.be.rejectedWith(/doesnotexist is not a valid emulator/);
      expect(logStub.called).to.be.false;
    });
  });
}).timeout(2000);
