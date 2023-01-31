import { expect } from "chai";
// import * as fs from "fs";
import * as fsExtra from "fs-extra";
import * as sinon from "sinon";
import * as frameworksFunctions from "../../../frameworks";

import { discover as discoverNuxt2 } from "../../../frameworks/nuxt2";
import { discover as discoverNuxt3 } from "../../../frameworks/nuxt";

describe("Nuxt 2 utils", () => {
  describe("nuxtAppDiscovery", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should find a Nuxt 2 app", async () => {
      sandbox.stub(fsExtra, "pathExists").resolves(true);
      sandbox.stub(frameworksFunctions, "findDependency").returns({
        version: "2.15.8",
        resolved: "https://registry.npmjs.org/nuxt/-/nuxt-2.15.8.tgz",
        overridden: false,
      });

      expect(await discoverNuxt2(".")).to.deep.equal({ mayWantBackend: true });
    });

    it("should find a Nuxt 3 app", async () => {
      sandbox.stub(fsExtra, "pathExists").resolves(true);
      sandbox.stub(frameworksFunctions, "findDependency").returns({
        version: "3.0.0",
        resolved: "https://registry.npmjs.org/nuxt/-/nuxt-3.0.0.tgz",
        overridden: false,
      });

      expect(await discoverNuxt3(".")).to.deep.equal({ mayWantBackend: true });
    });
  });
});
