import { expect } from "chai";
import * as sinon from "sinon";
import * as fsExtra from "fs-extra";

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

    it("should find an Angular app", async () => {
      sandbox.stub(fsExtra, "pathExists").resolves(true);
      expect(await discover(cwd)).to.deep.equal({
        mayWantBackend: true,
        version: undefined,
      });
    });
  });
});
