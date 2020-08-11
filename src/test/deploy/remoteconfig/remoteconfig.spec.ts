import { expect } from "chai";
import * as sinon from "sinon";
import * as api from "../../../api";
import { mockAuth } from "../../helpers";
import * as remoteconfig from "../../../remoteconfig/get";
import * as rcDeploy from "../../../deploy/remoteconfig/functions";
import { RemoteConfigTemplate } from "../../../remoteconfig/interfaces";

const PROJECT_NUMBER = "001";

function createTemplate(versionNumber: string): RemoteConfigTemplate {
  return {
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
      versionNumber: versionNumber,
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
}

// Test sample template after deploy
const expectedTemplateInfo: RemoteConfigTemplate = createTemplate("7");

// Test sample template before deploy
const currentTemplate: RemoteConfigTemplate = createTemplate("6");

describe("Remote Config Deploy", () => {
  let sandbox: sinon.SinonSandbox;
  let apiRequestStub: sinon.SinonStub;
  let templateStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockAuth(sandbox);
    apiRequestStub = sandbox.stub(api, "request").throws("Unexpected API request call");
    templateStub = sandbox.stub(remoteconfig, "getTemplate");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("Publish the updated template", () => {
    it("should publish the latest template", async () => {
      apiRequestStub.onFirstCall().resolves({ body: expectedTemplateInfo });
      templateStub.withArgs(PROJECT_NUMBER).returns(currentTemplate);

      const etag = await rcDeploy.createEtag(PROJECT_NUMBER);
      const RCtemplate = await rcDeploy.publishTemplate(PROJECT_NUMBER, currentTemplate);

      expect(RCtemplate).to.deep.equal(expectedTemplateInfo);
      expect(apiRequestStub).to.be.calledOnceWith(
        "PUT",
        `/v1/projects/${PROJECT_NUMBER}/remoteConfig`,
        {
          auth: true,
          origin: api.remoteConfigApiOrigin,
          timeout: 30000,
          headers: { "If-Match": etag },
          data: {
            conditions: currentTemplate.conditions,
            parameters: currentTemplate.parameters,
            parameterGroups: currentTemplate.parameterGroups,
          },
        }
      );
    });

    it("should publish the latest template with * etag", async () => {
      apiRequestStub.onFirstCall().resolves({ body: expectedTemplateInfo });
      templateStub.withArgs(PROJECT_NUMBER).returns(currentTemplate);

      const options = { force: true };
      const etag = "*";
      const RCtemplate = await rcDeploy.publishTemplate(PROJECT_NUMBER, currentTemplate, options);

      expect(RCtemplate).to.deep.equal(expectedTemplateInfo);
      expect(apiRequestStub).to.be.calledOnceWith(
        "PUT",
        `/v1/projects/${PROJECT_NUMBER}/remoteConfig`,
        {
          auth: true,
          origin: api.remoteConfigApiOrigin,
          timeout: 30000,
          headers: { "If-Match": etag },
          data: {
            conditions: currentTemplate.conditions,
            parameters: currentTemplate.parameters,
            parameterGroups: currentTemplate.parameterGroups,
          },
        }
      );
    });

    it("should reject if the api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");

      apiRequestStub.onFirstCall().rejects(expectedError);

      let err;
      try {
        await rcDeploy.publishTemplate(PROJECT_NUMBER, currentTemplate);
      } catch (e) {
        err = e;
      }

      expect(err.message).to.equal(`Failed to deploy Firebase project ${PROJECT_NUMBER}. `);
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub).to.be.calledOnceWith(
        "PUT",
        `/v1/projects/${PROJECT_NUMBER}/remoteConfig`,
        {
          auth: true,
          origin: api.remoteConfigApiOrigin,
          timeout: 30000,
          headers: { "If-Match": "etag-001-undefined" },
          data: {
            conditions: currentTemplate.conditions,
            parameters: currentTemplate.parameters,
            parameterGroups: currentTemplate.parameterGroups,
          },
        }
      );
    });
  });
});
