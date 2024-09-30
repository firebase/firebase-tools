import * as sinon from "sinon";
import * as sp from "cross-spawn";
import { expect } from "chai";
import * as serve from "./serve";

describe("serve", () => {
  let spawnStub: sinon.SinonStub;

  beforeEach(() => {
    spawnStub = sinon.stub(sp, "spawn");
  });

  afterEach(() => {
    spawnStub.restore();
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
});
