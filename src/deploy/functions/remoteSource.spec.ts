import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";

import { downloadGitHubSource } from "./remoteSource";
import { FirebaseError } from "../../error";
import * as downloadUtils from "../../downloadUtils";
import * as unzipModule from "../../unzip";

describe("remoteSource", () => {
  describe("downloadGitHubSource", () => {
    let downloadToTmpStub: sinon.SinonStub;
    let unzipStub: sinon.SinonStub;
    let tmpDir: tmp.DirResult;

    beforeEach(() => {
      // Use a real temporary directory for each test
      tmpDir = tmp.dirSync({
        prefix: "firebase-functions-remote-test-",
        unsafeCleanup: true,
      });

      // Stub downloadToTmp to return a fake archive path
      downloadToTmpStub = sinon.stub(downloadUtils, "downloadToTmp");

      // Stub unzip to actually write files to the destination
      unzipStub = sinon.stub(unzipModule, "unzip").callsFake(async (src, dest) => {
        // Simulate unzipping by creating the expected directory structure
        // We assume the zip contains a top-level directory "repo-main"
        const repoDir = path.join(dest, "repo-main");
        fs.mkdirSync(repoDir, { recursive: true });
        fs.writeFileSync(path.join(repoDir, "functions.yaml"), "runtime: nodejs16");

        // Add some extra files to simulate a real repo
        fs.writeFileSync(path.join(repoDir, "index.js"), "console.log('hello')");
        fs.mkdirSync(path.join(repoDir, "subdir"));
        fs.writeFileSync(path.join(repoDir, "subdir", "file.txt"), "content");
      });

      // Spy on tmp.dirSync to ensure we can control the temp dir if needed,
      // but mostly we just want to ensure the code uses a new temp dir.
      // However, since the code calls tmp.dirSync internally, we can't easily intercept the *exact* one
      // unless we stub it.
      // To make the test robust without mocking fs, we should let the code create its own temp dir.
      // BUT, we need to control the *content* of that temp dir via the unzip stub.
      // The unzip stub receives the destination path, so we can write to it.
    });

    afterEach(() => {
      sinon.restore();
      if (tmpDir) {
        tmpDir.removeCallback();
      }
    });

    it("should use GitHub Archive API for GitHub URLs", async () => {
      const archivePath = "/tmp/archive.zip";
      downloadToTmpStub.resolves(archivePath);

      const sourceDir = await downloadGitHubSource("https://github.com/org/repo", "main");

      expect(downloadToTmpStub.calledOnce).to.be.true;
      expect(downloadToTmpStub.firstCall.args[0]).to.equal(
        "https://github.com/org/repo/archive/main.zip",
      );
      expect(unzipStub.calledOnce).to.be.true;
      expect(sourceDir).to.match(/repo-main$/);
      expect(fs.existsSync(path.join(sourceDir, "functions.yaml"))).to.be.true;
    });

    it("should support org/repo shorthand", async () => {
      const archivePath = "/tmp/archive.zip";
      downloadToTmpStub.resolves(archivePath);

      const sourceDir = await downloadGitHubSource("org/repo", "main");

      expect(downloadToTmpStub.calledOnce).to.be.true;
      expect(downloadToTmpStub.firstCall.args[0]).to.equal(
        "https://github.com/org/repo/archive/main.zip",
      );
      expect(sourceDir).to.match(/repo-main$/);
    });

    it("should strip top-level directory from GitHub archive", async () => {
      downloadToTmpStub.resolves("/tmp/archive.zip");

      const sourceDir = await downloadGitHubSource("https://github.com/org/repo", "main");

      expect(sourceDir).to.match(/repo-main$/);
      expect(fs.existsSync(path.join(sourceDir, "functions.yaml"))).to.be.true;
    });

    it("should NOT strip top-level directory if multiple files exist at root", async () => {
      downloadToTmpStub.resolves("/tmp/archive.zip");

      // Override unzip stub to create multiple files at root
      unzipStub.callsFake(async (src, dest) => {
        fs.writeFileSync(path.join(dest, "file1.txt"), "content");
        fs.writeFileSync(path.join(dest, "functions.yaml"), "runtime: nodejs16");
        const repoDir = path.join(dest, "repo-main");
        fs.mkdirSync(repoDir);
      });

      const sourceDir = await downloadGitHubSource("https://github.com/org/repo", "main");

      expect(sourceDir).to.not.match(/repo-main$/);
      // Should return the tmpDir itself (or rather, the path to it)
      // Since we can't easily know the exact random tmp path generated inside the function,
      // we check that it contains the expected files.
      expect(fs.existsSync(path.join(sourceDir, "file1.txt"))).to.be.true;
      expect(fs.existsSync(path.join(sourceDir, "functions.yaml"))).to.be.true;
    });

    it("should throw error if GitHub Archive download fails", async () => {
      downloadToTmpStub.rejects(new Error("404 Not Found"));

      await expect(downloadGitHubSource("https://github.com/org/repo", "main")).to.be.rejectedWith(
        FirebaseError,
        /Failed to download GitHub archive/,
      );
    });

    it("should throw error for non-GitHub URLs", async () => {
      await expect(downloadGitHubSource("https://gitlab.com/org/repo", "main")).to.be.rejectedWith(
        FirebaseError,
        /Only GitHub repositories are supported/,
      );
    });

    it("should validate subdirectory exists after clone", async () => {
      downloadToTmpStub.resolves("/tmp/archive.zip");

      // The default unzip stub creates "repo-main/subdir", so "subdir" works.
      // Let's try a non-existent one.
      await expect(
        downloadGitHubSource("https://github.com/org/repo", "main", "nonexistent"),
      ).to.be.rejectedWith(FirebaseError, /Directory 'nonexistent' not found/);
    });

    it("should validate functions.yaml exists", async () => {
      downloadToTmpStub.resolves("/tmp/archive.zip");

      // Override unzip to NOT create functions.yaml
      unzipStub.callsFake(async (src, dest) => {
        const repoDir = path.join(dest, "repo-main");
        fs.mkdirSync(repoDir, { recursive: true });
        // No functions.yaml
      });

      await expect(downloadGitHubSource("https://github.com/org/repo", "main")).to.be.rejectedWith(
        FirebaseError,
        /missing a required deployment manifest/,
      );
    });

    it("should prevent path traversal in subdirectory", async () => {
      downloadToTmpStub.resolves("/tmp/archive.zip");

      await expect(
        downloadGitHubSource("https://github.com/org/repo", "main", "../outside")
      ).to.be.rejectedWith(FirebaseError, /must not escape/);
    });
  });
});
