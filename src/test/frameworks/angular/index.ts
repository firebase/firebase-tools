import { expect } from "chai";
import * as sinon from "sinon";
import * as fsExtra from "fs-extra";

import * as angularUtils from "../../../frameworks/angular/utils";
import { discover } from "../../../frameworks/angular";
import { join } from "path";

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

    it("should find a static Angular app", async () => {
      sandbox.stub(fsExtra, "pathExists").resolves(true);
      sandbox
        .stub(angularUtils, "getContext")
        .withArgs(cwd)
        .resolves({
          serverTarget: undefined,
        } as any);
      expect(await discover(cwd)).to.deep.equal({
        mayWantBackend: false,
        publicDirectory: join(cwd, "src", "assets"),
      });
    });

    it("should find an Angular Universal app", async () => {
      sandbox.stub(fsExtra, "pathExists").resolves(true);
      sandbox
        .stub(angularUtils, "getContext")
        .withArgs(cwd)
        .resolves({
          serverTarget: true,
        } as any);
      expect(await discover(cwd)).to.deep.equal({
        mayWantBackend: true,
        publicDirectory: join(cwd, "src", "assets"),
      });
    });
  });
});
