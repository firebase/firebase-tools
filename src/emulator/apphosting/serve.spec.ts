import * as sinon from "sinon";
import { expect } from "chai";
import * as portUtils from "../portUtils";
import * as spawn from "../../init/spawn";
import * as serve from "./serve";
import { DEFAULT_PORTS } from "../constants";
import * as utils from "./utils";
import * as configs from "./config";

describe("serve", () => {
  let checkListenableStub: sinon.SinonStub;
  let wrapSpawnStub: sinon.SinonStub;
  let spawnWithCommandStringStub: sinon.SinonStub;
  let discoverPackageManagerStub: sinon.SinonStub;
  let getLocalAppHostingConfigurationStub: sinon.SinonStub;

  beforeEach(() => {
    checkListenableStub = sinon.stub(portUtils, "checkListenable");
    wrapSpawnStub = sinon.stub(spawn, "wrapSpawn");
    spawnWithCommandStringStub = sinon.stub(spawn, "spawnWithCommandString");
    discoverPackageManagerStub = sinon.stub(utils, "discoverPackageManager");
    getLocalAppHostingConfigurationStub = sinon.stub(configs, "getLocalAppHostingConfiguration");
  });

  afterEach(() => {
    checkListenableStub.restore();
    wrapSpawnStub.restore();
    spawnWithCommandStringStub.restore();
    discoverPackageManagerStub.restore();
    getLocalAppHostingConfigurationStub.restore();
  });

  describe("start", () => {
    it("should only select an available port to serve", async () => {
      checkListenableStub.onFirstCall().returns(false);
      checkListenableStub.onSecondCall().returns(false);
      checkListenableStub.onThirdCall().returns(true);
      getLocalAppHostingConfigurationStub.returns({ environmentVariables: {}, secrets: {} });
      const res = await serve.start();
      expect(res.port).to.equal(DEFAULT_PORTS.apphosting + 2);
    });

    it("should run the custom start command if one is provided", async () => {
      const customStartCommand = "custom test command";
      checkListenableStub.onFirstCall().returns(true);
      getLocalAppHostingConfigurationStub.returns({ environmentVariables: {}, secrets: {} });

      await serve.start({ customStartCommand });

      expect(spawnWithCommandStringStub).to.be.called;
      expect(spawnWithCommandStringStub.getCall(0).args[0]).to.eq(customStartCommand);
    });
  });
});
