import { expect } from "chai";
import * as sinon from "sinon";
import { EventEmitter } from "events";
import { Writable } from "stream";
import * as crossSpawn from "cross-spawn";
import { assertFlutterCliExists, getTreeShakeFlag, getPubSpec } from "./utils";
import * as fs from "fs/promises";
import * as path from "path";

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
    it("should return '--no-tree-shake-icons' when a tree-shake package is present", () => {
      const pubSpec = {
        dependencies: {
          material_icons_named: "^1.0.0",
        },
      };
      expect(getTreeShakeFlag(pubSpec)).to.equal("--no-tree-shake-icons");
    });

    it("should return an empty string when no tree-shake package is present", () => {
      const pubSpec = {
        dependencies: {
          some_other_package: "^1.0.0",
        },
      };
      expect(getTreeShakeFlag(pubSpec)).to.equal("");
    });

    it("should return an empty string when dependencies is undefined", () => {
      const pubSpec = {};
      expect(getTreeShakeFlag(pubSpec)).to.equal("");
    });
  });

  describe("getPubSpec", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should read and parse pubspec.yaml file", async () => {
      const mockYamlContent = "dependencies:\n  flutter:\n    sdk: flutter\n  some_package: ^1.0.0";
      const expectedParsedYaml = {
        dependencies: {
          flutter: { sdk: "flutter" },
          some_package: "^1.0.0",
        },
      };

      sandbox.stub(fs, "readFile").resolves(Buffer.from(mockYamlContent));
      sandbox.stub(path, "join").returns("/path/pubspec.yaml");

      const result = await getPubSpec("/path");
      expect(result).to.deep.equal(expectedParsedYaml);
    });

    it("should return an empty object if pubspec.yaml is not found", async () => {
      sandbox.stub(fs, "readFile").rejects(new Error("File not found"));
      sandbox.stub(console, "info").returns(); // Suppress console output

      const result = await getPubSpec("/path");
      expect(result).to.deep.equal({});
    });
  });
});
