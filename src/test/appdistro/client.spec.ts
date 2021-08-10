import { expect } from "chai";
import { join } from "path";
import * as fs from "fs-extra";
import * as rimraf from "rimraf";
import * as sinon from "sinon";
import * as tmp from "tmp";

import {
  AppDistributionClient,
  AabInfo,
  UploadStatus,
  UploadStatusResponse,
} from "../../appdistribution/client";
import { FirebaseError } from "../../error";
import * as api from "../../api";
import * as nock from "nock";
import { Distribution, DistributionFileType } from "../../appdistribution/distribution";

tmp.setGracefulCleanup();

describe("distribution", () => {
  const tempdir = tmp.dirSync();
  const projectNumber = "123456789";
  const appId = "1:123456789:ios:abc123def456";
  const binaryFile = join(tempdir.name, "app.ipa");
  fs.ensureFileSync(binaryFile);
  const mockDistribution = new Distribution(binaryFile);
  const appDistributionClient = new AppDistributionClient(appId);

  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.useFakeTimers();
  });

  afterEach(() => {
    sandbox.restore();
  });

  after(() => {
    rimraf.sync(tempdir.name);
  });

  describe("uploadDistribution", () => {
    it("should throw error if upload fails", async () => {
      nock(api.appDistributionOrigin).post(`/app-binary-uploads?app_id=${appId}`).reply(400, {});
      await expect(appDistributionClient.uploadDistribution(mockDistribution)).to.be.rejected;
      expect(nock.isDone()).to.be.true;
    });

    it("should return token if upload succeeds", async () => {
      const fakeToken = "fake-token";
      nock(api.appDistributionOrigin)
        .post(`/app-binary-uploads?app_id=${appId}`)
        .reply(200, { token: fakeToken });
      await expect(appDistributionClient.uploadDistribution(mockDistribution)).to.be.eventually.eq(
        fakeToken
      );
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("pollReleaseIdByHash", () => {
    describe("when getUploadStatus returns IN_PROGRESS", () => {
      it("should throw error when retry count >= AppDistributionClient.MAX_POLLING_RETRIES", () => {
        sandbox.stub(appDistributionClient, "getUploadStatus").resolves({
          status: UploadStatus.IN_PROGRESS,
          message: "",
          errorCode: "",
          release: { id: "" },
        });
        return expect(
          appDistributionClient.pollUploadStatus(
            "mock-hash",
            AppDistributionClient.MAX_POLLING_RETRIES
          )
        ).to.be.rejectedWith(
          FirebaseError,
          "it took longer than expected to process your binary, please try again"
        );
      });
    });

    it("should return release id when request succeeds", () => {
      const releaseId = "fake-release-id";
      sandbox.stub(appDistributionClient, "getUploadStatus").resolves({
        status: UploadStatus.SUCCESS,
        message: "",
        errorCode: "",
        release: {
          id: releaseId,
        },
      });
      return expect(
        appDistributionClient.pollUploadStatus(
          "mock-hash",
          AppDistributionClient.MAX_POLLING_RETRIES
        )
      ).to.eventually.eq(releaseId);
    });
  });

  describe("getUploadStatus", () => {
    it("should throw an error when request fails", async () => {
      const fakeHash = "fake-hash";
      nock(api.appDistributionOrigin)
        .get(`/v1alpha/apps/${appId}/upload_status/${fakeHash}`)
        .reply(400, {});

      await expect(appDistributionClient.getUploadStatus(fakeHash)).to.be.rejectedWith(
        FirebaseError,
        "HTTP Error: 400"
      );
      expect(nock.isDone()).to.be.true;
    });

    describe("when request succeeds", () => {
      it("should return the upload status", async () => {
        const releaseId = "fake-release-id";
        const fakeHash = "fake-hash";
        const response: UploadStatusResponse = {
          status: UploadStatus.SUCCESS,
          errorCode: "0",
          message: "",
          release: {
            id: releaseId,
          },
        };
        nock(api.appDistributionOrigin)
          .get(`/v1alpha/apps/${appId}/upload_status/${fakeHash}`)
          .reply(200, response);

        await expect(appDistributionClient.getUploadStatus(fakeHash)).to.eventually.deep.eq(
          response
        );
        expect(nock.isDone()).to.be.true;
      });
    });
  });

  describe("updateReleaseNotes", () => {
    it("should return immediately when no release notes are specified", async () => {
      const apiSpy = sandbox.spy(api, "request");
      await expect(appDistributionClient.updateReleaseNotes("fake-release-id", "")).to.eventually.be
        .fulfilled;
      expect(apiSpy).to.not.be.called;
    });

    it("should throw error when request fails", async () => {
      const releaseId = "fake-release-id";
      nock(api.appDistributionOrigin)
        .patch(
          `/v1/projects/${projectNumber}/apps/${appId}/releases/${releaseId}?updateMask=release_notes.text`
        )
        .reply(400, {});
      await expect(
        appDistributionClient.updateReleaseNotes(releaseId, "release notes")
      ).to.be.rejectedWith(FirebaseError, "failed to update release notes");
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve when request succeeds", async () => {
      const releaseId = "fake-release-id";
      nock(api.appDistributionOrigin)
        .patch(
          `/v1/projects/${projectNumber}/apps/${appId}/releases/${releaseId}?updateMask=release_notes.text`
        )
        .reply(200, {});
      await expect(appDistributionClient.updateReleaseNotes(releaseId, "release notes")).to
        .eventually.be.fulfilled;
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("distribute", () => {
    it("should return immediately when testers and groups are empty", async () => {
      const apiSpy = sandbox.spy(api, "request");
      await expect(appDistributionClient.distribute("fake-release-id")).to.eventually.be.fulfilled;
      expect(apiSpy).to.not.be.called;
    });

    it("should resolve when request succeeds", async () => {
      const releaseId = "fake-release-id";
      nock(api.appDistributionOrigin)
        .post(`/v1/projects/${projectNumber}/apps/${appId}/releases/${releaseId}:distribute`)
        .reply(200, {});
      await expect(appDistributionClient.distribute(releaseId, ["tester1"], ["group1"])).to.be
        .fulfilled;
      expect(nock.isDone()).to.be.true;
    });

    describe("when request fails", () => {
      let testers: string[];
      let groups: string[];
      beforeEach(() => {
        testers = ["tester1"];
        groups = ["group1"];
      });

      it("should throw invalid testers error when status code is FAILED_PRECONDITION ", async () => {
        const releaseId = "fake-release-id";
        nock(api.appDistributionOrigin)
          .post(`/v1/projects/${projectNumber}/apps/${appId}/releases/${releaseId}:distribute`, {
            testerEmails: testers,
            groupAliases: groups,
          })
          .reply(412, { error: { status: "FAILED_PRECONDITION" } });
        await expect(
          appDistributionClient.distribute(releaseId, testers, groups)
        ).to.be.rejectedWith(
          FirebaseError,
          "failed to distribute to testers/groups: invalid testers"
        );
        expect(nock.isDone()).to.be.true;
      });

      it("should throw invalid groups error when status code is INVALID_ARGUMENT", async () => {
        const releaseId = "fake-release-id";
        nock(api.appDistributionOrigin)
          .post(`/v1/projects/${projectNumber}/apps/${appId}/releases/${releaseId}:distribute`, {
            testerEmails: testers,
            groupAliases: groups,
          })
          .reply(412, { error: { status: "INVALID_ARGUMENT" } });
        await expect(
          appDistributionClient.distribute(releaseId, testers, groups)
        ).to.be.rejectedWith(
          FirebaseError,
          "failed to distribute to testers/groups: invalid groups"
        );
        expect(nock.isDone()).to.be.true;
      });

      it("should throw default error", async () => {
        const releaseId = "fake-release-id";
        nock(api.appDistributionOrigin)
          .post(`/v1/projects/${projectNumber}/apps/${appId}/releases/${releaseId}:distribute`, {
            testerEmails: testers,
            groupAliases: groups,
          })
          .reply(400, {});
        await expect(
          appDistributionClient.distribute(releaseId, ["tester1"], ["group1"])
        ).to.be.rejectedWith(FirebaseError, "failed to distribute to testers/groups");
        expect(nock.isDone()).to.be.true;
      });
    });
  });
});
