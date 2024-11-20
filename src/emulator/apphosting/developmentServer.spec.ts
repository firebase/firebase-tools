import * as fs from "fs-extra";
import * as sinon from "sinon";
import { detectPackageManager } from "./developmentServer";
import { expect } from "chai";

describe("utils", () => {
  let pathExistsStub: sinon.SinonStub;

  beforeEach(() => {
    pathExistsStub = sinon.stub(fs, "pathExists");
  });

  afterEach(() => {
    pathExistsStub.restore();
  });

  describe("detectPackageManager", () => {
    it("returns npm if package-lock.json file fond", async () => {
      pathExistsStub.callsFake((...args) => {
        if (args[0] === "package-lock.json") {
          return true;
        }

        return false;
      });

      expect(await detectPackageManager("./")).to.equal("npm");
    });

    it("returns pnpm if pnpm-lock.json file fond", async () => {
      pathExistsStub.callsFake((...args) => {
        if (args[0] === "pnpm-lock.yaml") {
          return true;
        }

        return false;
      });

      expect(await detectPackageManager("./")).to.equal("pnpm");
    });
  });

  it("returns yarn if yarn.lock file fond", async () => {
    pathExistsStub.callsFake((...args) => {
      if (args[0] === "yarn.lock") {
        return true;
      }

      return false;
    });

    expect(await detectPackageManager("./")).to.equal("yarn");
  });
});
