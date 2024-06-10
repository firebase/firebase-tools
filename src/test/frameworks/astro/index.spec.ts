import { expect } from "chai";
import * as chai from "chai";
import * as sinon from "sinon";
import { EventEmitter } from "events";
import { Writable } from "stream";
import * as crossSpawn from "cross-spawn";
import * as fsExtra from "fs-extra";

import * as astroUtils from "../../../frameworks/astro/utils";
import * as frameworkUtils from "../../../frameworks/utils";
import {
  discover,
  getDevModeHandle,
  build,
  ɵcodegenPublicDirectory,
  ɵcodegenFunctionsDirectory,
} from "../../../frameworks/astro";
import { FirebaseError } from "../../../error";
import { join } from "path";

chai.use(require("chai-as-promised"));
describe("Astro", () => {
  describe("discovery", () => {
    const cwd = ".";
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should find a static Astro app", async () => {
      const publicDir = Math.random().toString(36).split(".")[1];
      sandbox
        .stub(astroUtils, "getConfig")
        .withArgs(cwd)
        .returns(
          Promise.resolve({
            outDir: "dist",
            publicDir,
            output: "static",
            adapter: undefined,
          }),
        );
      sandbox
        .stub(frameworkUtils, "findDependency")
        .withArgs("astro", { cwd, depth: 0, omitDev: false })
        .returns({
          version: "2.2.2",
          resolved: "https://registry.npmjs.org/astro/-/astro-2.2.2.tgz",
          overridden: false,
        });
      expect(await discover(cwd)).to.deep.equal({
        mayWantBackend: false,
        version: "2.2.2",
      });
    });

    it("should find an Astro SSR app", async () => {
      const publicDir = Math.random().toString(36).split(".")[1];
      sandbox
        .stub(astroUtils, "getConfig")
        .withArgs(cwd)
        .returns(
          Promise.resolve({
            outDir: "dist",
            publicDir,
            output: "server",
            adapter: {
              name: "@astrojs/node",
              hooks: {},
            },
          }),
        );
      sandbox
        .stub(frameworkUtils, "findDependency")
        .withArgs("astro", { cwd, depth: 0, omitDev: false })
        .returns({
          version: "2.2.2",
          resolved: "https://registry.npmjs.org/astro/-/astro-2.2.2.tgz",
          overridden: false,
        });
      expect(await discover(cwd)).to.deep.equal({
        mayWantBackend: true,
        version: "2.2.2",
      });
    });
  });

  describe("ɵcodegenPublicDirectory", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should copy over a static Astro app", async () => {
      const root = Math.random().toString(36).split(".")[1];
      const staticAssets = Math.random().toString(36).split(".")[1];
      const dist = Math.random().toString(36).split(".")[1];
      const outDir = Math.random().toString(36).split(".")[1];
      sandbox
        .stub(astroUtils, "getConfig")
        .withArgs(root)
        .returns(
          Promise.resolve({
            outDir,
            publicDir: "xxx",
            output: "static",
            adapter: undefined,
          }),
        );
      sandbox
        .stub(frameworkUtils, "getBundleConfigs")
        .withArgs(root)
        .returns(Promise.resolve({ staticAssets: [staticAssets] }));

      const copy = sandbox.stub(fsExtra, "copy");

      await ɵcodegenPublicDirectory(root, dist);
      expect(copy.getCalls().map((it) => it.args)).to.deep.equal([[staticAssets, dist]]);
    });

    it("should copy over an Astro SSR app", async () => {
      const root = Math.random().toString(36).split(".")[1];
      const staticAssets = Math.random().toString(36).split(".")[1];
      const dist = Math.random().toString(36).split(".")[1];
      const outDir = Math.random().toString(36).split(".")[1];
      sandbox
        .stub(astroUtils, "getConfig")
        .withArgs(root)
        .returns(
          Promise.resolve({
            outDir,
            publicDir: "xxx",
            output: "server",
            adapter: {
              name: "@astrojs/node",
              hooks: {},
            },
          }),
        );
      sandbox
        .stub(frameworkUtils, "getBundleConfigs")
        .withArgs(root)
        .returns(Promise.resolve({ staticAssets: [staticAssets], serverDirectory: "dir" }));

      const copy = sandbox.stub(fsExtra, "copy");

      await ɵcodegenPublicDirectory(root, dist);
      expect(copy.getCalls().map((it) => it.args)).to.deep.equal([[staticAssets, dist]]);
    });
  });

  describe("ɵcodegenFunctionsDirectory", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should copy over the cloud function", async () => {
      const root = Math.random().toString(36).split(".")[1];
      const dist = Math.random().toString(36).split(".")[1];
      const outDir = Math.random().toString(36).split(".")[1];
      const serverAssets = Math.random().toString(36).split(".")[1];
      const packageJson = { a: Math.random().toString(36).split(".")[1] };
      sandbox
        .stub(astroUtils, "getConfig")
        .withArgs(root)
        .returns(
          Promise.resolve({
            outDir,
            publicDir: "xxx",
            output: "server",
            adapter: {
              name: "@astrojs/node",
              hooks: {},
            },
          }),
        );
      sandbox
        .stub(frameworkUtils, "readJSON")
        .withArgs(join(root, "package.json"))
        .returns(Promise.resolve(packageJson));
      sandbox
        .stub(frameworkUtils, "getBundleConfigs")
        .withArgs(root)
        .returns(Promise.resolve({ staticAssets: [], serverDirectory: serverAssets }));
      const copy = sandbox.stub(fsExtra, "copy");
      const bootstrapScript = astroUtils.getBootstrapScript();
      expect(await ɵcodegenFunctionsDirectory(root, dist)).to.deep.equal({
        packageJson,
        bootstrapScript,
      });
      expect(copy.getCalls().map((it) => it.args)).to.deep.equal([
        [join(root, serverAssets), dist],
      ]);
    });
  });

  describe("build", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should build an Astro SSR app", async () => {
      const process = new EventEmitter() as any;
      process.stdin = new Writable();
      process.stdout = new EventEmitter();
      process.stderr = new EventEmitter();
      process.status = 0;
      const serverAssets = Math.random().toString(36).split(".")[1];
      const cwd = ".";
      const publicDir = Math.random().toString(36).split(".")[1];
      sandbox
        .stub(astroUtils, "getConfig")
        .withArgs(cwd)
        .returns(
          Promise.resolve({
            outDir: "dist",
            publicDir,
            output: "server",
            adapter: {
              name: "@astrojs/node",
              hooks: {},
            },
          }),
        );
      sandbox
        .stub(frameworkUtils, "getBundleConfigs")
        .withArgs(cwd)
        .returns(Promise.resolve({ staticAssets: [], serverDirectory: serverAssets }));

      const cli = Math.random().toString(36).split(".")[1];
      sandbox.stub(frameworkUtils, "getNodeModuleBin").withArgs("astro", cwd).returns(cli);
      const stub = sandbox.stub(crossSpawn, "sync").returns(process);

      const result = build(cwd);

      process.emit("close");

      expect(await result).to.deep.equal({
        wantsBackend: true,
      });
      sinon.assert.calledWith(stub, "npx", ["@apphosting/adapter-astro"], {
        cwd,
        stdio: "inherit",
      });
    });

    it("should fail to build an Astro SSR app w/wrong adapter", async () => {
      const cwd = ".";
      const publicDir = Math.random().toString(36).split(".")[1];
      const serverAssets = Math.random().toString(36).split(".")[1];
      sandbox
        .stub(astroUtils, "getConfig")
        .withArgs(cwd)
        .returns(
          Promise.resolve({
            outDir: "dist",
            publicDir,
            output: "server",
            adapter: {
              name: "EPIC FAIL",
              hooks: {},
            },
          }),
        );
      sandbox
        .stub(frameworkUtils, "getBundleConfigs")
        .withArgs(cwd)
        .returns(Promise.resolve({ staticAssets: [], serverDirectory: serverAssets }));

      const cli = Math.random().toString(36).split(".")[1];
      sandbox.stub(frameworkUtils, "getNodeModuleBin").withArgs("astro", cwd).returns(cli);
      await expect(build(cwd)).to.be.rejectedWith(FirebaseError, "Unable to build your Astro app");
      // try {
      //   expect(await build(cwd)).to.throw(FirebaseError);
      // } catch (error) {
      //   expect(error).to(FirebaseError);
      // }
    });

    it("should build an Astro static app", async () => {
      const process = new EventEmitter() as any;
      process.stdin = new Writable();
      process.stdout = new EventEmitter();
      process.stderr = new EventEmitter();
      process.status = 0;

      const cwd = ".";
      const publicDir = Math.random().toString(36).split(".")[1];
      sandbox
        .stub(astroUtils, "getConfig")
        .withArgs(cwd)
        .returns(
          Promise.resolve({
            outDir: "dist",
            publicDir,
            output: "static",
            adapter: undefined,
          }),
        );
      sandbox
        .stub(frameworkUtils, "getBundleConfigs")
        .withArgs(cwd)
        .returns(Promise.resolve({ staticAssets: [] }));
      const cli = Math.random().toString(36).split(".")[1];
      sandbox.stub(frameworkUtils, "getNodeModuleBin").withArgs("astro", cwd).returns(cli);
      const stub = sandbox.stub(crossSpawn, "sync").returns(process);

      const result = build(cwd);

      process.emit("close");

      expect(await result).to.deep.equal({
        wantsBackend: false,
      });
      sinon.assert.calledWith(stub, "npx", ["@apphosting/adapter-astro"], {
        cwd,
        stdio: "inherit",
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

    it("should resolve with dev server output", async () => {
      const process = new EventEmitter() as any;
      process.stdin = new Writable();
      process.stdout = new EventEmitter();
      process.stderr = new EventEmitter();
      process.status = 0;

      const cli = Math.random().toString(36).split(".")[1];
      sandbox.stub(frameworkUtils, "getNodeModuleBin").withArgs("astro", ".").returns(cli);
      const stub = sandbox.stub(crossSpawn, "spawn").returns(process);

      const devModeHandle = getDevModeHandle(".");

      process.stdout.emit(
        "data",
        `  🚀  astro  v2.2.2 started in 64ms
  
  ┃ Local    http://localhost:3000/
  ┃ Network  use --host to expose
  
`,
      );

      await expect(devModeHandle).eventually.be.fulfilled;
      sinon.assert.calledWith(stub, cli, ["dev"], { cwd: "." });
    });
  });
});
