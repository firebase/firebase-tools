import { expect } from "chai";
import * as sinon from "sinon";
import { AppDistributionClient } from "../../appdistribution/client";
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
    describe("when request fails", () => {
      it("should throw error when retry count >= AppDistributionClient.MAX_POLLING_RETRIES", () => {
        sandbox.stub(distribution, "getReleaseIdByHash").rejects(new Error("Can't find release"));
        return expect(
          distribution.pollReleaseIdByHash("mock-hash", AppDistributionClient.MAX_POLLING_RETRIES)
        ).to.be.rejectedWith(FirebaseError, "Can't find release");
      });
    });

    it("should return release id when request succeeds", () => {
      const releaseId = "fake-release-id";
      sandbox.stub(distribution, "getReleaseIdByHash").resolves(releaseId);
      return expect(
        distribution.pollReleaseIdByHash("mock-hash", AppDistributionClient.MAX_POLLING_RETRIES)
      ).to.eventually.eq(releaseId);
    });
  });

  describe("getReleaseIdByHash", () => {
    it("should throw an error when request fails", () => {
      const fakeHash = "fake-hash";
      nock(api.appDistributionOrigin)
        .get(`/v1alpha/apps/${appId}/release_by_hash/${fakeHash}`)
        .reply(400, {});

      return expect(distribution.getReleaseIdByHash(fakeHash)).to.be.rejectedWith(
        FirebaseError,
        "HTTP Error: 400"
      );
    });

    describe("when request succeeds", () => {
      it("should return undefined when it cannot parse the response", () => {
        const fakeHash = "fake-hash";
        nock(api.appDistributionOrigin)
          .get(`/v1alpha/apps/${appId}/release_by_hash/${fakeHash}`)
          .reply(200, {});

        return expect(distribution.getReleaseIdByHash(fakeHash)).to.eventually.eq(undefined);
      });

      it("should return the release id", () => {
        const releaseId = "fake-release-id";
        const fakeHash = "fake-hash";
        nock(api.appDistributionOrigin)
          .get(`/v1alpha/apps/${appId}/release_by_hash/${fakeHash}`)
          .reply(200, { release: { id: releaseId } });

        return expect(distribution.getReleaseIdByHash(fakeHash)).to.eventually.eq(releaseId);
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
