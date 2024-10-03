import * as portUtils from "../portUtils";
import * as sinon from "sinon";
import * as spawn from "../../init/spawn";
import { expect } from "chai";
import * as serve from "./serve";
import { DEFAULT_PORTS } from "../constants";
import * as utils from "./utils";
import * as environments from "./environments";

describe("serve", () => {
  let checkListenableStub: sinon.SinonStub;
  let wrapSpawnStub: sinon.SinonStub;
  let discoverPackageManagerStub: sinon.SinonStub;
  let getLocalAppHostingConfigurationStub: sinon.SinonStub;

  beforeEach(() => {
    checkListenableStub = sinon.stub(portUtils, "checkListenable");
    wrapSpawnStub = sinon.stub(spawn, "wrapSpawn");
    discoverPackageManagerStub = sinon.stub(utils, "discoverPackageManager");
    getLocalAppHostingConfigurationStub = sinon.stub(
      environments,
      "getLocalAppHostingConfiguration",
    );
  });

  afterEach(() => {
    checkListenableStub.restore();
    wrapSpawnStub.restore();
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
  });
});
