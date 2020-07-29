 
import { expect } from "chai";
import * as sinon from "sinon";
import * as api from "../../api";
import { mockAuth } from "../helpers";
import * as remoteconfig from "../../remoteconfig/versionslist";
import { ListVersionsResult } from "../../remoteconfig/interfaces";

const PROJECT_ID = "the-remoteconfig-test-project";

const expectedProjectInfoLimit: ListVersionsResult = {
  versions: [
    {
      versionNumber: "114",
      updateTime: "2020-07-16T23:22:23.608Z",
      updateUser: {
        email: "jackiechu@google.com",
      },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "113",
      updateTime: "2020-06-18T21:10:08.992Z",
      updateUser: {
        email: "jackiechu@google.com",
      },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
  ],
};

const expectedProjectInfoDefault: ListVersionsResult = {
  versions: [
    {
      versionNumber: "114",
      updateTime: "2020-07-16T23:22:23.608Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "113",
      updateTime: "2020-06-18T21:10:08.992Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "112",
      updateTime: "2020-06-16T22:20:34.549Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "111",
      updateTime: "2020-06-16T22:14:24.419Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "110",
      updateTime: "2020-06-16T22:05:03.116Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "109",
      updateTime: "2020-06-16T21:55:19.415Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "108",
      updateTime: "2020-06-16T21:54:55.799Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "107",
      updateTime: "2020-06-16T21:48:37.565Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "106",
      updateTime: "2020-06-16T21:44:41.043Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "105",
      updateTime: "2020-06-16T21:44:13.860Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
  ],
};
// Test template
const expectedProjectInfoNoLimit: ListVersionsResult = {
  versions: [
    {
      versionNumber: "114",
      updateTime: "2020-07-16T23:22:23.608Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "113",
      updateTime: "2020-06-18T21:10:08.992Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "112",
      updateTime: "2020-06-16T22:20:34.549Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "111",
      updateTime: "2020-06-16T22:14:24.419Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "110",
      updateTime: "2020-06-16T22:05:03.116Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "109",
      updateTime: "2020-06-16T21:55:19.415Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "108",
      updateTime: "2020-06-16T21:54:55.799Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "107",
      updateTime: "2020-06-16T21:48:37.565Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "106",
      updateTime: "2020-06-16T21:44:41.043Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "105",
      updateTime: "2020-06-16T21:44:13.860Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "104",
      updateTime: "2020-06-16T21:39:19.422Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
    {
      versionNumber: "103",
      updateTime: "2020-06-16T21:37:40.858Z",
      updateUser: { email: "jackiechu@google.com" },
      updateOrigin: "CONSOLE",
      updateType: "INCREMENTAL_UPDATE",
    },
  ],
};

describe("RemoteConfig Versions List Command TESTING", () => {
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
    it("should resolve with template versions limit information if it succeeds", async () => {
      let limit;
      apiRequestStub.onFirstCall().resolves({ body: expectedProjectInfoNoLimit });
      if (limit == 0) {
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
      }
      if (limit == 2) {
        const RCtemplate = await remoteconfig.getVersions(PROJECT_ID);
        expect(RCtemplate).to.deep.equal(expectedProjectInfoLimit);
        expect(apiRequestStub).to.be.calledOnceWith(
          "GET",
          `/v1/projects/${PROJECT_ID}/remoteConfig:listVersions`,
          {
            auth: true,
            origin: api.remoteConfigApiOrigin,
            timeout: 30000,
          }
        );
      }
    });
    it("should resolve with default 10 versions information if it succeeds", async () => {
      apiRequestStub.onFirstCall().resolves({ body: expectedProjectInfoDefault });
      const RCtemplateVersion = await remoteconfig.getVersions(PROJECT_ID);
      expect(RCtemplateVersion).to.deep.equal(expectedProjectInfoDefault);
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
        `Failed to get versions for Firebase project ${PROJECT_ID}. ` +
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
