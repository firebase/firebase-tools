import * as portUtils from "../portUtils";
import * as sinon from "sinon";
import * as spawn from "../../init/spawn";
import { expect } from "chai";
import * as serve from "./serve";
import { DEFAULT_PORTS } from "../constants";
import * as utils from "./utils";

describe("serve", () => {
  let checkListenableStub: sinon.SinonStub;
  let wrapSpawnStub: sinon.SinonStub;
  let discoverPackageManagerStub: sinon.SinonStub;

  beforeEach(() => {
    checkListenableStub = sinon.stub(portUtils, "checkListenable");
    wrapSpawnStub = sinon.stub(spawn, "wrapSpawn");
    discoverPackageManagerStub = sinon.stub(utils, "discoverPackageManager");
  });

  afterEach(() => {
    checkListenableStub.restore();
    wrapSpawnStub.restore();
    discoverPackageManagerStub.restore();
  });

  describe("start", () => {
    it("should only select an available port to serve", async () => {
      checkListenableStub.onFirstCall().returns(false);
      checkListenableStub.onSecondCall().returns(false);
      checkListenableStub.onThirdCall().returns(true);

      wrapSpawnStub.returns(Promise.resolve());

      const res = await serve.start();
      expect(res.port).to.equal(DEFAULT_PORTS.apphosting + 2);
    });
  });

  describe("start", () => {
    it("should only select an available port to serve", async () => {
      checkListenableStub.onFirstCall().returns(false);
      checkListenableStub.onSecondCall().returns(false);
      checkListenableStub.onThirdCall().returns(true);

      const res = await serve.start();
      expect(res.port).to.equal(DEFAULT_PORTS.apphosting + 2);
    });
  });
});
