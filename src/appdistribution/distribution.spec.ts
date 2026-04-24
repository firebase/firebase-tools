import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs-extra";
import { upload, Distribution, awaitTestResults, DistributionFileType } from "./distribution";
import { AppDistributionClient } from "./client";
import { UploadReleaseResult, ReleaseTest } from "./types";
import * as utils from "../utils";

describe("appdistribution/distribution", () => {
  let mockClient: sinon.SinonStubbedInstance<AppDistributionClient>;
  let statStub: sinon.SinonStub;
  let logSuccessStub: sinon.SinonStub;

  beforeEach(() => {
    mockClient = sinon.createStubInstance(AppDistributionClient);
    statStub = sinon.stub(fs, "statSync");
    logSuccessStub = sinon.stub(utils, "logSuccess");
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("Distribution class", () => {
    it("should construct valid IPA distribution", () => {
      statStub.returns({ isFile: () => true });
      const dist = new Distribution("app.ipa");
      expect(dist.distributionFileType()).to.equal(DistributionFileType.IPA);
      expect(dist.getFileName()).to.equal("app.ipa");
    });

    it("should construct valid APK distribution", () => {
      statStub.returns({ isFile: () => true });
      const dist = new Distribution("app.apk");
      expect(dist.distributionFileType()).to.equal(DistributionFileType.APK);
    });

    it("should construct valid AAB distribution", () => {
      statStub.returns({ isFile: () => true });
      const dist = new Distribution("app.aab");
      expect(dist.distributionFileType()).to.equal(DistributionFileType.AAB);
    });

    it("should throw if extension is invalid", () => {
      expect(() => new Distribution("app.zip")).to.throw(/Unsupported file format/);
    });

    it("should throw if file does not exist", () => {
      statStub.throws(new Error("ENOENT"));
      expect(() => new Distribution("app.apk")).to.throw(/File app.apk does not exist/);
    });

    it("should throw if path is not a file", () => {
      statStub.returns({ isFile: () => false });
      expect(() => new Distribution("app.apk")).to.throw(/is not a file/);
    });
  });

  describe("upload", () => {
    let distribution: Distribution;

    beforeEach(() => {
      statStub.returns({ isFile: () => true });
      distribution = new Distribution("app.apk");
    });

    it("should successfully upload and poll release", async () => {
      mockClient.uploadRelease.resolves("operations/123");
      mockClient.pollUploadStatus.resolves({
        result: UploadReleaseResult.RELEASE_CREATED,
        release: {
          displayVersion: "1.0",
          buildVersion: "1",
          name: "test-rel",
          releaseNotes: { text: "test-notes" },
          createTime: new Date(),
          firebaseConsoleUri: "http://console.firebase.google.com",
          testingUri: "http://testing.firebase.google.com",
          binaryDownloadUri: "http://download.firebase.google.com",
        },
      });

      const res = await upload(
        mockClient as unknown as AppDistributionClient,
        "apps/123",
        distribution,
      );

      expect(res.displayVersion).to.equal("1.0");
      expect(logSuccessStub).to.have.been.calledWithMatch(/uploaded new release/);
    });

    it("should handle 404 upload error safely", async () => {
      const error404 = new Error("Not found") as unknown as { status: number };
      error404.status = 404;
      mockClient.uploadRelease.rejects(error404);

      await expect(
        upload(mockClient as unknown as AppDistributionClient, "apps/123", distribution),
      ).to.be.rejectedWith(/App Distribution could not find your app/);
    });
  });

  describe("awaitTestResults", () => {
    it("should succeed when all tests pass on first poll", async () => {
      const releaseTests: ReleaseTest[] = [{ name: "tests/1", deviceExecutions: [] }];
      mockClient.getReleaseTest.resolves({
        name: "tests/1",
        deviceExecutions: [
          {
            state: "PASSED",
            device: { model: "Pixel", version: "14", locale: "en_US", orientation: "PORTRAIT" },
          },
        ],
      });

      const setTimeoutStub = sinon.stub(global, "setTimeout").callsFake((fn) => fn() as any);

      await awaitTestResults(releaseTests, mockClient as any);

      expect(logSuccessStub).to.have.been.calledWithMatch(/Automated test\(s\) passed/);
      setTimeoutStub.restore();
    });

    it("should fail immediately when a test execution fails", async () => {
      const releaseTests: ReleaseTest[] = [{ name: "tests/1", deviceExecutions: [] }];
      mockClient.getReleaseTest.resolves({
        name: "tests/1",
        deviceExecutions: [
          {
            state: "FAILED",
            failedReason: "Crash",
            device: { model: "Pixel", version: "14", locale: "en_US", orientation: "PORTRAIT" },
          },
        ],
      } as any);

      const setTimeoutStub = sinon.stub(global, "setTimeout").callsFake((fn) => fn() as any);

      let caughtError: any;
      try {
        await awaitTestResults(releaseTests, mockClient as any);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).to.exist;
      expect(caughtError.message).to.match(/Automated test failed/);
      setTimeoutStub.restore();
    });
  });
});
