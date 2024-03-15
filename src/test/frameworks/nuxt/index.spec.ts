import { expect } from "chai";
import * as sinon from "sinon";
import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";
import { Readable, Writable } from "stream";
import * as fsExtra from "fs-extra";
import * as crossSpawn from "cross-spawn";

import * as frameworksUtils from "../../../frameworks/utils";
import { discover as discoverNuxt2 } from "../../../frameworks/nuxt2";
import { discover as discoverNuxt3, getDevModeHandle } from "../../../frameworks/nuxt";
import type { NuxtOptions } from "../../../frameworks/nuxt/interfaces";

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
      sandbox.stub(frameworksUtils, "findDependency").returns({
        version: "2.15.8",
        resolved: "https://registry.npmjs.org/nuxt/-/nuxt-2.15.8.tgz",
        overridden: false,
      });
      sandbox
        .stub(frameworksUtils, "relativeRequire")
        .withArgs(discoverNuxtDir, "nuxt/dist/nuxt.js" as any)
        .resolves({
          loadNuxt: () =>
            Promise.resolve({
              ready: () => Promise.resolve(),
              options: { dir: { static: "static" } },
            }),
        });

      expect(await discoverNuxt2(discoverNuxtDir)).to.deep.equal({
        mayWantBackend: true,
        version: "2.15.8",
      });
    });

    it("should find a Nuxt 3 app", async () => {
      sandbox.stub(fsExtra, "pathExists").resolves(true);
      sandbox.stub(frameworksUtils, "findDependency").returns({
        version: "3.0.0",
        resolved: "https://registry.npmjs.org/nuxt/-/nuxt-3.0.0.tgz",
        overridden: false,
      });
      sandbox
        .stub(frameworksUtils, "relativeRequire")
        .withArgs(discoverNuxtDir, "@nuxt/kit")
        .resolves({
          loadNuxtConfig: async function (): Promise<NuxtOptions> {
            return Promise.resolve({
              ssr: true,
              app: {
                baseURL: "/",
              },
              dir: {
                public: "public",
              },
            });
          },
        });

      expect(await discoverNuxt3(discoverNuxtDir)).to.deep.equal({
        mayWantBackend: true,
        version: "3.0.0",
      });
    });
  });

  describe("getDevModeHandle", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should resolve with initial Nuxt 3 dev server output", async () => {
      const process = new EventEmitter() as ChildProcess;
      process.stdin = new Writable();
      process.stdout = new EventEmitter() as Readable;
      process.stderr = new EventEmitter() as Readable;

      const cli = Math.random().toString(36).split(".")[1];
      sandbox.stub(frameworksUtils, "getNodeModuleBin").withArgs("nuxt", ".").returns(cli);
      sandbox.stub(crossSpawn, "spawn").withArgs(cli, ["dev"], { cwd: "." }).returns(process);

      const devModeHandle = getDevModeHandle(".");

      process.stdout.emit(
        "data",
        `Nuxi 3.0.0

       WARN  Changing NODE_ENV from production to development, to avoid unintended behavior.

      Nuxt 3.0.0 with Nitro 1.0.0

        > Local:    http://localhost:3000/
        > Network:  http://0.0.0.0:3000/
        > Network:  http://[some:ipv6::::::]:3000/
        > Network:  http://[some:other:ipv6:::::]:3000/`,
      );

      await expect(devModeHandle).eventually.be.fulfilled;
    });
  });
});
