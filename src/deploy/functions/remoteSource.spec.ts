import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";

import * as remoteSourceModule from "./remoteSource";
import { cloneRemoteSource, GitClient } from "./remoteSource";
import { FirebaseError } from "../../error";

describe("remoteSource", () => {
  describe("cloneRemoteSource", () => {
    let existsSyncStub: sinon.SinonStub;
    let isGitAvailableStub: sinon.SinonStub;
    let cloneStub: sinon.SinonStub;
    let fetchStub: sinon.SinonStub;
    let checkoutStub: sinon.SinonStub;
    let mockGitClient: GitClient;

    beforeEach(() => {
      existsSyncStub = sinon.stub(fs, "existsSync");
      isGitAvailableStub = sinon.stub(remoteSourceModule, "isGitAvailable");

      cloneStub = sinon.stub().returns({ status: 0 });
      fetchStub = sinon.stub().returns({ status: 0 });
      checkoutStub = sinon.stub().returns({ status: 0 });
      mockGitClient = {
        clone: cloneStub,
        fetch: fetchStub,
        checkout: checkoutStub,
      } as unknown as GitClient;
    });

    afterEach(() => {
      existsSyncStub.restore();
      isGitAvailableStub.restore();
    });

    it("should handle clone failures with meaningful errors", async () => {
      isGitAvailableStub.returns(true);
      cloneStub.returns({
        status: 1,
        stderr: "fatal: unable to access 'https://github.com/org/repo': Could not resolve host",
      });

      await expect(
        cloneRemoteSource("https://github.com/org/repo", "main", undefined, mockGitClient),
      ).to.be.rejectedWith(FirebaseError, /Unable to access repository/);
    });

    it("should handle fetch failures for invalid refs", async () => {
      isGitAvailableStub.returns(true);
      fetchStub.returns({
        status: 1,
        stderr: "error: pathspec 'bad-ref' did not match any file(s) known to git",
      });

      await expect(
        cloneRemoteSource("https://github.com/org/repo", "bad-ref", undefined, mockGitClient),
      ).to.be.rejectedWith(FirebaseError, /Git ref 'bad-ref' not found/);
    });

    it("should validate subdirectory exists after clone", async () => {
      isGitAvailableStub.returns(true);
      // Simulate that the subdirectory does not exist
      existsSyncStub.callsFake((p: fs.PathLike) => {
        const s = String(p);
        if (/[/\\]subdir$/.test(s)) return false; // dir missing
        if (s.endsWith("functions.yaml")) return true; // avoid manifest error masking
        return true;
      });
      await expect(
        cloneRemoteSource("https://github.com/org/repo", "main", "subdir", mockGitClient),
      ).to.be.rejectedWith(FirebaseError, /Directory 'subdir' not found/);
    });

    it("should validate functions.yaml exists", async () => {
      isGitAvailableStub.returns(true);
      // Everything exists except the manifest file
      existsSyncStub.callsFake((p: fs.PathLike) => !String(p).endsWith("functions.yaml"));

      await expect(
        cloneRemoteSource("https://github.com/org/repo", "main", undefined, mockGitClient),
      ).to.be.rejectedWith(FirebaseError, /missing a required deployment manifest/);
    });

    it("should successfully clone a repository without a subdirectory", async () => {
      isGitAvailableStub.returns(true);
      // Pass manifest check by returning true for any path ending with functions.yaml
      existsSyncStub.callsFake((p: fs.PathLike) => String(p).endsWith("functions.yaml"));

      const sourceDir = await cloneRemoteSource(
        "https://github.com/org/repo",
        "main",
        undefined,
        mockGitClient,
      );

      expect(cloneStub.calledOnceWith("https://github.com/org/repo", sinon.match.string)).to.be
        .true;
      expect(fetchStub.calledOnceWith("main", sinon.match.string)).to.be.true;
      expect(checkoutStub.calledOnceWith("FETCH_HEAD", sinon.match.string)).to.be.true;
      // No sparse-checkout in MVP path
      expect(sourceDir).to.be.a("string");
    });

    it("should successfully clone a repository with a subdirectory", async () => {
      isGitAvailableStub.returns(true);
      existsSyncStub.callsFake((p: fs.PathLike) => {
        const s = String(p);
        if (/[/\\]functions$/.test(s)) return true; // subdir exists
        if (s.endsWith("functions.yaml")) return true; // manifest exists
        return false;
      });

      const dir = "functions";
      const sourceDir = await cloneRemoteSource(
        "https://github.com/org/repo",
        "main",
        dir,
        mockGitClient,
      );

      expect(fetchStub.calledOnceWith("main", sinon.match.string)).to.be.true;
      expect(checkoutStub.calledOnceWith("FETCH_HEAD", sinon.match.string)).to.be.true;
      expect(sourceDir).to.be.a("string");
      expect(/[/\\]functions$/.test(sourceDir)).to.be.true;
    });
  });
});
