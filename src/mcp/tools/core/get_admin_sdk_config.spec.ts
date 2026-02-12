import { expect } from "chai";
import * as sinon from "sinon";
import { get_admin_sdk_config } from "./get_admin_sdk_config";
import * as adminSdkConfig from "../../../emulator/adminSdkConfig";
import * as util from "../../util";
import { ServerToolContext } from "../../tool";

describe("get_admin_sdk_config tool", () => {
  const projectId = "test-project";
  const config = { projectId, databaseURL: "https://test-project.firebaseio.com" };

  let getConfigStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    getConfigStub = sinon.stub(adminSdkConfig, "getProjectAdminSdkConfigOrCached");
    mcpErrorStub = sinon.stub(util, "mcpError");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should return the admin SDK config if found", async () => {
    getConfigStub.resolves(config);

    const result = await get_admin_sdk_config.fn({}, { projectId } as ServerToolContext);

    expect(getConfigStub).to.be.calledWith(projectId);
    expect(result).to.deep.equal(util.toContent(config));
  });

  it("should return an error if the config is not found", async () => {
    getConfigStub.resolves(undefined);

    await get_admin_sdk_config.fn({}, { projectId } as ServerToolContext);

    expect(getConfigStub).to.be.calledWith(projectId);
    expect(mcpErrorStub).to.be.calledWith(
      `No Admin SDK configuration found in project '${projectId}'`,
    );
  });
});
