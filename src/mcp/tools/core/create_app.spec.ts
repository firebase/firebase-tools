import { expect } from "chai";
import * as sinon from "sinon";
import { create_app } from "./create_app";
import * as apps from "../../../management/apps";
import { toContent } from "../../util";
import { ServerToolContext } from "../../tool";

describe("create_app tool", () => {
  const projectId = "test-project";
  const displayName = "My App";

  let createAndroidAppStub: sinon.SinonStub;
  let createIosAppStub: sinon.SinonStub;
  let createWebAppStub: sinon.SinonStub;

  const CREATE_APP_OUTUT_PREFIX = "Created app with the following details:\n\n";
  const CREATE_APP_OUTUT_SUFFIX =
    "\n\nTo fetch the SDK configuration for this app, use the firebase_get_sdk_config tool.";

  beforeEach(() => {
    createAndroidAppStub = sinon.stub(apps, "createAndroidApp");
    createIosAppStub = sinon.stub(apps, "createIosApp");
    createWebAppStub = sinon.stub(apps, "createWebApp");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should create an Android app", async () => {
    const androidConfig = { package_name: "com.example.android" };
    const app = { appId: "android-app-id" };
    createAndroidAppStub.resolves(app);

    const result = await create_app.fn(
      { display_name: displayName, platform: "android", android_config: androidConfig },
      { projectId } as ServerToolContext,
    );

    expect(createAndroidAppStub).to.be.calledWith(projectId, {
      displayName,
      packageName: androidConfig.package_name,
    });
    expect(result).to.deep.equal(
      toContent(app, {
        format: "yaml",
        contentPrefix: CREATE_APP_OUTUT_PREFIX,
        contentSuffix: CREATE_APP_OUTUT_SUFFIX,
      }),
    );
  });

  it("should create an iOS app", async () => {
    const iosConfig = { bundle_id: "com.example.ios", app_store_id: "123" };
    const app = { appId: "ios-app-id" };
    createIosAppStub.resolves(app);

    const result = await create_app.fn(
      { display_name: displayName, platform: "ios", ios_config: iosConfig },
      { projectId } as ServerToolContext,
    );

    expect(createIosAppStub).to.be.calledWith(projectId, {
      displayName,
      bundleId: iosConfig.bundle_id,
      appStoreId: iosConfig.app_store_id,
    });
    expect(result).to.deep.equal(
      toContent(app, {
        format: "yaml",
        contentPrefix: CREATE_APP_OUTUT_PREFIX,
        contentSuffix: CREATE_APP_OUTUT_SUFFIX,
      }),
    );
  });

  it("should create a Web app", async () => {
    const app = { appId: "web-app-id" };
    createWebAppStub.resolves(app);

    const result = await create_app.fn({ display_name: displayName, platform: "web" }, {
      projectId,
    } as ServerToolContext);

    expect(createWebAppStub).to.be.calledWith(projectId, { displayName });
    expect(result).to.deep.equal(
      toContent(app, {
        format: "yaml",
        contentPrefix: CREATE_APP_OUTUT_PREFIX,
        contentSuffix: CREATE_APP_OUTUT_SUFFIX,
      }),
    );
  });

  it("should throw an error if Android config is missing", async () => {
    await expect(create_app.fn({ platform: "android" }, { projectId } as ServerToolContext)).to.be.rejectedWith(
      "Android configuration is required when platform is 'android'",
    );
  });

  it("should throw an error if iOS config is missing", async () => {
    await expect(create_app.fn({ platform: "ios" }, { projectId } as ServerToolContext)).to.be.rejectedWith(
      "iOS configuration is required when platform is 'ios'",
    );
  });
});
