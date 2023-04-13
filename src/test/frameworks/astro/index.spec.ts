import { expect } from "chai";
import * as sinon from "sinon";
import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";
import { Readable, Writable } from "stream";
import * as crossSpawn from "cross-spawn";
import * as fsExtra from "fs-extra";

import * as frameworksFunctions from "../../../frameworks";
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
          })
        );
      sandbox
        .stub(frameworksFunctions, "findDependency")
        .withArgs("astro", { cwd, depth: 0, omitDev: false })
        .returns({
          version: "2.2.2",
          resolved: "https://registry.npmjs.org/astro/-/astro-2.2.2.tgz",
          overridden: false,
        });
      expect(await discover(cwd)).to.deep.equal({
        mayWantBackend: false,
        publicDirectory: publicDir,
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
          })
        );
      sandbox
        .stub(frameworksFunctions, "findDependency")
        .withArgs("astro", { cwd, depth: 0, omitDev: false })
        .returns({
          version: "2.2.2",
          resolved: "https://registry.npmjs.org/astro/-/astro-2.2.2.tgz",
          overridden: false,
        });
      expect(await discover(cwd)).to.deep.equal({
        mayWantBackend: true,
        publicDirectory: publicDir,
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
          })
        );

      const copy = sandbox.stub(fsExtra, "copy");

      await ɵcodegenPublicDirectory(root, dist);
      expect(copy.getCalls().map((it) => it.args)).to.deep.equal([[join(root, outDir), dist]]);
    });

    it("should copy over an Astro SSR app", async () => {
      const root = Math.random().toString(36).split(".")[1];
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
          })
        );

      const copy = sandbox.stub(fsExtra, "copy");

      await ɵcodegenPublicDirectory(root, dist);
      expect(copy.getCalls().map((it) => it.args)).to.deep.equal([
        [join(root, outDir, "client"), dist],
      ]);
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
          })
        );
      sandbox
        .stub(frameworkUtils, "readJSON")
        .withArgs(join(root, "package.json"))
        .returns(Promise.resolve(packageJson));

      const copy = sandbox.stub(fsExtra, "copy");
      const bootstrapScript = astroUtils.getBootstrapScript();
      expect(await ɵcodegenFunctionsDirectory(root, dist)).to.deep.equal({
        packageJson,
        bootstrapScript,
      });
      expect(copy.getCalls().map((it) => it.args)).to.deep.equal([
        [join(root, outDir, "server"), dist],
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
      const process = new EventEmitter() as ChildProcess;
      process.stdin = new Writable();
      process.stdout = new EventEmitter() as Readable;
      process.stderr = new EventEmitter() as Readable;

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
          })
        );

      const cli = Math.random().toString(36).split(".")[1];
      sandbox.stub(frameworksFunctions, "getNodeModuleBin").withArgs("astro", cwd).returns(cli);
      sandbox.stub(crossSpawn, "spawn").withArgs(cli, ["build"], { cwd }).returns(process);

      const result = build(cwd);

      process.emit("close");

      expect(await result).to.deep.equal({
        wantsBackend: true,
      });
    });

    it("should fail to build an Astro SSR app w/wrong adapter", async () => {
      const process = new EventEmitter() as ChildProcess;
      process.stdin = new Writable();
      process.stdout = new EventEmitter() as Readable;
      process.stderr = new EventEmitter() as Readable;

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
              name: "EPIC FAIL",
              hooks: {},
            },
          })
        );

      const cli = Math.random().toString(36).split(".")[1];
      sandbox.stub(frameworksFunctions, "getNodeModuleBin").withArgs("astro", cwd).returns(cli);
      sandbox.stub(crossSpawn, "spawn").withArgs(cli, ["build"], { cwd }).returns(process);

      await expect(build(cwd)).to.eventually.rejectedWith(
        FirebaseError,
        "Deploying an Astro application with SSR on Firebase Hosting requires the @astrojs/node adapter."
      );
    });

    it("should build an Astro static app", async () => {
      const process = new EventEmitter() as ChildProcess;
      process.stdin = new Writable();
      process.stdout = new EventEmitter() as Readable;
      process.stderr = new EventEmitter() as Readable;

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
          })
        );

      const cli = Math.random().toString(36).split(".")[1];
      sandbox.stub(frameworksFunctions, "getNodeModuleBin").withArgs("astro", cwd).returns(cli);
      sandbox.stub(crossSpawn, "spawn").withArgs(cli, ["build"], { cwd }).returns(process);

      const result = build(cwd);

      process.emit("close");

      expect(await result).to.deep.equal({
        wantsBackend: false,
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
      const process = new EventEmitter() as ChildProcess;
      process.stdin = new Writable();
      process.stdout = new EventEmitter() as Readable;
      process.stderr = new EventEmitter() as Readable;

      const cli = Math.random().toString(36).split(".")[1];
      sandbox.stub(frameworksFunctions, "getNodeModuleBin").withArgs("astro", ".").returns(cli);
      sandbox.stub(crossSpawn, "spawn").withArgs(cli, ["dev"], { cwd: "." }).returns(process);

      const devModeHandle = getDevModeHandle(".");

      process.stdout.emit(
        "data",
        `  🚀  astro  v2.2.2 started in 64ms
  
  ┃ Local    http://localhost:3000/
  ┃ Network  use --host to expose
  
`
      );

      await expect(devModeHandle).eventually.be.fulfilled;
    });
  });
});
