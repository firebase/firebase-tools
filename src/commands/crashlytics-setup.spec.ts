import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./crashlytics-setup";
import * as onboarding from "../crashlytics/onboarding";
import * as apps from "../management/apps";
import { requireAuth } from "../requireAuth";
import { logger } from "../logger";
import { FirebaseError } from "../error";

describe("crashlytics:setup command", () => {
  const projectId = "test-project";
  const webApp: apps.WebAppMetadata = {
    name: `projects/${projectId}/webApps/1:123:web:456`,
    appId: "1:123:web:456",
    displayName: "Test Web App",
    platform: apps.AppPlatform.WEB,
    projectId,
  };
  const androidApp: apps.AndroidAppMetadata = {
    name: `projects/${projectId}/androidApps/1:123:android:456`,
    appId: "1:123:android:456",
    displayName: "Test Android App",
    platform: apps.AppPlatform.ANDROID,
    projectId,
    packageName: "com.test.app",
  };

  const mockSetupResult: onboarding.SetupWebResult = {
    config: {
      name: `projects/${projectId}/locations/global/configs/1-123-web-456`,
      appId: "1:123:web:456",
      logBucket: `projects/${projectId}/locations/global/buckets/firebase-telemetry`,
      samplingRate: 1,
      enablementState: "ENABLED",
    },
  };

  const originalBefores = [
    ...((command as unknown as { befores: Array<{ fn: unknown; args: unknown[] }> }).befores || []),
  ];
  const originalPositionalArgs = [
    ...((command as unknown as { positionalArgs: unknown[] }).positionalArgs || []),
  ];

  let listAppsStub: sinon.SinonStub;
  let selectAppStub: sinon.SinonStub;
  let setupCrashlyticsWebStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = [];
    (command as unknown as { positionalArgs: unknown[] }).positionalArgs = [
      { name: "appId", required: false },
    ];

    listAppsStub = sinon.stub(apps, "listFirebaseApps").resolves([webApp]);
    selectAppStub = sinon.stub(apps, "selectAppInteractively").resolves(webApp);
    setupCrashlyticsWebStub = sinon
      .stub(onboarding, "setupCrashlyticsWeb")
      .resolves(mockSetupResult);
    loggerInfoStub = sinon.stub(logger, "info");
  });

  afterEach(() => {
    (command as unknown as { befores: unknown[] }).befores = [...originalBefores];
    (command as unknown as { positionalArgs: unknown[] }).positionalArgs = [
      ...originalPositionalArgs,
    ];
    sinon.restore();
  });

  it("should configure the command properly", () => {
    expect((command as unknown as { name: string }).name).to.equal("crashlytics:setup");
    expect((command as unknown as { descriptionText: string }).descriptionText).to.equal(
      "set up a Firebase web app for Crashlytics",
    );
    expect(originalBefores).to.deep.equal([{ fn: requireAuth, args: [] }]);

    const options = (command as unknown as { options: string[][] }).options;
    const hasAppOption = options.some(
      (opt) => opt[0] === "--app <appID>" && opt[1] === "the app id of your Firebase app",
    );
    expect(hasAppOption).to.be.true;
  });

  describe("when appId is provided as positional argument", () => {
    it("should set up Crashlytics for a matched web app", async () => {
      const result: unknown = await command.runner()("1:123:web:456", { project: projectId });

      expect(listAppsStub).to.have.been.calledOnceWith(projectId, apps.AppPlatform.ANY);
      expect(setupCrashlyticsWebStub).to.have.been.calledOnceWith(
        projectId,
        "1:123:web:456",
        sinon.match({ project: projectId }),
      );
      expect(result).to.deep.equal(mockSetupResult);
      expect(loggerInfoStub).to.not.have.been.called;
    });

    it("should log info and return undefined for a non-web app", async () => {
      listAppsStub.resolves([androidApp]);

      const result: unknown = await command.runner()("1:123:android:456", { project: projectId });

      expect(listAppsStub).to.have.been.calledOnceWith(projectId, apps.AppPlatform.ANY);
      expect(setupCrashlyticsWebStub).to.not.have.been.called;
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match("Crashlytics setup via the CLI is currently only supported for Web apps."),
      );
      expect(result).to.be.undefined;
    });

    it("should identify a web app by appId format when not in listFirebaseApps", async () => {
      listAppsStub.resolves([]);

      const result: unknown = await command.runner()("1:999:web:999", { project: projectId });

      expect(setupCrashlyticsWebStub).to.have.been.calledOnceWith(
        projectId,
        "1:999:web:999",
        sinon.match({ project: projectId }),
      );
      expect(result).to.deep.equal(mockSetupResult);
      expect(loggerInfoStub).to.not.have.been.called;
    });

    it("should identify a non-web app by appId format when not in listFirebaseApps and skip setup", async () => {
      listAppsStub.resolves([]);

      const result: unknown = await command.runner()("1:999:android:999", { project: projectId });

      expect(setupCrashlyticsWebStub).to.not.have.been.called;
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match("Crashlytics setup via the CLI is currently only supported for Web apps."),
      );
      expect(result).to.be.undefined;
    });

    it("should skip setup for an unknown app ID format not in listFirebaseApps", async () => {
      listAppsStub.resolves([]);

      const result: unknown = await command.runner()("some-unknown-id", { project: projectId });

      expect(setupCrashlyticsWebStub).to.not.have.been.called;
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match("Crashlytics setup via the CLI is currently only supported for Web apps."),
      );
      expect(result).to.be.undefined;
    });

    it("should prefer positional appId over --app option if both are passed", async () => {
      listAppsStub.resolves([webApp, androidApp]);

      const result: unknown = await command.runner()("1:123:web:456", {
        project: projectId,
        app: "1:123:android:456",
      });

      expect(setupCrashlyticsWebStub).to.have.been.calledOnceWith(
        projectId,
        "1:123:web:456",
        sinon.match({ project: projectId, app: "1:123:android:456" }),
      );
      expect(result).to.deep.equal(mockSetupResult);
      expect(loggerInfoStub).to.not.have.been.called;
    });
  });

  describe("when appId is provided via --app option", () => {
    it("should set up Crashlytics using the --app flag", async () => {
      const result: unknown = await command.runner()({
        project: projectId,
        app: "1:123:web:456",
      });

      expect(listAppsStub).to.have.been.calledOnceWith(projectId, apps.AppPlatform.ANY);
      expect(setupCrashlyticsWebStub).to.have.been.calledOnceWith(
        projectId,
        "1:123:web:456",
        sinon.match({ project: projectId, app: "1:123:web:456" }),
      );
      expect(result).to.deep.equal(mockSetupResult);
    });
  });

  describe("when appId is not provided", () => {
    it("should throw if the project has no apps", async () => {
      listAppsStub.resolves([]);

      await expect(
        command.runner()({
          project: projectId,
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        /There are no apps associated with this Firebase project/,
      );

      expect(setupCrashlyticsWebStub).to.not.have.been.called;
    });

    it("should automatically select the app if exactly one app exists and it is a web app", async () => {
      listAppsStub.resolves([webApp]);

      const result: unknown = await command.runner()({
        project: projectId,
      });

      expect(selectAppStub).to.not.have.been.called;
      expect(setupCrashlyticsWebStub).to.have.been.calledOnceWith(
        projectId,
        "1:123:web:456",
        sinon.match({ project: projectId }),
      );
      expect(result).to.deep.equal(mockSetupResult);
    });

    it("should automatically select the app if exactly one app exists and skip if non-web", async () => {
      listAppsStub.resolves([androidApp]);

      const result: unknown = await command.runner()({
        project: projectId,
      });

      expect(selectAppStub).to.not.have.been.called;
      expect(setupCrashlyticsWebStub).to.not.have.been.called;
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match("Crashlytics setup via the CLI is currently only supported for Web apps."),
      );
      expect(result).to.be.undefined;
    });

    it("should throw in non-interactive mode if multiple apps exist", async () => {
      listAppsStub.resolves([webApp, androidApp]);

      await expect(
        command.runner()({
          project: projectId,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        `Project ${projectId} has multiple apps, must specify an app id.`,
      );

      expect(selectAppStub).to.not.have.been.called;
      expect(setupCrashlyticsWebStub).to.not.have.been.called;
    });

    it("should prompt user to select an app when multiple apps exist and proceed if web app is selected", async () => {
      listAppsStub.resolves([webApp, androidApp]);
      selectAppStub.resolves(webApp);

      const result: unknown = await command.runner()({
        project: projectId,
        interactive: true,
      });

      expect(selectAppStub).to.have.been.calledOnceWith([webApp, androidApp], apps.AppPlatform.ANY);
      expect(setupCrashlyticsWebStub).to.have.been.calledOnceWith(
        projectId,
        "1:123:web:456",
        sinon.match({ project: projectId }),
      );
      expect(result).to.deep.equal(mockSetupResult);
    });

    it("should prompt user to select an app when multiple apps exist and skip if non-web app is selected", async () => {
      listAppsStub.resolves([webApp, androidApp]);
      selectAppStub.resolves(androidApp);

      const result: unknown = await command.runner()({
        project: projectId,
        interactive: true,
      });

      expect(selectAppStub).to.have.been.calledOnceWith([webApp, androidApp], apps.AppPlatform.ANY);
      expect(setupCrashlyticsWebStub).to.not.have.been.called;
      expect(loggerInfoStub).to.have.been.calledWith(
        sinon.match("Crashlytics setup via the CLI is currently only supported for Web apps."),
      );
      expect(result).to.be.undefined;
    });
  });
});
