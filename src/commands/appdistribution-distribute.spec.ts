import { expect } from "chai";
import * as fs from "fs-extra";
import * as nodefs from "node:fs";
import * as nock from "nock";
import * as sinon from "sinon";
import * as tmp from "tmp";

import { appDistributionOrigin } from "../api";
import * as distributer from "./appdistribution-distribute";
import { FirebaseError } from "../error";

tmp.setGracefulCleanup();

describe("appdistribution:distribute", () => {
  const tempdir = tmp.dirSync();
  const projectName = "projects/123456789";
  const appName = `${projectName}/apps/1:123456789:ios:abc123def456`;
  const binaryFile = tmp.fileSync({ dir: tempdir.name, postfix: ".ipa" });
  const releaseName = `${appName}/releases/fake-release-id`;
  const operationName = `${appName}/operations/fake-operation-id`;

  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    const stat = new nodefs.Stats();
    stat.isFile = () => true;
    sandbox.stub(fs, "statSync").returns(stat);
    nock("https://cloudresourcemanager.googleapis.com").get("/v1/projects/123456789").reply(200, {
      projectNumber: "123456789",
      projectId: "123456789",
      lifecycleState: "ACTIVE",
      name: "test-project",
    });
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  it("should throw an error if the app distribution file does not exist", async () => {
    const error: NodeJS.ErrnoException = new Error("File not found");
    error.code = "ENOENT";
    (fs.statSync as sinon.SinonStub).throws(error);

    await expect(
      distributer.command.runner()("path/to/non-existent-file.ipa", {
        app: "1:123456789:ios:abc123def456",
        project: "123456789",
        token: "thisisatoken",
      }),
    ).to.be.rejectedWith(FirebaseError, /File path\/to\/non-existent-file.ipa does not exist/);
  });

  it("uploads the distribution", async () => {
    nock(appDistributionOrigin())
      .post(`/upload/v1/${appName}/releases:upload`)
      .reply(200, { name: operationName });
    nock(appDistributionOrigin())
      .get(`/v1/${operationName}`)
      .reply(200, {
        done: true,
        response: {
          release: {
            name: releaseName,
          },
        },
      });

    await distributer.command.runner()(binaryFile.name, {
      app: "1:123456789:ios:abc123def456",
      project: "123456789",
      token: "thisisatoken",
    });

    expect(nock.isDone()).to.be.true;
  });

  it("sends release notes", async () => {
    nock(appDistributionOrigin())
      .post(`/upload/v1/${appName}/releases:upload`)
      .reply(200, { name: operationName });
    nock(appDistributionOrigin())
      .get(`/v1/${operationName}`)
      .reply(200, {
        done: true,
        response: {
          release: {
            name: releaseName,
          },
        },
      });
    nock(appDistributionOrigin())
      .patch(`/v1/${releaseName}?updateMask=release_notes.text`)
      .reply(200, {});

    await distributer.command.runner()(binaryFile.name, {
      app: "1:123456789:ios:abc123def456",
      project: "123456789",
      releaseNotes: "release notes",
      token: "thisisatoken",
    });

    expect(nock.isDone()).to.be.true;
  });

  it("sends testers and groups", async () => {
    nock(appDistributionOrigin())
      .post(`/upload/v1/${appName}/releases:upload`)
      .reply(200, { name: operationName });
    nock(appDistributionOrigin())
      .get(`/v1/${operationName}`)
      .reply(200, {
        done: true,
        response: {
          release: {
            name: releaseName,
          },
        },
      });
    nock(appDistributionOrigin()).post(`/v1/${releaseName}:distribute`).reply(200, {});

    await distributer.command.runner()(binaryFile.name, {
      app: "1:123456789:ios:abc123def456",
      project: "123456789",
      testers: "tester1,tester2",
      groups: "group1,group2",
      token: "thisisatoken",
    });

    expect(nock.isDone()).to.be.true;
  });

  context("when upload fails", () => {
    it("throws a FirebaseError", async () => {
      nock(appDistributionOrigin())
        .post(`/upload/v1/${appName}/releases:upload`)
        .reply(400, { error: { message: "HTTP Error 400" } });

      await expect(
        distributer.command.runner()(binaryFile.name, {
          app: "1:123456789:ios:abc123def456",
          project: "123456789",
          token: "thisisatoken",
        }),
      ).to.be.rejectedWith(FirebaseError, /Failed to upload release/);

      expect(nock.isDone()).to.be.true;
    });
  });
});
