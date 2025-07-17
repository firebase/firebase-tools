import { Emulators, EmulatorInfo, ExportMetadata } from "./types";
import { EmulatorRegistry } from "./registry";
import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs-extra";
import * as controller from "./controller";
import { Config } from "../config";
import { FakeEmulator } from "./testing/fakeEmulator";
import * as utils from "../utils";
import { EmulatorHub } from "./hub";

describe("EmulatorController", () => {
  let fsExistsSyncStub: sinon.SinonStub;
  let fsLstatSyncStub: sinon.SinonStub;
  let fsReaddirSyncStub: sinon.SinonStub;
  let findExportMetadataStub: sinon.SinonStub;
  let exportEmulatorDataStub: sinon.SinonStub;
  let logBulletStub: sinon.SinonStub;
  let logLabeledStub: sinon.SinonStub;
  let hubGetInstanceStub: sinon.SinonStub;


  beforeEach(() => {
    fsExistsSyncStub = sinon.stub(fs, "existsSync");
    fsLstatSyncStub = sinon.stub(fs, "lstatSync");
    fsReaddirSyncStub = sinon.stub(fs, "readdirSync");
    findExportMetadataStub = sinon.stub(controller, "findExportMetadata" as any);
    exportEmulatorDataStub = sinon.stub(controller, "exportEmulatorData" as any);
    logBulletStub = sinon.stub(utils, "logBullet");
    logLabeledStub = sinon.stub(utils, "logLabeled"); // For hubLogger.logLabeled

    // Stub EmulatorRegistry.get(Emulators.HUB) to return a mock hub instance
    // so that hubLogger doesn't throw an error.
    const mockHubInstance = sinon.createStubInstance(EmulatorHub);
    hubGetInstanceStub = sinon.stub(EmulatorRegistry, "get").withArgs(Emulators.HUB).returns(mockHubInstance as any);

  });

  afterEach(async () => {
    await EmulatorRegistry.stopAll();
    sinon.restore();
  });

  describe("startAll", () => {
    const baseOptions = () => ({
      project: "test-project",
      only: "firestore", // Assume at least one emulator is always being started
      config: new Config({ firestore: {}, emulators: {} }, {}),
      targets: [Emulators.FIRESTORE], // Added to satisfy filterEmulatorTargets
    });

    it("should attempt to import from dataDir if set and valid", async () => {
      const opts = baseOptions();
      opts.config = new Config({ firestore: {}, emulators: { dataDir: "./emulator_data_dir" } }, {});
      fsExistsSyncStub.withArgs(sinon.match.string).returns(true);
      fsLstatSyncStub.returns({ isDirectory: () => true } as fs.Stats);
      const mockMetadata: ExportMetadata = { version: "1.0", firestore: { version: "prod", path: "./", metadata_file: "f.json"} };
      findExportMetadataStub.resolves(mockMetadata);

      // Stubbing minimum required for startAll to proceed without erroring out on other parts
      sinon.stub(controller, "shouldStart" as any).returns(true);
      sinon.stub(controller, "getListenConfig" as any).returns({ host: "localhost", port: 8080, portFixed: true });
      sinon.stub(controller, "resolveHostAndAssignPorts" as any).resolves({ firestore: [{address: "localhost", port: 8080, family: "ipv4"}]});
      sinon.stub(EmulatorRegistry, "start").resolves();
      sinon.stub(fsConfig, "getFirestoreConfig" as any).returns([{rules: "firestore.rules"}]);


      await controller.startAll(opts);

      expect(findExportMetadataStub.calledWith(sinon.match("emulator_data_dir"))).to.be.true;
      // Further assertions would check if this metadata was passed to individual emulator imports
    });

    it("should use --import path if dataDir is not set or invalid, and --import is set", async () => {
      const opts = baseOptions();
      opts.config = new Config({ firestore: {}, emulators: {} }, {}); // No dataDir
      (opts as any).import = "./import_dir";

      fsExistsSyncStub.withArgs(sinon.match("import_dir")).returns(true);
      fsLstatSyncStub.withArgs(sinon.match("import_dir")).returns({ isDirectory: () => true } as fs.Stats);
      const mockMetadata: ExportMetadata = { version: "1.0", firestore: { version: "prod", path: "./", metadata_file: "f.json"} };
      findExportMetadataStub.withArgs(sinon.match("import_dir")).resolves(mockMetadata);

      sinon.stub(controller, "shouldStart" as any).returns(true);
      sinon.stub(controller, "getListenConfig" as any).returns({ host: "localhost", port: 8080, portFixed: true });
      sinon.stub(controller, "resolveHostAndAssignPorts" as any).resolves({ firestore: [{address: "localhost", port: 8080, family: "ipv4"}]});
      sinon.stub(EmulatorRegistry, "start").resolves();
      sinon.stub(fsConfig, "getFirestoreConfig" as any).returns([{rules: "firestore.rules"}]);

      await controller.startAll(opts);

      expect(findExportMetadataStub.calledWith(sinon.match("import_dir"))).to.be.true;
    });
  });

  describe("exportOnExit", () => {
    it("should export to dataDir if set and --export-on-exit is not used", async () => {
      const options = {
        project: "test-project",
        config: new Config({ emulators: { dataDir: "./emulator_data_dir" } }, {}),
      };
      exportEmulatorDataStub.resolves();

      await controller.exportOnExit(options);

      expect(exportEmulatorDataStub.calledOnceWith("./emulator_data_dir", options, "datadir_exit")).to.be.true;
      expect(logBulletStub.calledWith(sinon.match("Automatically exporting data to global dataDir: \"./emulator_data_dir\""))).to.be.true;
    });

    it("should use --export-on-exit path if provided, even if dataDir is set", async () => {
      const options = {
        project: "test-project",
        config: new Config({ emulators: { dataDir: "./emulator_data_dir" } }, {}),
        exportOnExit: "./explicit_export_dir",
      };
      exportEmulatorDataStub.resolves();

      await controller.exportOnExit(options);

      expect(exportEmulatorDataStub.calledOnceWith("./explicit_export_dir", options, "exit")).to.be.true;
    });

    it("should do nothing if neither dataDir nor --export-on-exit is set", async () => {
      const options = {
        project: "test-project",
        config: new Config({ emulators: {} }, {}),
      };

      await controller.exportOnExit(options);

      expect(exportEmulatorDataStub.called).to.be.false;
    });
  });

  // Previous tests for start and stop can remain here
  it("should start and stop an emulator", async () => {
    const name = Emulators.FUNCTIONS;
    hubGetInstanceStub.restore() // remove hub stub for this specific test if it interferes

    expect(EmulatorRegistry.isRunning(name)).to.be.false;

    const fake = await FakeEmulator.create(name);
    await EmulatorRegistry.start(fake);

    expect(EmulatorRegistry.isRunning(name)).to.be.true;
    expect(EmulatorRegistry.getInfo(name)!.port).to.eql(fake.getInfo().port);
  });
}).timeout(5000); // Increased timeout for async operations
