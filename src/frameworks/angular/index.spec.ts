import { expect } from "chai";
import * as sinon from "sinon";
import * as fsExtra from "fs-extra";
import { join } from "path";

import * as frameworkUtils from "../utils";
import { discover } from ".";

describe("Angular", () => {
  describe("discovery", () => {
    const cwd = ".";
    let sandbox: sinon.SinonSandbox;
    let pathExistsStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      pathExistsStub = sandbox.stub(fsExtra, "pathExists");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should not discover if package.json is missing", async () => {
      pathExistsStub.resolves(false);
      expect(await discover(cwd)).to.be.undefined;
    });

    it("should not discover if angular.json is missing", async () => {
      pathExistsStub.withArgs(join(cwd, "package.json")).resolves(true);
      pathExistsStub.resolves(false);
      expect(await discover(cwd)).to.be.undefined;
    });

    it("should find an Angular app with SSR", async () => {
      pathExistsStub.resolves(true);
      sandbox.stub(frameworkUtils, "findDependency").callsFake((name) => {
        if (name === "@angular/core") {
          return { version: "17.0.0", resolved: "", overridden: false };
        }
        if (name === "@angular/platform-server") {
          return { version: "17.0.0", resolved: "", overridden: false };
        }
        return undefined;
      });
      expect(await discover(cwd)).to.deep.equal({
        mayWantBackend: true,
        version: "17.0.0",
      });
    });

    it("should find an Angular app without SSR", async () => {
      pathExistsStub.resolves(true);
      sandbox.stub(frameworkUtils, "findDependency").returns(undefined);
      expect(await discover(cwd)).to.deep.equal({
        mayWantBackend: false,
        version: undefined,
      });
    });

    it("should propagate the @angular/core version", async () => {
      pathExistsStub.resolves(true);
      sandbox.stub(frameworkUtils, "findDependency").callsFake((name) => {
        if (name === "@angular/core") {
          return { version: "18.2.1", resolved: "", overridden: false };
        }
        return undefined;
      });
      expect(await discover(cwd)).to.deep.equal({
        mayWantBackend: false,
        version: "18.2.1",
      });
    });
  });
});
