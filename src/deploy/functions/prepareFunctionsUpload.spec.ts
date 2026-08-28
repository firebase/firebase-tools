import { expect } from "chai";
import * as sinon from "sinon";
import * as hashModule from "./cache/hash";
import * as archiver from "archiver";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import * as projectConfig from "../../functions/projectConfig";
import * as dynamicImportModule from "../../dynamicImport";
import * as prepareFunctionsUpload from "./prepareFunctionsUpload";

describe("prepareFunctionsUpload", () => {
  describe("convertToSortedKeyValueArray", () => {
    it("should deep sort the resulting array when an input config object is not sorted", () => {
      const config = {
        b: "b",
        a: {
          b: {
            c: "c",
            a: "a",
          },
          a: "a",
        },
      };
      const expected = [
        {
          key: "a",
          value: [
            { key: "a", value: "a" },
            {
              key: "b",
              value: [
                {
                  key: "a",
                  value: "a",
                },
                {
                  key: "c",
                  value: "c",
                },
              ],
            },
          ],
        },
        { key: "b", value: "b" },
      ];
      expect(prepareFunctionsUpload.convertToSortedKeyValueArray(config)).to.deep.equal(expected);
    });
    it("should return null when config input is null", () => {
      expect(prepareFunctionsUpload.convertToSortedKeyValueArray(null)).to.be.equal(null);
    });
    it("should return an empty array when config input is an empty object", () => {
      expect(prepareFunctionsUpload.convertToSortedKeyValueArray({})).to.deep.equal([]);
    });
  });

  describe("packageSource hash generation", () => {
    let tmpDir: string;

    beforeEach(() => {
      // Create a temporary directory with some mock source files
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-tools-test-"));
      fs.writeFileSync(path.join(tmpDir, "index.js"), "console.log('hello world');");
      fs.writeFileSync(path.join(tmpDir, "package.json"), '{"name":"test"}');
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should generate a short SHA1 hash (<= 81 chars) to prevent the 1024-character ObjectName limit error", async () => {
      const config = {
        source: ".",
        codebase: "default",
        ignore: ["node_modules"],
      } as unknown as projectConfig.ValidatedSingle;

      const result = await prepareFunctionsUpload.prepareFunctionsUpload(
        tmpDir, // projectDir
        tmpDir, // sourceDir
        config,
        [], // additionalSources
      );

      expect(result).to.not.be.undefined;
      if (result) {
        expect(result.hash).to.be.a("string");

        // With Merkle Tree hashing, the result should either be a single 40-char SHA1
        // or two 40-char SHA1s joined by a period (81 chars max).
        expect(result.hash.length).to.be.at.most(81);

        // Clean up the archived zip that prepareFunctionsUpload creates
        if (result.pathToSource) {
          fs.rmSync(result.pathToSource, { force: true });
        }
      }
    });
  });

  describe("addFilesToArchive", () => {
    it("should set mode to 0o755 for executable paths", async () => {
      const archive = {
        file: sinon.stub(),
      } as unknown as archiver.Archiver;

      const files = [
        { name: path.join("src", "index.js"), mode: 0o644 },
        { name: path.join("src", "bin", "server"), mode: 0o644 },
      ];

      const getSourceHashStub = sinon.stub(hashModule, "getSourceHash").resolves("hash");

      await prepareFunctionsUpload.addFilesToArchive(archive, files, "src", ["bin/server"]);

      expect((archive.file as sinon.SinonStub).calledTwice).to.be.true;

      expect((archive.file as sinon.SinonStub).firstCall.args[1].name).to.equal("index.js");
      expect((archive.file as sinon.SinonStub).firstCall.args[1].mode).to.equal(0o644);

      expect((archive.file as sinon.SinonStub).secondCall.args[1].name).to.equal("bin/server");
      expect((archive.file as sinon.SinonStub).secondCall.args[1].mode).to.equal(0o755);

      getSourceHashStub.restore();
    });
  });

  describe("isMonorepoSource", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-tools-monorepo-test-"));
      // Detection stops walking up at a VCS root, so this bounds the fixture.
      fs.mkdirSync(path.join(tmpDir, ".git"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function createSourceDir(...segments: string[]): string {
      const dir = path.join(tmpDir, ...segments);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "package.json"), '{"name":"functions"}');
      return dir;
    }

    it("should detect a pnpm workspace root above the source directory", () => {
      fs.writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
      const sourceDir = createSourceDir("packages", "functions");
      expect(prepareFunctionsUpload.isMonorepoSource(sourceDir)).to.be.true;
    });

    it("should detect an npm/yarn/bun workspaces root above the source directory", () => {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        '{"name":"root","workspaces":["packages/*"]}',
      );
      const sourceDir = createSourceDir("packages", "functions");
      expect(prepareFunctionsUpload.isMonorepoSource(sourceDir)).to.be.true;
    });

    it("should detect a Rush workspace root above the source directory", () => {
      fs.writeFileSync(path.join(tmpDir, "rush.json"), "{}");
      const sourceDir = createSourceDir("services", "functions");
      expect(prepareFunctionsUpload.isMonorepoSource(sourceDir)).to.be.true;
    });

    it("should return false for a standalone project so behavior is unchanged", () => {
      fs.writeFileSync(path.join(tmpDir, "package.json"), '{"name":"standalone"}');
      const sourceDir = createSourceDir("functions");
      expect(prepareFunctionsUpload.isMonorepoSource(sourceDir)).to.be.false;
    });
  });

  describe("runIsolate", () => {
    let sandbox: sinon.SinonSandbox;
    let isolateStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      isolateStub = sandbox.stub().resolves("/tmp/isolate-output");
      sandbox.stub(dynamicImportModule, "dynamicImport").resolves({ isolate: isolateStub });
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should target the source directory when deploying from a parent directory", async () => {
      const result = await prepareFunctionsUpload.runIsolate("packages/functions");

      expect(isolateStub).to.be.calledOnceWith({
        targetPackagePath: path.join("./", "packages/functions"),
      });
      expect(result).to.equal("/tmp/isolate-output");
    });

    it("should isolate the current working directory when it is the source directory", async () => {
      const result = await prepareFunctionsUpload.runIsolate(".");

      expect(isolateStub).to.be.calledOnceWith(undefined);
      expect(result).to.equal("/tmp/isolate-output");
    });

    it("should rethrow when isolation fails", async () => {
      isolateStub.rejects(new Error("lockfile not found"));

      await expect(prepareFunctionsUpload.runIsolate(".")).to.be.rejectedWith("lockfile not found");
    });
  });
});
