import * as sinon from "sinon";
import * as sp from "cross-spawn";
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

  describe("getHostUrlFromString", () => {
    it("retrieves url from NextJS output", () => {
      expect(serve.getHostUrlFromString("   - Local:        http://localhost:3002")).to.equal(
        "http://localhost:3002",
      );
    });

    it("retrieves url from AngularJS output", () => {
      expect(serve.getHostUrlFromString("  ➜  Local:   http://localhost:4200/")).to.equal(
        "http://localhost:4200",
      );
    });

    it("should not match https urls", () => {
      expect(serve.getHostUrlFromString("  ➜  Local:   https://www.google.com")).to.equal(
        undefined,
      );
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
