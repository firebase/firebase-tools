import { expect } from "chai";

import api = require("../../api");
import sinon = require("sinon");

import { RemoteConfigTemplate } from "../../remoteconfig/interfaces";
import * as remoteconfig from "../../remoteconfig/rollback";

const PROJECT_ID = "the-remoteconfig-test-project";

function createTemplate(
  versionNumber: string,
  date: string,
  rollbackSource?: string
): RemoteConfigTemplate {
  return {
    parameterGroups: {},
    version: {
      updateUser: {
        email: "jackiechu@google.com",
      },
      updateTime: date,
      updateOrigin: "REST_API",
      versionNumber: versionNumber,
      rollbackSource: rollbackSource,
    },
    conditions: [],
    parameters: {},
    etag: "123",
  };
}

const latestTemplate: RemoteConfigTemplate = createTemplate("115", "2020-08-06T23:11:41.629Z");
const rollbackTemplate: RemoteConfigTemplate = createTemplate("114", "2020-08-07T23:11:41.629Z");

describe("RemoteConfig Rollback", () => {
  let sandbox: sinon.SinonSandbox;
  let apiRequestStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    apiRequestStub = sandbox.stub(api, "request").throws("Unexpected API request call");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("rollbackCurrentVersion", () => {
    it("should return a rollback to the version number specified", async () => {
      apiRequestStub.onFirstCall().resolves({ body: latestTemplate });

      const RCtemplate = await remoteconfig.rollbackTemplate(PROJECT_ID, 115);

      expect(RCtemplate).to.deep.equal(latestTemplate);
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1/projects/${PROJECT_ID}/remoteConfig:rollback?versionNumber=` + 115,
        {
          auth: true,
          origin: api.remoteConfigApiOrigin,
          timeout: 30000,
        }
      );
    });

    it("should reject invalid rollback version number", async () => {
      apiRequestStub.onFirstCall().resolves({ body: latestTemplate });

      const RCtemplate = await remoteconfig.rollbackTemplate(PROJECT_ID, 1000);

      expect(RCtemplate).to.deep.equal(latestTemplate);
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1/projects/${PROJECT_ID}/remoteConfig:rollback?versionNumber=` + 1000,
        {
          auth: true,
          origin: api.remoteConfigApiOrigin,
          timeout: 30000,
        }
      );
      try {
        await remoteconfig.rollbackTemplate(PROJECT_ID);
      } catch (e) {
        e;
      }
    });

    it("should return a rollback to the previous version", async () => {
      apiRequestStub.onFirstCall().resolves({ body: rollbackTemplate });

      const RCtemplate = await remoteconfig.rollbackTemplate(PROJECT_ID);

      expect(RCtemplate).to.deep.equal(rollbackTemplate);
      expect(apiRequestStub).to.be.calledWith(
        "POST",
        `/v1/projects/${PROJECT_ID}/remoteConfig:rollback?versionNumber=undefined`,
        {
          auth: true,
          origin: api.remoteConfigApiOrigin,
          timeout: 30000,
        }
      );
    });

    it("should reject if the api call fails", async () => {
      try {
        await remoteconfig.rollbackTemplate(PROJECT_ID);
      } catch (e) {
        e;
      }

      expect(apiRequestStub).to.be.calledWith(
        "POST",
        `/v1/projects/${PROJECT_ID}/remoteConfig:rollback?versionNumber=undefined`,
        {
          auth: true,
          origin: api.remoteConfigApiOrigin,
          timeout: 30000,
        }
      );
    });
  });
});
