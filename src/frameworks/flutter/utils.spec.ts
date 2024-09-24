import { expect } from "chai";
import * as sinon from "sinon";
import { EventEmitter } from "events";
import { Writable } from "stream";
import * as crossSpawn from "cross-spawn";
import * as yaml from "yaml";
import { assertFlutterCliExists, getTreeShakeFlag } from "./utils";
import * as fs from "fs";

describe("Flutter utils", () => {
  describe("assertFlutterCliExists", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should return void, if !status", () => {
      const process = new EventEmitter() as any;
      process.stdin = new Writable();
      process.stdout = new EventEmitter();
      process.stderr = new EventEmitter();
      process.status = 0;

      const stub = sandbox.stub(crossSpawn, "sync").returns(process);

      expect(assertFlutterCliExists()).to.be.undefined;
      sinon.assert.calledWith(stub, "flutter", ["--version"], { stdio: "ignore" });
    });
  });

  describe("getTreeShakeFlag", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should return '--no-tree-shake-icons' if a tree shake package is found", async () => {
      const pubSpecContent = `
        dependencies:
          material_icons_named: any
      `;
      const readFileStub = sandbox.stub(fs, "readFile").resolves(Buffer.from(pubSpecContent));
      const yamlParseStub = sandbox.stub(yaml, "parse").returns({
        dependencies: {
          material_icons_named: "any",
        },
      });

      const result = await getTreeShakeFlag();
      expect(result).to.equal("--no-tree-shake-icons");
      sinon.assert.calledOnce(readFileStub);
      sinon.assert.calledOnce(yamlParseStub);
    });

    it("should return an empty string if no tree shake package is found", async () => {
      const pubSpecContent = `
        dependencies:
          some_other_package: any
      `;
      const readFileStub = sandbox.stub(fs, "readFile").resolves(Buffer.from(pubSpecContent));
      const yamlParseStub = sandbox.stub(yaml, "parse").returns({
        dependencies: {
          some_other_package: "any",
        },
      });

      const result = await getTreeShakeFlag();
      expect(result).to.equal("");
      sinon.assert.calledOnce(readFileStub);
      sinon.assert.calledOnce(yamlParseStub);
    });
  });
});
