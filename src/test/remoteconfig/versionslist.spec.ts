import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../../api";
import * as remoteconfig from "../../remoteconfig/versionslist";
import { mockAuth } from "../helpers";
import { ListVersionsResult } from "../../remoteconfig/interfaces";


const PROJECT_ID = "the-remoteconfig-test-project";

// Test template with limit of 2
const expectedProjectInfoLimit: ListVersionsResult = {
  versions: [
    {
      versionNumber: "114",
      updateTime: "2020-07-16T23:22:23.608Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "113",
      updateTime: "2020-06-18T21:10:08.992Z",
      updateUser: { email: "jackiechu@google.com" },
    },
  ],
};

// Test template with no limit (default template)
const expectedProjectInfoDefault: ListVersionsResult = {
  versions: [
    {
      versionNumber: "114",
      updateTime: "2020-07-16T23:22:23.608Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "113",
      updateTime: "2020-06-18T21:10:08.992Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "112",
      updateTime: "2020-06-16T22:20:34.549Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "111",
      updateTime: "2020-06-16T22:14:24.419Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "110",
      updateTime: "2020-06-16T22:05:03.116Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "109",
      updateTime: "2020-06-16T21:55:19.415Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "108",
      updateTime: "2020-06-16T21:54:55.799Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "107",
      updateTime: "2020-06-16T21:48:37.565Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "106",
      updateTime: "2020-06-16T21:44:41.043Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "105",
      updateTime: "2020-06-16T21:44:13.860Z",
      updateUser: { email: "jackiechu@google.com" },
    },
  ],
};

// Test template with limit of 0
const expectedProjectInfoNoLimit: ListVersionsResult = {
  versions: [
    {
      versionNumber: "114",
      updateTime: "2020-07-16T23:22:23.608Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "113",
      updateTime: "2020-06-18T21:10:08.992Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "112",
      updateTime: "2020-06-16T22:20:34.549Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "111",
      updateTime: "2020-06-16T22:14:24.419Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "110",
      updateTime: "2020-06-16T22:05:03.116Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "109",
      updateTime: "2020-06-16T21:55:19.415Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "108",
      updateTime: "2020-06-16T21:54:55.799Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "107",
      updateTime: "2020-06-16T21:48:37.565Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "106",
      updateTime: "2020-06-16T21:44:41.043Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "105",
      updateTime: "2020-06-16T21:44:13.860Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "104",
      updateTime: "2020-06-16T21:39:19.422Z",
      updateUser: { email: "jackiechu@google.com" },
    },
    {
      versionNumber: "103",
      updateTime: "2020-06-16T21:37:40.858Z",
      updateUser: { email: "jackiechu@google.com" },
    },
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
      let limit;
      apiRequestStub.onFirstCall().resolves({ body: expectedProjectInfoNoLimit });

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

    it("should return all the versions when the limit is 0", async () => {
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
    });

    it("should return with default 10 versions when no limit is set", async () => {
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
