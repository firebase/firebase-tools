import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../../api";
import * as remoteconfig from "../../remoteconfig/get";
import { RemoteConfigTemplate } from "../../remoteconfig/interfaces";

const PROJECT_ID = "the-remoteconfig-test-project";

// Test sample template
const expectedProjectInfo: RemoteConfigTemplate = {
  conditions: [
    {
      name: "RCTestCondition",
      expression: "dateTime < dateTime('2020-07-24T00:00:00', 'America/Los_Angeles')",
    },
  ],
  parameters: {
    RCTestkey: {
      defaultValue: {
        value: "RCTestValue",
      },
    },
  },
  version: {
    versionNumber: "6",
    updateTime: "2020-07-23T17:13:11.190Z",
    updateUser: {
      email: "abc@gmail.com",
    },
    updateOrigin: "CONSOLE",
    updateType: "INCREMENTAL_UPDATE",
  },
  parameterGroups: {
    RCTestCaseGroup: {
      parameters: {
        RCTestKey2: {
          defaultValue: {
            value: "RCTestValue2",
          },
          description: "This is a test",
        },
      },
    },
  },
  etag: "123",
};

// Test sample template with two parameters
const projectInfoWithTwoParameters: RemoteConfigTemplate = {
  conditions: [
    {
      name: "RCTestCondition",
      expression: "dateTime < dateTime('2020-07-24T00:00:00', 'America/Los_Angeles')",
    },
  ],
  parameters: {
    RCTestkey: {
      defaultValue: {
        value: "RCTestValue",
      },
    },
    enterNumber: {
      defaultValue: {
        value: "6",
      },
    },
  },
  version: {
    versionNumber: "6",
    updateTime: "2020-07-23T17:13:11.190Z",
    updateUser: {
      email: "abc@gmail.com",
    },
    updateOrigin: "CONSOLE",
    updateType: "INCREMENTAL_UPDATE",
  },
  parameterGroups: {
    RCTestCaseGroup: {
      parameters: {
        RCTestKey2: {
          defaultValue: {
            value: "RCTestValue2",
          },
          description: "This is a test",
        },
      },
    },
  },
  etag: "123",
};

describe("Remote Config GET", () => {
  let sandbox: sinon.SinonSandbox;
  let apiRequestStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    apiRequestStub = sandbox.stub(api, "request").throws("Unexpected API request call");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getTemplate", () => {
    it("should return the latest template", async () => {
      apiRequestStub.onFirstCall().resolves({ body: expectedProjectInfo });

      const RCtemplate = await remoteconfig.getTemplate(PROJECT_ID);

      expect(RCtemplate).to.deep.equal(expectedProjectInfo);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1/projects/${PROJECT_ID}/remoteConfig`,
        {
          auth: true,
          origin: api.remoteConfigApiOrigin,
          timeout: 30000,
        }
      );
    });

    it("should return the correct version of the template if version is specified", async () => {
      apiRequestStub.onFirstCall().resolves({ body: expectedProjectInfo });

      const RCtemplateVersion = await remoteconfig.getTemplate(PROJECT_ID, "6");

      expect(RCtemplateVersion).to.deep.equal(expectedProjectInfo);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1/projects/${PROJECT_ID}/remoteConfig?versionNumber=6`,
        {
          auth: true,
          origin: api.remoteConfigApiOrigin,
          timeout: 30000,
        }
      );
    });

    it("should return a correctly parsed entry value with one parameter", () => {
      const expectRCParameters = "RCTestkey\n";
      const RCParameters = remoteconfig.parseTemplateForTable(expectedProjectInfo.parameters);

      expect(RCParameters).to.deep.equal(expectRCParameters);
    });

    it("should return a correctly parsed entry value with two parameters", () => {
      const expectRCParameters = "RCTestkey\nenterNumber\n";
      const RCParameters = remoteconfig.parseTemplateForTable(
        projectInfoWithTwoParameters.parameters
      );

      expect(RCParameters).to.deep.equal(expectRCParameters);
    });

    it("should reject if the api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");

      apiRequestStub.onFirstCall().rejects(expectedError);

      let err;
      try {
        await remoteconfig.getTemplate(PROJECT_ID);
      } catch (e) {
        err = e;
      }

      expect(err.message).to.equal(
        `Failed to get Firebase Remote Config template for project ${PROJECT_ID}. `
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1/projects/${PROJECT_ID}/remoteConfig`,
        {
          auth: true,
          origin: api.remoteConfigApiOrigin,
          timeout: 30000,
        }
      );
    });
  });
});
