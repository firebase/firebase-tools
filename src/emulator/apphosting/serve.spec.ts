import sinon from "sinon";
import { expect } from "chai";
import * as portUtils from "../portUtils.js";
import * as spawn from "../../init/spawn.js";
import * as serve from "./serve.js";
import { DEFAULT_PORTS } from "../constants.js";
import * as utils from "./developmentServer.js";
import * as configsImport from "./config.js";
import * as projectPathImport from "../../projectPath.js";
import { AppHostingYamlConfig } from "../../apphosting/yaml.js";

describe("serve", () => {
  let checkListenableStub: sinon.SinonStub;
  let wrapSpawnStub: sinon.SinonStub;
  let spawnWithCommandStringStub: sinon.SinonStub;
  let detectStartCommandStub: sinon.SinonStub;
  let configsStub: sinon.SinonStubbedInstance<typeof configsImport>;
  let resolveProjectPathStub: sinon.SinonStub;

  beforeEach(() => {
    checkListenableStub = sinon.stub(portUtils, "checkListenable");
    wrapSpawnStub = sinon.stub(spawn, "wrapSpawn");
    spawnWithCommandStringStub = sinon.stub(spawn, "spawnWithCommandString");
    detectStartCommandStub = sinon.stub(utils, "detectStartCommand");
    configsStub = sinon.stub(configsImport);
    resolveProjectPathStub = sinon.stub(projectPathImport, "resolveProjectPath");

    resolveProjectPathStub.returns("");
    detectStartCommandStub.returns("npm run dev");
  });

  afterEach(() => {
    wrapSpawnStub.restore();
    detectStartCommandStub.restore();
    checkListenableStub.restore();
    sinon.verifyAndRestore();
  });

  describe("start", () => {
    it("should use user-provided port if one is defined", async () => {
      checkListenableStub.onFirstCall().returns(true);
      configsStub.getLocalAppHostingConfiguration.returns(
        Promise.resolve(AppHostingYamlConfig.empty()),
      );

      const res = await serve.start({ port: 9999 });
      expect(res.port).to.equal(9999);
    });

    it("should only select an available port to serve", async () => {
      checkListenableStub.onFirstCall().returns(false);
      checkListenableStub.onSecondCall().returns(false);
      checkListenableStub.onThirdCall().returns(true);
      configsStub.getLocalAppHostingConfiguration.returns(
        Promise.resolve(AppHostingYamlConfig.empty()),
      );
      const res = await serve.start();
      expect(res.port).to.equal(DEFAULT_PORTS.apphosting + 2);
    });

    it("should run the custom start command if one is provided", async () => {
      const startCommand = "custom test command";
      checkListenableStub.onFirstCall().returns(true);
      configsStub.getLocalAppHostingConfiguration.returns(
        Promise.resolve(AppHostingYamlConfig.empty()),
      );

      await serve.start({ startCommand });

      expect(spawnWithCommandStringStub).to.be.called;
      expect(spawnWithCommandStringStub.getCall(0).args[0]).to.eq(startCommand);
    });
  });
});
