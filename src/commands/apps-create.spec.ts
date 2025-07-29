import { expect } from "chai";
import * as sinon from "sinon";
import { Command } from "../command";
import * as projectUtils from "../projectUtils";
import { FirebaseError } from "../error";
import * as apps from "../management/apps";
import { AppPlatform } from "../management/apps";
import * as prompt from "../prompt";
import { command, logPostAppCreationInformation } from "./apps-create";
import * as auth from "../auth";

describe("apps:create", () => {
  let sandbox: sinon.SinonSandbox;
  let needProjectIdStub: sinon.SinonStub;
  let getAppPlatformStub: sinon.SinonStub;
  let sdkInitStub: sinon.SinonStub;
  let selectStub: sinon.SinonStub;
  let requireAuthStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    requireAuthStub = sandbox.stub(auth, "requireAuth").resolves();
    needProjectIdStub = sandbox.stub(projectUtils, "needProjectId").returns("test-project-id");
    getAppPlatformStub = sandbox.stub(apps, "getAppPlatform");
    sdkInitStub = sandbox.stub(apps, "sdkInit").resolves({
      name: "test-name",
      projectId: "test-project-id",
      appId: "test-app-id",
      platform: AppPlatform.WEB,
      displayName: "test-display-name",
    });
    selectStub = sandbox.stub(prompt, "select");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should be a Command", () => {
    expect(command).to.be.an.instanceOf(Command);
  });

  describe("action", () => {
    it("should throw if platform is not provided in non-interactive mode", async () => {
      getAppPlatformStub.returns(AppPlatform.ANY);
      const options = { nonInteractive: true };
      await expect(command.runner()("", undefined, options)).to.be.rejectedWith(
        FirebaseError,
        "App platform must be provided",
      );
      expect(needProjectIdStub).to.have.been.calledOnce;
    });

    it("should prompt for platform if not provided in interactive mode", async () => {
      getAppPlatformStub.withArgs("").returns(AppPlatform.ANY);
      getAppPlatformStub.withArgs("IOS").returns(AppPlatform.IOS);
      selectStub.resolves("IOS");
      const options = { nonInteractive: false };
      await command.runner()("", "test-display-name", options);
      expect(selectStub).to.have.been.calledOnce;
      expect(sdkInitStub).to.have.been.calledOnceWith(
        AppPlatform.IOS,
        sinon.match({
          displayName: "test-display-name",
          nonInteractive: false,
        }),
      );
    });

    it("should create an iOS app", async () => {
      getAppPlatformStub.returns(AppPlatform.IOS);
      const options = { bundleId: "test-bundle-id" };
      await command.runner()("IOS", "test-display-name", options);
      expect(sdkInitStub).to.have.been.calledOnceWith(
        AppPlatform.IOS,
        sinon.match({
          bundleId: "test-bundle-id",
          displayName: "test-display-name",
        }),
      );
    });

    it("should create an Android app", async () => {
      getAppPlatformStub.returns(AppPlatform.ANDROID);
      const options = { packageName: "test-package-name" };
      await command.runner()("ANDROID", "test-display-name", options);
      expect(sdkInitStub).to.have.been.calledOnceWith(
        AppPlatform.ANDROID,
        sinon.match({
          packageName: "test-package-name",
          displayName: "test-display-name",
        }),
      );
    });

    it("should create a Web app", async () => {
      getAppPlatformStub.returns(AppPlatform.WEB);
      const options = {};
      await command.runner()("WEB", "test-display-name", options);
      expect(sdkInitStub).to.have.been.calledOnceWith(
        AppPlatform.WEB,
        sinon.match({
          displayName: "test-display-name",
        }),
      );
    });
  });

  describe("logPostAppCreationInformation", () => {
    it("should log basic app information", () => {
      const appMetadata: apps.WebAppMetadata = {
        name: "test-name",
        projectId: "test-project-id",
        appId: "test-app-id",
        platform: AppPlatform.WEB,
        displayName: "test-display-name",
      };
      logPostAppCreationInformation(appMetadata, AppPlatform.WEB);
      // No assertion needed here, we are just checking that it does not throw.
    });

    it("should log iOS specific information", () => {
      const appMetadata: apps.IosAppMetadata = {
        name: "test-name",
        projectId: "test-project-id",
        appId: "test-app-id",
        platform: AppPlatform.IOS,
        displayName: "test-display-name",
        bundleId: "test-bundle-id",
        appStoreId: "test-app-store-id",
      };
      logPostAppCreationInformation(appMetadata, AppPlatform.IOS);
      // No assertion needed here, we are just checking that it does not throw.
    });

    it("should log Android specific information", () => {
      const appMetadata: apps.AndroidAppMetadata = {
        name: "test-name",
        projectId: "test-project-id",
        appId: "test-app-id",
        platform: AppPlatform.ANDROID,
        displayName: "test-display-name",
        packageName: "test-package-name",
      };
      logPostAppCreationInformation(appMetadata, AppPlatform.ANDROID);
      // No assertion needed here, we are just checking that it does not throw.
    });
  });
});
