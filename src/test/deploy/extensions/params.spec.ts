import { expect } from "chai";
import * as sinon from "sinon";

import * as params from "../../../deploy/extensions/params";
import * as paramHelper from "../../../extensions/paramHelper";

describe("readParams", () => {
  let readEnvFileStub: sinon.SinonStub;
  const testProjectDir = "test";
  const testProjectId = "my-project";
  const testProjectNumber = "123456";
  const testInstanceId = "extensionId";

  beforeEach(() => {
    readEnvFileStub = sinon.stub(paramHelper, "readEnvFile").returns({});
  });

  afterEach(() => {
    readEnvFileStub.restore();
  });

  it("should read from generic .env file", () => {
    readEnvFileStub
      .withArgs("test/extensions/extensionId.env")
      .returns({ param: "otherValue", param2: "value2" });

    expect(
      params.readParams({
        projectDir: testProjectDir,
        instanceId: testInstanceId,
        projectId: testProjectId,
        projectNumber: testProjectNumber,
        aliases: [],
      })
    ).to.deep.equal({ param: "otherValue", param2: "value2" });
  });

  it("should read from project id .env file", () => {
    readEnvFileStub
      .withArgs("test/extensions/extensionId.env.my-project")
      .returns({ param: "otherValue", param2: "value2" });

    expect(
      params.readParams({
        projectDir: testProjectDir,
        instanceId: testInstanceId,
        projectId: testProjectId,
        projectNumber: testProjectNumber,
        aliases: [],
      })
    ).to.deep.equal({ param: "otherValue", param2: "value2" });
  });

  it("should read from project number .env file", () => {
    readEnvFileStub
      .withArgs("test/extensions/extensionId.env.123456")
      .returns({ param: "otherValue", param2: "value2" });

    expect(
      params.readParams({
        projectDir: testProjectDir,
        instanceId: testInstanceId,
        projectId: testProjectId,
        projectNumber: testProjectNumber,
        aliases: [],
      })
    ).to.deep.equal({ param: "otherValue", param2: "value2" });
  });

  it("should read from an alias .env file", () => {
    readEnvFileStub
      .withArgs("test/extensions/extensionId.env.prod")
      .returns({ param: "otherValue", param2: "value2" });

    expect(
      params.readParams({
        projectDir: testProjectDir,
        instanceId: testInstanceId,
        projectId: testProjectId,
        projectNumber: testProjectNumber,
        aliases: ["prod"],
      })
    ).to.deep.equal({ param: "otherValue", param2: "value2" });
  });

  it("should prefer values from project specific env files", () => {
    readEnvFileStub
      .withArgs("test/extensions/extensionId.env.my-project")
      .returns({ param: "value" });
    readEnvFileStub
      .withArgs("test/extensions/extensionId.env")
      .returns({ param: "otherValue", param2: "value2" });

    expect(
      params.readParams({
        projectDir: testProjectDir,
        instanceId: testInstanceId,
        projectId: testProjectId,
        projectNumber: testProjectNumber,
        aliases: [],
      })
    ).to.deep.equal({ param: "value", param2: "value2" });
  });
});
