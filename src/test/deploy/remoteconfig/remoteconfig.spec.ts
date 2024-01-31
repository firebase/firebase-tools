import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";

import { remoteConfigApiOrigin } from "../../../api";
import * as rcDeploy from "../../../deploy/remoteconfig/functions";
import { FirebaseError } from "../../../error";
import * as remoteconfig from "../../../remoteconfig/get";
import { RemoteConfigTemplate } from "../../../remoteconfig/interfaces";

const PROJECT_NUMBER = "001";

const header = {
  etag: "etag-344230015214-190",
};

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
  let templateStub: sinon.SinonStub;
  let etagStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    templateStub = sandbox.stub(remoteconfig, "getTemplate");
    etagStub = sandbox.stub(rcDeploy, "getEtag");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("Publish the updated template", () => {
    it("should publish the latest template", async () => {
      const ETAG = header.etag;
      templateStub.withArgs(PROJECT_NUMBER).returns(currentTemplate);
      etagStub.withArgs(PROJECT_NUMBER, "6").returns(ETAG);
      nock(remoteConfigApiOrigin)
        .put(`/v1/projects/${PROJECT_NUMBER}/remoteConfig`)
        .matchHeader("If-Match", ETAG)
        .reply(200, expectedTemplateInfo);

      const RCtemplate = await rcDeploy.publishTemplate(PROJECT_NUMBER, currentTemplate, ETAG);

      expect(RCtemplate).to.deep.equal(expectedTemplateInfo);
      expect(nock.isDone()).to.be.true;
    });

    it("should publish the latest template with * etag", async () => {
      templateStub.withArgs(PROJECT_NUMBER).returns(currentTemplate);
      nock(remoteConfigApiOrigin)
        .put(`/v1/projects/${PROJECT_NUMBER}/remoteConfig`)
        .matchHeader("If-Match", "*")
        .reply(200, expectedTemplateInfo);

      const options = { force: true };
      const etag = "*";
      const RCtemplate = await rcDeploy.publishTemplate(
        PROJECT_NUMBER,
        currentTemplate,
        etag,
        options,
      );

      expect(RCtemplate).to.deep.equal(expectedTemplateInfo);
      expect(nock.isDone()).to.be.true;
    });

    it("should reject if the api call fails", async () => {
      const ETAG = header.etag;
      etagStub.withArgs(PROJECT_NUMBER, "6").returns(ETAG);
      nock(remoteConfigApiOrigin)
        .put(`/v1/projects/${PROJECT_NUMBER}/remoteConfig`)
        .matchHeader("If-Match", ETAG)
        .reply(400);

      await expect(
        rcDeploy.publishTemplate(PROJECT_NUMBER, currentTemplate, ETAG),
      ).to.eventually.be.rejectedWith(FirebaseError, "Unknown Error");
      expect(nock.isDone()).to.be.true;
    });
  });
});
