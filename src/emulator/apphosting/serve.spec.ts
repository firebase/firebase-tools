import * as sinon from "sinon";
import { expect } from "chai";
import * as portUtils from "../portUtils";
import * as spawn from "../../init/spawn";
import * as serve from "./serve";
import { DEFAULT_PORTS } from "../constants";
import * as utils from "./utils";
import * as configsImport from "./config";
import * as projectPathImport from "../../projectPath";
import { AppHostingYamlConfig } from "../../apphosting/yaml";

describe("serve", () => {
  let checkListenableStub: sinon.SinonStub;
  let wrapSpawnStub: sinon.SinonStub;
  let spawnWithCommandStringStub: sinon.SinonStub;
  let discoverPackageManagerStub: sinon.SinonStub;
  let configsStub: sinon.SinonStubbedInstance<typeof configsImport>;
  let resolveProjectPathStub: sinon.SinonStub;

  beforeEach(() => {
    checkListenableStub = sinon.stub(portUtils, "checkListenable");
    wrapSpawnStub = sinon.stub(spawn, "wrapSpawn");
    spawnWithCommandStringStub = sinon.stub(spawn, "spawnWithCommandString");
    discoverPackageManagerStub = sinon.stub(utils, "discoverPackageManager");
    configsStub = sinon.stub(configsImport);
    resolveProjectPathStub = sinon.stub(projectPathImport, "resolveProjectPath");

    resolveProjectPathStub.returns("");
  });

  afterEach(() => {
    wrapSpawnStub.restore();
    discoverPackageManagerStub.restore();
    sinon.verifyAndRestore();
  });

  describe("start", () => {
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
