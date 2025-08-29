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
    let initSparseStub: sinon.SinonStub;
    let setSparseStub: sinon.SinonStub;
    let mockGitClient: GitClient;

    beforeEach(() => {
      existsSyncStub = sinon.stub(fs, "existsSync");
      isGitAvailableStub = sinon.stub(remoteSourceModule, "isGitAvailable");

      cloneStub = sinon.stub().returns({ status: 0 });
      fetchStub = sinon.stub().returns({ status: 0 });
      checkoutStub = sinon.stub().returns({ status: 0 });
      initSparseStub = sinon.stub().returns({ status: 0 });
      setSparseStub = sinon.stub().returns({ status: 0 });
      mockGitClient = {
        clone: cloneStub,
        fetch: fetchStub,
        checkout: checkoutStub,
        initSparseCheckout: initSparseStub,
        setSparsePaths: setSparseStub,
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
      setSparseStub.returns({ status: 1, stderr: "fatal: pathspec 'subdir' did not match any files" });

      await expect(
        cloneRemoteSource("https://github.com/org/repo", "main", "subdir", mockGitClient),
      ).to.be.rejectedWith(FirebaseError, /Directory 'subdir' not found/);
    });

    it("should validate functions.yaml exists", async () => {
      isGitAvailableStub.returns(true);
      existsSyncStub.withArgs(sinon.match(/firebase-functions-remote/)).returns(true);
      existsSyncStub.withArgs(sinon.match(/functions\.yaml$/)).returns(false);

      await expect(
        cloneRemoteSource("https://github.com/org/repo", "main", undefined, mockGitClient),
      ).to.be.rejectedWith(FirebaseError, /missing a required deployment manifest/);
    });
  });
});
