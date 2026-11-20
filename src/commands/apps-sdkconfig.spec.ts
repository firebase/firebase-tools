import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./apps-sdkconfig";
import * as projectUtils from "../projectUtils";
import * as apps from "../management/apps";
import { logger } from "../logger";

describe("apps:sdkconfig", () => {
  const PROJECT_ID = "test-project";
  const androidApp: apps.AppMetadata = {
    name: "projects/test-project/androidApps/1:12345:android:abcdef",
    appId: "1:12345:android:abcdef",
    displayName: "My Android App",
    platform: apps.AppPlatform.ANDROID,
    projectId: PROJECT_ID,
  };
  const webApp: apps.AppMetadata = {
    name: "projects/test-project/webApps/1:12345:web:abcdef",
    appId: "1:12345:web:abcdef",
    displayName: "My Web App",
    platform: apps.AppPlatform.WEB,
    projectId: PROJECT_ID,
  };

  let sandbox: sinon.SinonSandbox;
  let listFirebaseAppsStub: sinon.SinonStub;
  let getAppConfigStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    listFirebaseAppsStub = sandbox.stub(apps, "listFirebaseApps");
    getAppConfigStub = sandbox.stub(apps, "getAppConfig").resolves({
      configFilename: "google-services.json",
      configFileContents: Buffer.from("{}").toString("base64"),
    });
    sandbox.stub(logger, "info");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should explain that [platform] must come before [appId] when given an invalid platform", async () => {
    await expect(
      command.runner()("1:12345:android:abcdef", undefined, { nonInteractive: true }),
    ).to.be.rejectedWith(
      /Unexpected platform "1:12345:android:abcdef"\. \[platform\] must be IOS, ANDROID, or WEB\. To specify an app ID, pass the platform first: firebase apps:sdkconfig <platform> <appId>/,
    );
    expect(listFirebaseAppsStub.called).to.be.false;
  });

  it("should auto-select the only app across all platforms in non-interactive mode", async () => {
    listFirebaseAppsStub.resolves([androidApp]);

    await command.runner()(undefined, undefined, { nonInteractive: true });

    expect(listFirebaseAppsStub.calledOnceWith(PROJECT_ID, apps.AppPlatform.ANY)).to.be.true;
    expect(getAppConfigStub.calledOnceWith(androidApp.appId, apps.AppPlatform.ANDROID)).to.be.true;
  });

  it("should fail with remediation when multiple apps exist in non-interactive mode", async () => {
    listFirebaseAppsStub.resolves([androidApp, webApp]);

    await expect(
      command.runner()(undefined, undefined, { nonInteractive: true }),
    ).to.be.rejectedWith(
      `Project ${PROJECT_ID} has multiple apps, must specify an app id. Run firebase apps:list to find it, then run: firebase apps:sdkconfig <platform> <appId>`,
    );
    expect(getAppConfigStub.called).to.be.false;
  });

  it("should skip app listing when both [platform] and [appId] are given", async () => {
    await command.runner()("android", androidApp.appId, { nonInteractive: true });

    expect(listFirebaseAppsStub.called).to.be.false;
    expect(getAppConfigStub.calledOnceWith(androidApp.appId, apps.AppPlatform.ANDROID)).to.be.true;
  });
});
