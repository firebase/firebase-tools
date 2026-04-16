import { expect } from "chai";
import * as sinon from "sinon";
import * as fsExtra from "fs-extra";

import * as frameworkUtils from "../utils";
import { discover } from ".";

describe("Angular", () => {
  describe("discovery", () => {
    const cwd = Math.random().toString(36).split(".")[1];
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should find an Angular app with SSR", async () => {
      sandbox.stub(fsExtra, "pathExists").resolves(true);
      sandbox.stub(frameworkUtils, "findDependency").callsFake((name) => {
        if (name === "@angular/platform-server") {
          return { version: "17.0.0", resolved: "", overridden: false };
        }
        return undefined;
      });
      expect(await discover(cwd)).to.deep.equal({
        mayWantBackend: true,
        version: undefined,
      });
    });

    it("should find an Angular app without SSR", async () => {
      sandbox.stub(fsExtra, "pathExists").resolves(true);
      sandbox.stub(frameworkUtils, "findDependency").returns(undefined);
      expect(await discover(cwd)).to.deep.equal({
        mayWantBackend: false,
        version: undefined,
      });
    });
  });
});
