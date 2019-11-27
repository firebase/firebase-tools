import { expect } from "chai";
import * as sinon from "sinon";
import {
  AppDistributionClient,
  UploadStatus,
  UploadStatusResponse,
} from "../../appdistribution/client";
import { FirebaseError } from "../../error";
import * as api from "../../api";
import * as nock from "nock";

describe("distribution", () => {
  const appId = "1:12345789:ios:abc123def456";
  const distribution = new AppDistributionClient(appId);

  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.useFakeTimers();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getApp", () => {
    it("should throw error when app does not exist", () => {
      nock(api.appDistributionOrigin)
        .get(`/v1alpha/apps/${appId}`)
        .reply(404, {});
      return expect(distribution.getApp()).to.be.rejected;
    });

    it("should resolve when request succeeds", () => {
      nock(api.appDistributionOrigin)
        .get(`/v1alpha/apps/${appId}`)
        .reply(200, {});
      return expect(distribution.getApp()).to.be.fulfilled;
    });

    it("should throw an error when the request fails", () => {
      nock(api.appDistributionOrigin)
        .get(`/v1alpha/apps/${appId}`)
        .reply(404, {});
      return expect(distribution.getApp()).to.be.rejected;
    });
  });

  describe("getJwtToken", () => {
    it("should throw error if request fails", () => {
      nock(api.appDistributionOrigin)
        .get(`/v1alpha/apps/${appId}/jwt`)
        .reply(400, {});
      return expect(distribution.getJwtToken()).to.be.rejected;
    });

    describe("when request succeeds", () => {
      it("should return null when response does not contain the token", () => {
        nock(api.appDistributionOrigin)
          .get(`/v1alpha/apps/${appId}/jwt`)
          .reply(200, {});
        return expect(distribution.getJwtToken()).to.be.eventually.eq(undefined);
      });

      it("should return the token", () => {
        const fakeToken = "fake-token";
        nock(api.appDistributionOrigin)
          .get(`/v1alpha/apps/${appId}/jwt`)
          .reply(200, { token: fakeToken });
        return expect(distribution.getJwtToken()).to.be.eventually.eq(fakeToken);
      });
    });
  });

  describe("pollReleaseIdByHash", () => {
    describe("when getUploadStatus returns IN_PROGRESS", () => {
      it("should throw error when retry count >= AppDistributionClient.MAX_POLLING_RETRIES", () => {
        sandbox.stub(distribution, "getUploadStatus").resolves({
          status: UploadStatus.IN_PROGRESS,
        });
        return expect(
          distribution.pollReleaseIdByHash("mock-hash", AppDistributionClient.MAX_POLLING_RETRIES)
        ).to.be.rejectedWith(
          FirebaseError,
          "it took longer than expected to process your binary, please try again"
        );
      });
    });

    it("should return release id when request succeeds", () => {
      const releaseId = "fake-release-id";
      sandbox.stub(distribution, "getUploadStatus").resolves({
        status: UploadStatus.SUCCESS,
        release: {
          id: releaseId,
        },
      });
      return expect(
        distribution.pollReleaseIdByHash("mock-hash", AppDistributionClient.MAX_POLLING_RETRIES)
      ).to.eventually.eq(releaseId);
    });
  });

  describe("getUploadStatus", () => {
    it("should throw an error when request fails", () => {
      const fakeHash = "fake-hash";
      nock(api.appDistributionOrigin)
        .get(`/v1alpha/apps/${appId}/upload_status/${fakeHash}`)
        .reply(400, {});

      return expect(distribution.getUploadStatus(fakeHash)).to.be.rejectedWith(
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

        return expect(distribution.getUploadStatus(fakeHash)).to.eventually.deep.eq(response);
      });
    });
  });

  describe("addReleaseNotes", () => {
    it("should return immediately when no release notes are specified", async () => {
      const apiSpy = sandbox.spy(api, "request");
      await expect(distribution.addReleaseNotes("fake-release-id", "")).to.eventually.be.fulfilled;
      expect(apiSpy).to.not.be.called;
    });

    it("should throw error when request fails", () => {
      const releaseId = "fake-release-id";
      nock(api.appDistributionOrigin)
        .post(`/v1alpha/apps/${appId}/releases/${releaseId}/notes`)
        .reply(400, {});
      return expect(distribution.addReleaseNotes(releaseId, "release notes")).to.be.rejectedWith(
        FirebaseError,
        "failed to add release notes"
      );
    });

    it("should resolve when request succeeds", () => {
      const releaseId = "fake-release-id";
      nock(api.appDistributionOrigin)
        .post(`/v1alpha/apps/${appId}/releases/${releaseId}/notes`)
        .reply(200, {});
      return expect(distribution.addReleaseNotes(releaseId, "release notes")).to.eventually.be
        .fulfilled;
    });
  });

  describe("enableAccess", () => {
    it("should return immediately when testers and groups are empty", async () => {
      const apiSpy = sandbox.spy(api, "request");
      await expect(distribution.enableAccess("fake-release-id")).to.eventually.be.fulfilled;
      expect(apiSpy).to.not.be.called;
    });

    it("should resolve when request succeeds", () => {
      const releaseId = "fake-release-id";
      nock(api.appDistributionOrigin)
        .post(`/v1alpha/apps/${appId}/releases/${releaseId}/enable_access`)
        .reply(200, {});
      return expect(distribution.enableAccess(releaseId, ["tester1"], ["group1"])).to.be.fulfilled;
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
        return expect(distribution.enableAccess(releaseId, testers, groups)).to.be.rejectedWith(
          FirebaseError,
          "failed to add testers/groups: invalid testers"
        );
      });

      it("should throw invalid groups error when status code is INVALID_ARGUMENT", () => {
        const releaseId = "fake-release-id";
        nock(api.appDistributionOrigin)
          .post(`/v1alpha/apps/${appId}/releases/${releaseId}/enable_access`, {
            emails: testers,
            groupIds: groups,
          })
          .reply(412, { error: { status: "INVALID_ARGUMENT" } });
        return expect(distribution.enableAccess(releaseId, testers, groups)).to.be.rejectedWith(
          FirebaseError,
          "failed to add testers/groups: invalid groups"
        );
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
          distribution.enableAccess(releaseId, ["tester1"], ["group1"])
        ).to.be.rejectedWith(FirebaseError, "failed to add testers/groups");
      });
    });
  });
});
