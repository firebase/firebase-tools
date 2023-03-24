import { expect } from "chai";
// import * as fs from "fs";
import * as fsExtra from "fs-extra";
import * as sinon from "sinon";
import * as frameworksFunctions from "../../../frameworks";

import { discover as discoverNuxt2 } from "../../../frameworks/nuxt2";
import { discover as discoverNuxt3 } from "../../../frameworks/nuxt";
import type { NuxtOptions } from "../../../frameworks/nuxt/interfaces";
import { nuxtOptions } from "./helpers";

describe("Nuxt 2 utils", () => {
  describe("nuxtAppDiscovery", () => {
    const discoverNuxtDir = ".";
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

      expect(await discoverNuxt2(discoverNuxtDir)).to.deep.equal({
        mayWantBackend: true,
      });
    });

    it("should find a Nuxt 3 app", async () => {
      sandbox.stub(fsExtra, "pathExists").resolves(true);
      sandbox.stub(frameworksFunctions, "findDependency").returns({
        version: "3.0.0",
        resolved: "https://registry.npmjs.org/nuxt/-/nuxt-3.0.0.tgz",
        overridden: false,
      });
      sandbox
        .stub(frameworksFunctions, "relativeRequire")
        .withArgs(discoverNuxtDir, "@nuxt/kit")
        .resolves({
          loadNuxtConfig: async function (): Promise<NuxtOptions> {
            return Promise.resolve(nuxtOptions);
          },
        });

      expect(await discoverNuxt3(discoverNuxtDir)).to.deep.equal({
        mayWantBackend: true,
        publicDirectory: "public",
      });
    });
  });
});
