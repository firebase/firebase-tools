import { expect } from "chai";
import { join } from "path";
import * as fs from "fs-extra";
import * as nock from "nock";
import * as rimraf from "rimraf";
import * as sinon from "sinon";
import * as tmp from "tmp";

import {
  AppDistributionClient,
  BatchRemoveTestersResponse,
  Group,
} from "../../appdistribution/client";
import { appDistributionOrigin } from "../../api";
import { Distribution } from "../../appdistribution/distribution";
import { FirebaseError } from "../../error";

tmp.setGracefulCleanup();

describe("distribution", () => {
  const tempdir = tmp.dirSync();
  const projectName = "projects/123456789";
  const appName = `${projectName}/apps/1:123456789:ios:abc123def456`;
  const groupName = `${projectName}/groups/my-group`;
  const binaryFile = join(tempdir.name, "app.ipa");
  fs.ensureFileSync(binaryFile);
  const mockDistribution = new Distribution(binaryFile);
  const appDistributionClient = new AppDistributionClient();

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

  describe("addTesters", () => {
    const emails = ["a@foo.com", "b@foo.com"];

    it("should throw error if request fails", async () => {
      nock(appDistributionOrigin)
        .post(`/v1/${projectName}/testers:batchAdd`)
        .reply(400, { error: { status: "FAILED_PRECONDITION" } });
      await expect(appDistributionClient.addTesters(projectName, emails)).to.be.rejectedWith(
        FirebaseError,
        "Failed to add testers",
      );
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve when request succeeds", async () => {
      nock(appDistributionOrigin).post(`/v1/${projectName}/testers:batchAdd`).reply(200, {});
      await expect(appDistributionClient.addTesters(projectName, emails)).to.be.eventually
        .fulfilled;
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("deleteTesters", () => {
    const emails = ["a@foo.com", "b@foo.com"];
    const mockResponse: BatchRemoveTestersResponse = { emails: emails };

    it("should throw error if delete fails", async () => {
      nock(appDistributionOrigin)
        .post(`/v1/${projectName}/testers:batchRemove`)
        .reply(400, { error: { status: "FAILED_PRECONDITION" } });
      await expect(appDistributionClient.removeTesters(projectName, emails)).to.be.rejectedWith(
        FirebaseError,
        "Failed to remove testers",
      );
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve when request succeeds", async () => {
      nock(appDistributionOrigin)
        .post(`/v1/${projectName}/testers:batchRemove`)
        .reply(200, mockResponse);
      await expect(appDistributionClient.removeTesters(projectName, emails)).to.eventually.deep.eq(
        mockResponse,
      );
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("uploadRelease", () => {
    it("should throw error if upload fails", async () => {
      nock(appDistributionOrigin).post(`/upload/v1/${appName}/releases:upload`).reply(400, {});
      await expect(appDistributionClient.uploadRelease(appName, mockDistribution)).to.be.rejected;
      expect(nock.isDone()).to.be.true;
    });

    it("should return token if upload succeeds", async () => {
      const fakeOperation = "fake-operation-name";
      nock(appDistributionOrigin)
        .post(`/upload/v1/${appName}/releases:upload`)
        .reply(200, { name: fakeOperation });
      await expect(
        appDistributionClient.uploadRelease(appName, mockDistribution),
      ).to.be.eventually.eq(fakeOperation);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("updateReleaseNotes", () => {
    const releaseName = `${appName}/releases/fake-release-id`;
    it("should return immediately when no release notes are specified", async () => {
      await expect(appDistributionClient.updateReleaseNotes(releaseName, "")).to.eventually.be
        .fulfilled;
      expect(nock.isDone()).to.be.true;
    });

    it("should throw error when request fails", async () => {
      nock(appDistributionOrigin)
        .patch(`/v1/${releaseName}?updateMask=release_notes.text`)
        .reply(400, {});
      await expect(
        appDistributionClient.updateReleaseNotes(releaseName, "release notes"),
      ).to.be.rejectedWith(FirebaseError, "failed to update release notes");
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve when request succeeds", async () => {
      nock(appDistributionOrigin)
        .patch(`/v1/${releaseName}?updateMask=release_notes.text`)
        .reply(200, {});
      await expect(appDistributionClient.updateReleaseNotes(releaseName, "release notes")).to
        .eventually.be.fulfilled;
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("distribute", () => {
    const releaseName = `${appName}/releases/fake-release-id`;
    it("should return immediately when testers and groups are empty", async () => {
      await expect(appDistributionClient.distribute(releaseName)).to.eventually.be.fulfilled;
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve when request succeeds", async () => {
      nock(appDistributionOrigin).post(`/v1/${releaseName}:distribute`).reply(200, {});
      await expect(appDistributionClient.distribute(releaseName, ["tester1"], ["group1"])).to.be
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
        nock(appDistributionOrigin)
          .post(`/v1/${releaseName}:distribute`, {
            testerEmails: testers,
            groupAliases: groups,
          })
          .reply(412, { error: { status: "FAILED_PRECONDITION" } });
        await expect(
          appDistributionClient.distribute(releaseName, testers, groups),
        ).to.be.rejectedWith(
          FirebaseError,
          "failed to distribute to testers/groups: invalid testers",
        );
        expect(nock.isDone()).to.be.true;
      });

      it("should throw invalid groups error when status code is INVALID_ARGUMENT", async () => {
        nock(appDistributionOrigin)
          .post(`/v1/${releaseName}:distribute`, {
            testerEmails: testers,
            groupAliases: groups,
          })
          .reply(412, { error: { status: "INVALID_ARGUMENT" } });
        await expect(
          appDistributionClient.distribute(releaseName, testers, groups),
        ).to.be.rejectedWith(
          FirebaseError,
          "failed to distribute to testers/groups: invalid groups",
        );
        expect(nock.isDone()).to.be.true;
      });

      it("should throw default error", async () => {
        nock(appDistributionOrigin)
          .post(`/v1/${releaseName}:distribute`, {
            testerEmails: testers,
            groupAliases: groups,
          })
          .reply(400, {});
        await expect(
          appDistributionClient.distribute(releaseName, ["tester1"], ["group1"]),
        ).to.be.rejectedWith(FirebaseError, "failed to distribute to testers/groups");
        expect(nock.isDone()).to.be.true;
      });
    });
  });

  describe("createGroup", () => {
    const mockResponse: Group = { name: groupName, displayName: "My Group" };

    it("should throw error if request fails", async () => {
      nock(appDistributionOrigin)
        .post(`/v1/${projectName}/groups`)
        .reply(400, { error: { status: "FAILED_PRECONDITION" } });
      await expect(appDistributionClient.createGroup(projectName, "My Group")).to.be.rejectedWith(
        FirebaseError,
        "Failed to create group",
      );
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve when request succeeds", async () => {
      nock(appDistributionOrigin).post(`/v1/${projectName}/groups`).reply(200, mockResponse);
      await expect(
        appDistributionClient.createGroup(projectName, "My Group"),
      ).to.eventually.deep.eq(mockResponse);
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve when request with alias succeeds", async () => {
      nock(appDistributionOrigin)
        .post(`/v1/${projectName}/groups?groupId=my-group`)
        .reply(200, mockResponse);
      await expect(
        appDistributionClient.createGroup(projectName, "My Group", "my-group"),
      ).to.eventually.deep.eq(mockResponse);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("deleteGroup", () => {
    it("should throw error if delete fails", async () => {
      nock(appDistributionOrigin)
        .delete(`/v1/${groupName}`)
        .reply(400, { error: { status: "FAILED_PRECONDITION" } });
      await expect(appDistributionClient.deleteGroup(groupName)).to.be.rejectedWith(
        FirebaseError,
        "Failed to delete group",
      );
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve when request succeeds", async () => {
      nock(appDistributionOrigin).delete(`/v1/${groupName}`).reply(200, {});
      await expect(appDistributionClient.deleteGroup(groupName)).to.be.eventually.fulfilled;
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("addTestersToGroup", () => {
    const emails = ["a@foo.com", "b@foo.com"];

    it("should throw error if request fails", async () => {
      nock(appDistributionOrigin)
        .post(`/v1/${groupName}:batchJoin`)
        .reply(400, { error: { status: "FAILED_PRECONDITION" } });
      await expect(appDistributionClient.addTestersToGroup(groupName, emails)).to.be.rejectedWith(
        FirebaseError,
        "Failed to add testers to group",
      );
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve when request succeeds", async () => {
      nock(appDistributionOrigin).post(`/v1/${groupName}:batchJoin`).reply(200, {});
      await expect(appDistributionClient.addTestersToGroup(groupName, emails)).to.be.eventually
        .fulfilled;
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("removeTestersFromGroup", () => {
    const emails = ["a@foo.com", "b@foo.com"];

    it("should throw error if request fails", async () => {
      nock(appDistributionOrigin)
        .post(`/v1/${groupName}:batchLeave`)
        .reply(400, { error: { status: "FAILED_PRECONDITION" } });
      await expect(
        appDistributionClient.removeTestersFromGroup(groupName, emails),
      ).to.be.rejectedWith(FirebaseError, "Failed to remove testers from group");
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve when request succeeds", async () => {
      nock(appDistributionOrigin).post(`/v1/${groupName}:batchLeave`).reply(200, {});
      await expect(appDistributionClient.removeTestersFromGroup(groupName, emails)).to.be.eventually
        .fulfilled;
      expect(nock.isDone()).to.be.true;
    });
  });
});
