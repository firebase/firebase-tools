import { expect } from "chai";
import { join } from "path";
import * as nock from "nock";
import * as rimraf from "rimraf";
import * as sinon from "sinon";
import * as tmp from "tmp";

import {
  AppDistributionClient,
  UploadStatus,
  UploadStatusResponse,
} from "../../appdistribution/client";
import { FirebaseError } from "../../error";
import * as api from "../../api";
import { Distribution } from "../../appdistribution/distribution";

tmp.setGracefulCleanup();

describe("distribution", () => {
  const tempdir = tmp.dirSync();
  const appId = "1:12345789:ios:abc123def456";
  const mockDistribution = new Distribution(join(tempdir.name, "app.ipa"));
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

  describe("getApp", () => {
    it("should throw error when app does not exist", () => {
      nock(api.appDistributionOrigin)
        .get(`/v1alpha/apps/${appId}`)
        .reply(404, {});
      return expect(appDistributionClient.getApp()).to.be.rejected;
    });

    it("should resolve when request succeeds", () => {
      nock(api.appDistributionOrigin)
        .get(`/v1alpha/apps/${appId}`)
        .reply(200, {});
      return expect(appDistributionClient.getApp()).to.be.fulfilled;
    });

    it("should throw an error when the request fails", () => {
      nock(api.appDistributionOrigin)
        .get(`/v1alpha/apps/${appId}`)
        .reply(404, {});
      return expect(appDistributionClient.getApp()).to.be.rejected;
    });
  });

  describe("uploadDistribution", () => {
    it("should throw error if upload fails", () => {
      nock(api.appDistributionOrigin)
        .post(`/app-binary-uploads?app_id=${appId}`)
        .reply(400, {});
      return expect(appDistributionClient.uploadDistribution(mockDistribution)).to.be.rejected;
    });

    it("should return token if upload succeeds", () => {
      const fakeToken = "fake-token";
      nock(api.appDistributionOrigin)
        .post(`/app-binary-uploads?app_id=${appId}`)
        .reply(200, { token: fakeToken });
      return expect(appDistributionClient.uploadDistribution(mockDistribution)).to.be.eventually.eq(
        fakeToken
      );
    });
  });

  describe("pollReleaseIdByHash", () => {
    describe("when getUploadStatus returns IN_PROGRESS", () => {
      it("should throw error when retry count >= AppDistributionClient.MAX_POLLING_RETRIES", () => {
        sandbox.stub(appDistributionClient, "getUploadStatus").resolves({
          status: UploadStatus.IN_PROGRESS,
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
    it("should throw an error when request fails", () => {
      const fakeHash = "fake-hash";
      nock(api.appDistributionOrigin)
        .get(`/v1alpha/apps/${appId}/upload_status/${fakeHash}`)
        .reply(400, {});

      return expect(appDistributionClient.getUploadStatus(fakeHash)).to.be.rejectedWith(
        FirebaseError,
        "HTTP Error: 400"
      );
    });

    describe("when request succeeds", () => {
      it("should return the upload status", () => {
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

        return expect(appDistributionClient.getUploadStatus(fakeHash)).to.eventually.deep.eq(
          response
        );
      });
    });
  });

  describe("addReleaseNotes", () => {
    it("should return immediately when no release notes are specified", async () => {
      const apiSpy = sandbox.spy(api, "request");
      await expect(appDistributionClient.addReleaseNotes("fake-release-id", "")).to.eventually.be
        .fulfilled;
      expect(apiSpy).to.not.be.called;
    });

    it("should throw error when request fails", () => {
      const releaseId = "fake-release-id";
      nock(api.appDistributionOrigin)
        .post(`/v1alpha/apps/${appId}/releases/${releaseId}/notes`)
        .reply(400, {});
      return expect(
        appDistributionClient.addReleaseNotes(releaseId, "release notes")
      ).to.be.rejectedWith(FirebaseError, "failed to add release notes");
    });

    it("should resolve when request succeeds", () => {
      const releaseId = "fake-release-id";
      nock(api.appDistributionOrigin)
        .post(`/v1alpha/apps/${appId}/releases/${releaseId}/notes`)
        .reply(200, {});
      return expect(appDistributionClient.addReleaseNotes(releaseId, "release notes")).to.eventually
        .be.fulfilled;
    });
  });

  describe("enableAccess", () => {
    it("should return immediately when testers and groups are empty", async () => {
      const apiSpy = sandbox.spy(api, "request");
      await expect(appDistributionClient.enableAccess("fake-release-id")).to.eventually.be
        .fulfilled;
      expect(apiSpy).to.not.be.called;
    });

    it("should resolve when request succeeds", () => {
      const releaseId = "fake-release-id";
      nock(api.appDistributionOrigin)
        .post(`/v1alpha/apps/${appId}/releases/${releaseId}/enable_access`)
        .reply(200, {});
      return expect(appDistributionClient.enableAccess(releaseId, ["tester1"], ["group1"])).to.be
        .fulfilled;
    });

    describe("when request fails", () => {
      let testers: string[];
      let groups: string[];
      beforeEach(() => {
        testers = ["tester1"];
        groups = ["group1"];
      });

      it("should throw invalid testers error when status code is FAILED_PRECONDITION ", () => {
        const releaseId = "fake-release-id";
        nock(api.appDistributionOrigin)
          .post(`/v1alpha/apps/${appId}/releases/${releaseId}/enable_access`, {
            emails: testers,
            groupIds: groups,
          })
          .reply(412, { error: { status: "FAILED_PRECONDITION" } });
        return expect(
          appDistributionClient.enableAccess(releaseId, testers, groups)
        ).to.be.rejectedWith(FirebaseError, "failed to add testers/groups: invalid testers");
      });

      it("should throw invalid groups error when status code is INVALID_ARGUMENT", () => {
        const releaseId = "fake-release-id";
        nock(api.appDistributionOrigin)
          .post(`/v1alpha/apps/${appId}/releases/${releaseId}/enable_access`, {
            emails: testers,
            groupIds: groups,
          })
          .reply(412, { error: { status: "INVALID_ARGUMENT" } });
        return expect(
          appDistributionClient.enableAccess(releaseId, testers, groups)
        ).to.be.rejectedWith(FirebaseError, "failed to add testers/groups: invalid groups");
      });

      it("should throw default error", () => {
        const releaseId = "fake-release-id";
        nock(api.appDistributionOrigin)
          .post(`/v1alpha/apps/${appId}/releases/${releaseId}/enable_access`, {
            emails: testers,
            groupIds: groups,
          })
          .reply(400, {});
        return expect(
          appDistributionClient.enableAccess(releaseId, ["tester1"], ["group1"])
        ).to.be.rejectedWith(FirebaseError, "failed to add testers/groups");
      });
    });
  });
});
