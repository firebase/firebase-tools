import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../../api";
import * as remoteconfig from "../../remoteconfig/versionslist";
import { mockAuth } from "../helpers";
import { ListVersionsResult } from "../../remoteconfig/interfaces";

const PROJECT_ID = "the-remoteconfig-test-project";

function createVersionList(version: string, date: string): Record<string, any> {
  return {
    versionNumber: version,
    updateTime: date,
    updateUser: { email: "jackiechu@google.com" },
  };
}
// Test template with limit of 2
const expectedProjectInfoLimit: ListVersionsResult = {
  versions: [
    createVersionList("114", "2020-07-16T23:22:23.608Z"),
    createVersionList("113", "2020-06-18T21:10:08.992Z"),
  ],
};

// Test template with no limit (default template)
const expectedProjectInfoDefault: ListVersionsResult = {
  versions: [
    createVersionList("114", "2020-07-16T23:22:23.608Z"),
    createVersionList("113", "2020-06-18T21:10:08.992Z"),
    createVersionList("112", "2020-06-16T22:20:34.549Z"),
    createVersionList("111", "2020-06-16T22:14:24.419Z"),
    createVersionList("110", "2020-06-16T22:05:03.116Z"),
    createVersionList("109", "2020-06-16T21:55:19.415Z"),
    createVersionList("108", "2020-06-16T21:54:55.799Z"),
    createVersionList("107", "2020-06-16T21:48:37.565Z"),
    createVersionList("106", "2020-06-16T21:44:41.043Z"),
    createVersionList("105", "2020-06-16T21:44:13.860Z"),
  ],
};

// Test template with limit of 0
const expectedProjectInfoNoLimit: ListVersionsResult = {
  versions: [
    createVersionList("114", "2020-07-16T23:22:23.608Z"),
    createVersionList("113", "2020-06-18T21:10:08.992Z"),
    createVersionList("112", "2020-06-16T22:20:34.549Z"),
    createVersionList("111", "2020-06-16T22:14:24.419Z"),
    createVersionList("110", "2020-06-16T22:05:03.116Z"),
    createVersionList("109", "2020-06-16T21:55:19.415Z"),
    createVersionList("108", "2020-06-16T21:54:55.799Z"),
    createVersionList("107", "2020-06-16T21:48:37.565Z"),
    createVersionList("106", "2020-06-16T21:44:41.043Z"),
    createVersionList("105", "2020-06-16T21:44:13.860Z"),
    createVersionList("104", "2020-06-16T21:39:19.422Z"),
    createVersionList("103", "2020-06-16T21:37:40.858Z"),
  ],
};

describe("RemoteConfig ListVersions", () => {
  let sandbox: sinon.SinonSandbox;
  let apiRequestStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockAuth(sandbox);
    apiRequestStub = sandbox.stub(api, "request").throws("Unexpected API request call");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getVersionTemplate", () => {
    it("should return the list of versions up to the limit", async () => {
      apiRequestStub.onFirstCall().resolves({ body: expectedProjectInfoLimit });

      const RCtemplate = await remoteconfig.getVersions(PROJECT_ID, 2);

      expect(RCtemplate).to.deep.equal(expectedProjectInfoLimit);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1/projects/${PROJECT_ID}/remoteConfig:listVersions?pageSize=` + 2,
        {
          auth: true,
          origin: api.remoteConfigApiOrigin,
          timeout: 30000,
        }
      );
    });

    it("should return all the versions when the limit is 0", async () => {
      apiRequestStub.onFirstCall().resolves({ body: expectedProjectInfoNoLimit });

      const RCtemplate = await remoteconfig.getVersions(PROJECT_ID);

      expect(RCtemplate).to.deep.equal(expectedProjectInfoNoLimit);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1/projects/${PROJECT_ID}/remoteConfig:listVersions`,
        {
          auth: true,
          origin: api.remoteConfigApiOrigin,
          timeout: 30000,
        }
      );
    });

    it("should return with default 10 versions when no limit is set", async () => {
      apiRequestStub.onFirstCall().resolves({ body: expectedProjectInfoDefault });

      const RCtemplateVersion = await remoteconfig.getVersions(PROJECT_ID, 10);
      const defaultLimit = 10;

      expect(RCtemplateVersion.versions.length).to.deep.equal(defaultLimit);
      expect(RCtemplateVersion).to.deep.equal(expectedProjectInfoDefault);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1/projects/${PROJECT_ID}/remoteConfig:listVersions?pageSize=` + 10,
        {
          auth: true,
          origin: api.remoteConfigApiOrigin,
          timeout: 30000,
        }
      );
    });

    it("should reject if the api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      apiRequestStub.onFirstCall().rejects(expectedError);

      let err;
      try {
        await remoteconfig.getVersions(PROJECT_ID);
      } catch (e) {
        err = e;
      }

      expect(err.message).to.equal(
        `Failed to get Remote Config template versions for Firebase project ${PROJECT_ID}. ` +
          "Please make sure the project exists and your account has permission to access it."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1/projects/${PROJECT_ID}/remoteConfig:listVersions`,
        {
          auth: true,
          origin: api.remoteConfigApiOrigin,
          timeout: 30000,
        }
      );
    });
  });
});
