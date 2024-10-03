import * as fs from "fs-extra";
import * as sinon from "sinon";
import { discoverPackageManager } from "./utils";
import { expect } from "chai";

describe("utils", () => {
  let pathExistsStub: sinon.SinonStub;

  beforeEach(() => {
    pathExistsStub = sinon.stub(fs, "pathExists");
  });

  afterEach(() => {
    pathExistsStub.restore();
  });

  describe("discoverPackageManager", () => {
    it("returns npm if package-lock.json file fond", async () => {
      pathExistsStub.callsFake((...args) => {
        if (args[0] === "package-lock.json") {
          return true;
        }

        return false;
      });

      expect(await discoverPackageManager("./")).to.equal("npm");
    });

    it("returns pnpm if pnpm-lock.json file fond", async () => {
      pathExistsStub.callsFake((...args) => {
        if (args[0] === "pnpm-lock.yaml") {
          return true;
        }

        return false;
      });

      expect(await discoverPackageManager("./")).to.equal("pnpm");
    });
  });

  it("returns yarn if yarn.lock file fond", async () => {
    pathExistsStub.callsFake((...args) => {
      if (args[0] === "yarn.lock") {
        return true;
      }

      return false;
    });

    expect(await discoverPackageManager("./")).to.equal("yarn");
  });
});
