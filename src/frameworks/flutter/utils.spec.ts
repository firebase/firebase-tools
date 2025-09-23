import { expect } from "chai";
import * as sinon from "sinon";
import { EventEmitter } from "events";
import { Writable } from "stream";
import * as crossSpawn from "cross-spawn";
import { assertFlutterCliExists, getAdditionalBuildArgs, getPubSpec } from "./utils";
import * as fs from "fs/promises";
import * as path from "path";
import * as fsExtra from "fs-extra";

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

  describe("getAdditionalBuildArgs", () => {
    it("should return '--no-tree-shake-icons' when a tree-shake package is present", () => {
      const pubSpec = {
        dependencies: {
          material_icons_named: "^1.0.0",
        },
      };
      expect(getAdditionalBuildArgs(pubSpec)).to.deep.equal(["--no-tree-shake-icons"]);
    });

    it("should return an empty array when no tree-shake package is present", () => {
      const pubSpec = {
        dependencies: {
          some_other_package: "^1.0.0",
        },
      };
      expect(getAdditionalBuildArgs(pubSpec)).to.deep.equal([]);
    });

    it("should return an empty array when dependencies is undefined", () => {
      const pubSpec = {};
      expect(getAdditionalBuildArgs(pubSpec)).to.deep.equal([]);
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

    it("should read and parse pubspec.yaml file when both pubspec.yaml and web directory exist", async () => {
      const mockYamlContent = "dependencies:\n  flutter:\n    sdk: flutter\n  some_package: ^1.0.0";
      const expectedParsedYaml = {
        dependencies: {
          flutter: { sdk: "flutter" },
          some_package: "^1.0.0",
        },
      };

      sandbox.stub(fsExtra, "pathExists").resolves(true);
      sandbox.stub(fs, "readFile").resolves(Buffer.from(mockYamlContent));
      sandbox.stub(path, "join").callsFake((...args) => args.join("/"));

      const result = await getPubSpec("/path");
      expect(result).to.deep.equal(expectedParsedYaml);
    });

    it("should return an empty object if pubspec.yaml doesn't exist", async () => {
      const pathExistsStub = sandbox.stub(fsExtra, "pathExists");
      pathExistsStub.withArgs("/path/pubspec.yaml", () => null).resolves(false);

      const result = await getPubSpec("/path");
      expect(result).to.deep.equal({});
    });

    it("should return an empty object if web directory doesn't exist", async () => {
      const pathExistsStub = sandbox.stub(fsExtra, "pathExists");
      pathExistsStub.withArgs("/path/pubspec.yaml", () => null).resolves(true);
      pathExistsStub.withArgs("/path/web", () => null).resolves(false);

      const result = await getPubSpec("/path");
      expect(result).to.deep.equal({});
    });

    it("should return an empty object and log a message if there's an error reading pubspec.yaml", async () => {
      sandbox.stub(fsExtra, "pathExists").resolves(true);
      sandbox.stub(fs, "readFile").rejects(new Error("File read error"));
      sandbox.stub(path, "join").callsFake((...args) => args.join("/"));
      const consoleInfoStub = sandbox.stub(console, "info");

      const result = await getPubSpec("/path");
      expect(result).to.deep.equal({});
      expect(consoleInfoStub.calledOnceWith("Failed to read pubspec.yaml")).to.be.true;
    });
  });
});
