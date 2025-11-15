import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";

import * as tmp from "tmp";

import { downloadGitHubSource } from "./remoteSource";
import { FirebaseError } from "../../error";
import * as downloadUtils from "../../downloadUtils";
import * as unzipModule from "../../unzip";

describe("remoteSource", () => {
  describe("downloadGitHubSource", () => {
    let existsSyncStub: sinon.SinonStub;
    let readdirSyncStub: sinon.SinonStub;
    let statSyncStub: sinon.SinonStub;
    let downloadToTmpStub: sinon.SinonStub;
    let unzipStub: sinon.SinonStub;

    beforeEach(() => {
      existsSyncStub = sinon.stub(fs, "existsSync");
      readdirSyncStub = sinon.stub(fs, "readdirSync");
      statSyncStub = sinon.stub(fs, "statSync");
      downloadToTmpStub = sinon.stub(downloadUtils, "downloadToTmp");
      unzipStub = sinon.stub(unzipModule, "unzip");
      sinon.stub(tmp, "dirSync").returns({
        name: "/tmp/firebase-functions-remote-test",
        removeCallback: () => {
          // no-op
        },
      } as tmp.DirResult);
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should use GitHub Archive API for GitHub URLs", async () => {
      const archivePath = "/tmp/archive.zip";
      downloadToTmpStub.resolves(archivePath);
      unzipStub.resolves();

      // Mock readdir to return a single directory (repo-ref)
      readdirSyncStub.returns(["repo-main"]);
      statSyncStub.returns({ isDirectory: () => true } as fs.Stats);
      existsSyncStub.returns(true); // functions.yaml exists

      const sourceDir = await downloadGitHubSource("https://github.com/org/repo", "main");

      expect(downloadToTmpStub.calledOnce).to.be.true;
      expect(downloadToTmpStub.firstCall.args[0]).to.equal(
        "https://github.com/org/repo/archive/main.zip",
      );
      expect(unzipStub.calledOnceWith(archivePath, sinon.match.string)).to.be.true;
      expect(sourceDir).to.contain("repo-main");
    });

    it("should support org/repo shorthand", async () => {
      const archivePath = "/tmp/archive.zip";
      downloadToTmpStub.resolves(archivePath);
      unzipStub.resolves();

      readdirSyncStub.returns(["repo-main"]);
      statSyncStub.returns({ isDirectory: () => true } as fs.Stats);
      existsSyncStub.returns(true);

      const sourceDir = await downloadGitHubSource("org/repo", "main");

      expect(downloadToTmpStub.calledOnce).to.be.true;
      expect(downloadToTmpStub.firstCall.args[0]).to.equal(
        "https://github.com/org/repo/archive/main.zip",
      );
      expect(sourceDir).to.contain("repo-main");
    });

    it("should strip top-level directory from GitHub archive", async () => {
      const archivePath = "/tmp/archive.zip";
      downloadToTmpStub.resolves(archivePath);
      unzipStub.resolves();

      readdirSyncStub.returns(["repo-main"]);
      statSyncStub.returns({ isDirectory: () => true } as fs.Stats);
      existsSyncStub.returns(true);

      const sourceDir = await downloadGitHubSource("https://github.com/org/repo", "main");

      expect(sourceDir).to.match(/repo-main$/);
    });

    it("should NOT strip top-level directory if multiple files exist", async () => {
      const archivePath = "/tmp/archive.zip";
      downloadToTmpStub.resolves(archivePath);
      unzipStub.resolves();

      readdirSyncStub.returns(["file1", "file2"]);
      existsSyncStub.returns(true);

      const sourceDir = await downloadGitHubSource("https://github.com/org/repo", "main");

      expect(sourceDir).to.not.match(/file1$/);
      expect(sourceDir).to.not.match(/file2$/);
      // Should return the tmpDir itself
      expect(sourceDir).to.contain("firebase-functions-remote-");
    });

    it("should throw error if GitHub Archive download fails", async () => {
      downloadToTmpStub.rejects(new Error("404 Not Found"));

      await expect(downloadGitHubSource("https://github.com/org/repo", "main")).to.be.rejectedWith(
        FirebaseError,
        /Failed to download GitHub archive/,
      );

      expect(downloadToTmpStub.calledOnce).to.be.true;
    });

    it("should throw error for non-GitHub URLs", async () => {
      await expect(downloadGitHubSource("https://gitlab.com/org/repo", "main")).to.be.rejectedWith(
        FirebaseError,
        /Only GitHub repositories are supported/,
      );

      expect(downloadToTmpStub.called).to.be.false;
    });

    it("should validate subdirectory exists after clone", async () => {
      // Simulate successful download
      downloadToTmpStub.resolves("/tmp/archive.zip");
      unzipStub.resolves();
      readdirSyncStub.returns(["repo-main"]);
      statSyncStub.returns({ isDirectory: () => true } as fs.Stats);

      // Simulate that the subdirectory does not exist
      existsSyncStub.callsFake((p: fs.PathLike) => {
        const s = String(p);
        if (/[/\\]subdir$/.test(s)) return false; // dir missing
        if (s.endsWith("functions.yaml")) return true; // avoid manifest error masking
        return true;
      });

      try {
        await downloadGitHubSource("https://github.com/org/repo", "main", "subdir");
      } catch (e: any) {
        if (!e.message.includes("Directory 'subdir' not found")) {
          throw e;
        }
        return;
      }
      throw new Error("Expected error not thrown");
    });

    it("should validate functions.yaml exists", async () => {
      // Simulate successful download
      downloadToTmpStub.resolves("/tmp/archive.zip");
      unzipStub.resolves();
      readdirSyncStub.returns(["repo-main"]);
      statSyncStub.returns({ isDirectory: () => true } as fs.Stats);

      // Everything exists except the manifest file
      existsSyncStub.callsFake((p: fs.PathLike) => !String(p).endsWith("functions.yaml"));

      try {
        await downloadGitHubSource("https://github.com/org/repo", "main");
      } catch (e: any) {
        if (!e.message.includes("missing a required deployment manifest")) {
          throw e;
        }
        return;
      }
      throw new Error("Expected error not thrown");
    });
  });
});
