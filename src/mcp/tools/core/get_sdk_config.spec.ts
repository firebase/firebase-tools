import { expect } from "chai";
import * as sinon from "sinon";
import { get_sdk_config } from "./get_sdk_config";
import * as apps from "../../../management/apps";
import * as util from "../../util";

describe("get_sdk_config tool", () => {
  const projectId = "test-project";
  const appId = "test-app-id";
  const platform = "web";
  const webApp = { appId, platform: "WEB" };
  const sdkConfig = { apiKey: "test-api-key" };

  let listFirebaseAppsStub: sinon.SinonStub;
  let getAppConfigStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    listFirebaseAppsStub = sinon.stub(apps, "listFirebaseApps");
    getAppConfigStub = sinon.stub(apps, "getAppConfig");
    mcpErrorStub = sinon.stub(util, "mcpError");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should return an error if no platform or app_id is provided", async () => {
    await (get_sdk_config as any)._fn({}, { projectId });
    expect(mcpErrorStub).to.be.calledWith(
      "Must specify one of 'web', 'ios', or 'android' for platform or an app_id for get_sdk_config tool.",
    );
  });

  it("should get config by platform", async () => {
    listFirebaseAppsStub.resolves([webApp]);
    getAppConfigStub.resolves(sdkConfig);

    const result = await (get_sdk_config as any)._fn({ platform }, { projectId });

    expect(listFirebaseAppsStub).to.be.calledWith(projectId, "WEB");
    expect(getAppConfigStub).to.be.calledWith(appId, "WEB");
    expect(result).to.deep.equal(util.toContent(sdkConfig, { format: "json" }));
  });

  it("should get config by app_id", async () => {
    listFirebaseAppsStub.resolves([webApp]);
    getAppConfigStub.resolves(sdkConfig);

    const result = await (get_sdk_config as any)._fn({ app_id: appId }, { projectId });

    expect(listFirebaseAppsStub).to.be.calledWith(projectId, "ANY");
    expect(getAppConfigStub).to.be.calledWith(appId, "WEB");
    expect(result).to.deep.equal(util.toContent(sdkConfig, { format: "json" }));
  });

  it("should return an error if no app is found for the platform", async () => {
    listFirebaseAppsStub.resolves([]);
    await (get_sdk_config as any)._fn({ platform }, { projectId });
    expect(mcpErrorStub).to.be.calledWith(
      `Could not find an app for platform '${platform}' in project '${projectId}'`,
    );
  });

  it("should handle file content in the config", async () => {
    const fileContent = "file content";
    const encodedContent = Buffer.from(fileContent).toString("base64");
    const fileConfig = {
      configFilename: "config.xml",
      configFileContents: encodedContent,
    };
    listFirebaseAppsStub.resolves([webApp]);
    getAppConfigStub.resolves(fileConfig);

    const result = await (get_sdk_config as any)._fn({ platform }, { projectId });

    expect(result).to.deep.equal({
      content: [
        {
          type: "text",
          text: `SDK config content for \`config.xml\`:\n\n\`\`\`\n${fileContent}\n\`\`\``,
        },
      ],
    });
  });
});
