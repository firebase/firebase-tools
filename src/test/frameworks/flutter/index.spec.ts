import { expect } from "chai";
import * as sinon from "sinon";
import { EventEmitter } from "events";
import { Writable } from "stream";
import * as crossSpawn from "cross-spawn";
import * as fsExtra from "fs-extra";
import * as fsPromises from "fs/promises";
import { join } from "path";

import * as flutterUtils from "../../../frameworks/flutter/utils";
import { discover, build, ɵcodegenPublicDirectory, init } from "../../../frameworks/flutter";

describe("Flutter", () => {
  describe("discovery", () => {
    const cwd = ".";
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should discover", async () => {
      sandbox.stub(fsExtra, "pathExists" as any).resolves(true);
      sandbox
        .stub(fsPromises, "readFile")
        .withArgs(join(cwd, "pubspec.yaml"))
        .resolves(
          Buffer.from(`dependencies:
  flutter:
    sdk: flutter`),
        );
      expect(await discover(cwd)).to.deep.equal({
        mayWantBackend: false,
      });
    });

    it("should not discover, if missing files", async () => {
      sandbox.stub(fsExtra, "pathExists" as any).resolves(false);
      expect(await discover(cwd)).to.be.undefined;
    });

    it("should not discovery, not flutter", async () => {
      sandbox.stub(fsExtra, "pathExists" as any).resolves(true);
      sandbox
        .stub(fsPromises, "readFile")
        .withArgs(join(cwd, "pubspec.yaml"))
        .resolves(
          Buffer.from(`dependencies:
  foo:
    bar: 1`),
        );
      expect(await discover(cwd)).to.be.undefined;
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

    it("should copy over the web dir", async () => {
      const root = Math.random().toString(36).split(".")[1];
      const dist = Math.random().toString(36).split(".")[1];
      const copy = sandbox.stub(fsExtra, "copy");
      await ɵcodegenPublicDirectory(root, dist);
      expect(copy.getCalls().map((it) => it.args)).to.deep.equal([
        [join(root, "build", "web"), dist],
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

    it("should build", async () => {
      const process = new EventEmitter() as any;
      process.stdin = new Writable();
      process.stdout = new EventEmitter();
      process.stderr = new EventEmitter();
      process.status = 0;

      sandbox.stub(flutterUtils, "assertFlutterCliExists").returns(undefined);

      const cwd = ".";

      const stub = sandbox.stub(crossSpawn, "sync").returns(process as any);

      const result = build(cwd);

      expect(await result).to.deep.equal({
        wantsBackend: false,
      });
      sinon.assert.calledWith(stub, "flutter", ["build", "web"], { cwd, stdio: "inherit" });
    });
  });

  describe("init", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should create a new project", async () => {
      const process = new EventEmitter() as any;
      process.stdin = new Writable();
      process.stdout = new EventEmitter();
      process.stderr = new EventEmitter();
      process.status = 0;

      sandbox.stub(flutterUtils, "assertFlutterCliExists").returns(undefined);

      const projectId = "asdflj-ao9iu4__49";
      const projectName = "asdflj_ao9iu4__49";
      const projectDir = "asfijreou5o";
      const source = "asflijrelijf";

      const stub = sandbox.stub(crossSpawn, "sync").returns(process as any);

      const result = init({ projectId, hosting: { source } }, { projectDir });

      expect(await result).to.eql(undefined);
      sinon.assert.calledWith(
        stub,
        "flutter",
        [
          "create",
          "--template=app",
          `--project-name=${projectName}`,
          "--overwrite",
          "--platforms=web",
          source,
        ],
        { cwd: projectDir, stdio: "inherit" },
      );
    });
  });
});
