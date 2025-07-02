import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as tmp from "tmp";
import fetch from "node-fetch";

import { prepareRemoteSource } from "./remoteSource";
import { FirebaseError } from "../../error";
import * as unzip from "../../unzip";

describe("remoteSource", () => {
  let sandbox: sinon.SinonSandbox;
  let fetchStub: sinon.SinonStub;
  let unzipStub: sinon.SinonStub;
  let tmpDirStub: sinon.SinonStub;
  let tmpFileStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    fetchStub = sandbox.stub();
    unzipStub = sandbox.stub(unzip, "unzip");
    tmpDirStub = sandbox.stub(tmp, "dirSync");
    tmpFileStub = sandbox.stub(tmp, "fileSync");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("prepareRemoteSource", () => {
    it("should successfully download and extract a remote source with valid functions.yaml", async () => {
      const mockTmpDir = { name: "/tmp/firebase-functions-test-123" };
      const mockTmpFile = { name: "/tmp/firebase-functions-test-123.zip" };
      const mockExtractedDir = "/tmp/firebase-functions-test-123/repo-main";

      tmpDirStub.returns(mockTmpDir);
      tmpFileStub.returns(mockTmpFile);

      // Mock successful download
      const mockResponse = {
        ok: true,
        body: {
          pipe: sandbox.stub().returns({
            on: sandbox.stub().callsArgWith(1, null)
          })
        }
      };
      
      // Replace the module's fetch with our stub
      (global as any).fetch = fetchStub;
      fetchStub.resolves(mockResponse);

      // Mock successful extraction
      unzipStub.resolves();

      // Mock directory listing after extraction
      const readdirStub = sandbox.stub(fs, "readdirSync");
      readdirStub.withArgs(mockTmpDir.name).returns(["repo-main"] as any);
      
      sandbox.stub(fs, "statSync").returns({ isDirectory: () => true } as any);
      sandbox.stub(fs, "createWriteStream").returns({
        on: sandbox.stub().callsArgWith(1, null)
      } as any);
      sandbox.stub(fs, "unlinkSync");
      
      // Mock functions.yaml validation
      const existsSyncStub = sandbox.stub(fs, "existsSync");
      existsSyncStub.withArgs(`${mockExtractedDir}/functions.yaml`).returns(true);
      
      const readFileSyncStub = sandbox.stub(fs, "readFileSync");
      readFileSyncStub.withArgs(`${mockExtractedDir}/functions.yaml`, "utf8").returns("specVersion: v1");

      const result = await prepareRemoteSource(
        { repo: "https://github.com/test/repo", ref: "main" },
        "test-codebase",
        "/project/root"
      );

      expect(result.sourceDir).to.equal(mockExtractedDir);
      expect(result.projectRoot).to.equal("/project/root");
      expect(fetchStub).to.have.been.calledOnce;
      expect(unzipStub).to.have.been.calledWith(mockTmpFile.name, mockTmpDir.name);
    });

    it("should fail if remote source lacks functions.yaml", async () => {
      const mockTmpDir = { name: "/tmp/firebase-functions-test-123" };
      const mockTmpFile = { name: "/tmp/firebase-functions-test-123.zip" };
      const mockExtractedDir = "/tmp/firebase-functions-test-123/repo-main";

      tmpDirStub.returns(mockTmpDir);
      tmpFileStub.returns(mockTmpFile);

      // Mock successful download
      const mockResponse = {
        ok: true,
        body: {
          pipe: sandbox.stub().returns({
            on: sandbox.stub().callsArgWith(1, null)
          })
        }
      };
      
      (global as any).fetch = fetchStub;
      fetchStub.resolves(mockResponse);

      // Mock successful extraction
      unzipStub.resolves();

      // Mock directory listing after extraction
      const readdirStub = sandbox.stub(fs, "readdirSync");
      readdirStub.withArgs(mockTmpDir.name).returns(["repo-main"] as any);
      
      sandbox.stub(fs, "statSync").returns({ isDirectory: () => true } as any);
      sandbox.stub(fs, "createWriteStream").returns({
        on: sandbox.stub().callsArgWith(1, null)
      } as any);
      sandbox.stub(fs, "unlinkSync");
      
      // Mock missing functions.yaml
      const existsSyncStub = sandbox.stub(fs, "existsSync");
      existsSyncStub.withArgs(`${mockExtractedDir}/functions.yaml`).returns(false);

      await expect(
        prepareRemoteSource(
          { repo: "https://github.com/test/repo", ref: "main" },
          "test-codebase"
        )
      ).to.be.rejectedWith(FirebaseError, /does not contain functions.yaml/);
    });

    it("should handle 404 errors gracefully", async () => {
      tmpDirStub.returns({ name: "/tmp/firebase-functions-test-123" });
      tmpFileStub.returns({ name: "/tmp/firebase-functions-test-123.zip" });

      const mockResponse = {
        ok: false,
        status: 404,
        statusText: "Not Found"
      };

      (global as any).fetch = fetchStub;
      fetchStub.resolves(mockResponse);

      sandbox.stub(fs, "unlinkSync");

      await expect(
        prepareRemoteSource(
          { repo: "https://github.com/test/nonexistent", ref: "main" },
          "test-codebase"
        )
      ).to.be.rejectedWith(FirebaseError, /Repository or ref not found/);
    });

    it("should construct correct GitHub archive URLs", async () => {
      const mockTmpDir = { name: "/tmp/firebase-functions-test-123" };
      const mockTmpFile = { name: "/tmp/firebase-functions-test-123.zip" };

      tmpDirStub.returns(mockTmpDir);
      tmpFileStub.returns(mockTmpFile);

      const mockResponse = {
        ok: true,
        body: {
          pipe: sandbox.stub().returns({
            on: sandbox.stub().callsArgWith(1, null)
          })
        }
      };

      (global as any).fetch = fetchStub;
      fetchStub.resolves(mockResponse);
      unzipStub.resolves();

      const readdirStub = sandbox.stub(fs, "readdirSync");
      readdirStub.withArgs(mockTmpDir.name).returns(["repo-main"] as any);
      
      sandbox.stub(fs, "statSync").returns({ isDirectory: () => true } as any);
      sandbox.stub(fs, "createWriteStream").returns({
        on: sandbox.stub().callsArgWith(1, null)
      } as any);
      sandbox.stub(fs, "unlinkSync");
      
      // Mock functions.yaml validation for the correct paths
      const existsSyncStub = sandbox.stub(fs, "existsSync");
      const readFileSyncStub = sandbox.stub(fs, "readFileSync");

      // Mock functions.yaml exists
      existsSyncStub.returns(true);
      readFileSyncStub.returns("specVersion: v1");

      // Test branch ref
      await prepareRemoteSource(
        { repo: "https://github.com/test/repo", ref: "main" },
        "test-codebase"
      );
      expect(fetchStub.firstCall.args[0]).to.equal(
        "https://github.com/test/repo/archive/refs/heads/main.zip"
      );

      // Test commit SHA
      fetchStub.reset();
      await prepareRemoteSource(
        { repo: "https://github.com/test/repo", ref: "abc123def456abc123def456abc123def456abc1" },
        "test-codebase"
      );
      expect(fetchStub.firstCall.args[0]).to.equal(
        "https://github.com/test/repo/archive/abc123def456abc123def456abc123def456abc1.zip"
      );
    });
  });

});