import { expect } from "chai";
import { remoteConfigApiOrigin } from "../../api";
import * as nock from "nock";

import { RemoteConfigTemplate } from "../../remoteconfig/interfaces";
import * as remoteconfig from "../../remoteconfig/rollback";
import { FirebaseError } from "../../error";

const PROJECT_ID = "the-remoteconfig-test-project";

function createTemplate(versionNumber: string, date: string): RemoteConfigTemplate {
  return {
    parameterGroups: {},
    version: {
      updateUser: {
        email: "jackiechu@google.com",
      },
      updateTime: date,
      updateOrigin: "REST_API",
      versionNumber: versionNumber,
    },
    conditions: [],
    parameters: {},
    etag: "123",
  };
}

const latestTemplate: RemoteConfigTemplate = createTemplate("115", "2020-08-06T23:11:41.629Z");
const rollbackTemplate: RemoteConfigTemplate = createTemplate("114", "2020-08-07T23:11:41.629Z");

describe("RemoteConfig Rollback", () => {
  afterEach(() => {
    expect(nock.isDone()).to.equal(true, "all nock stubs should have been called");
    nock.cleanAll();
  });

  describe("rollbackCurrentVersion", () => {
    it("should return a rollback to the version number specified", async () => {
      nock(remoteConfigApiOrigin)
        .post(`/v1/projects/${PROJECT_ID}/remoteConfig:rollback?versionNumber=${115}`)
        .reply(200, latestTemplate);

      const RCtemplate = await remoteconfig.rollbackTemplate(PROJECT_ID, 115);

      expect(RCtemplate).to.deep.equal(latestTemplate);
    });

    // TODO: there is no logic that this is testing. Is that intentional?
    it.skip("should reject invalid rollback version number", async () => {
      nock(remoteConfigApiOrigin)
        .post(`/v1/projects/${PROJECT_ID}/remoteConfig:rollback?versionNumber=${1000}`)
        .reply(200, latestTemplate);

      const RCtemplate = await remoteconfig.rollbackTemplate(PROJECT_ID, 1000);

      expect(RCtemplate).to.deep.equal(latestTemplate);
      try {
        await remoteconfig.rollbackTemplate(PROJECT_ID);
      } catch (e: any) {
        e;
      }
    });

    // TODO: this also is not testing anything in the file. Is this intentional?
    it.skip("should return a rollback to the previous version", async () => {
      nock(remoteConfigApiOrigin)
        .post(`/v1/projects/${PROJECT_ID}/remoteConfig:rollback?versionNumber=${undefined}`)
        .reply(200, rollbackTemplate);

      const RCtemplate = await remoteconfig.rollbackTemplate(PROJECT_ID);

      expect(RCtemplate).to.deep.equal(rollbackTemplate);
    });

    it("should reject if the api call fails", async () => {
      nock(remoteConfigApiOrigin)
        .post(`/v1/projects/${PROJECT_ID}/remoteConfig:rollback?versionNumber=${4}`)
        .reply(404, {});
      await expect(remoteconfig.rollbackTemplate(PROJECT_ID, 4)).to.eventually.be.rejectedWith(
        FirebaseError,
        /Not Found/,
      );
    });
  });
});
