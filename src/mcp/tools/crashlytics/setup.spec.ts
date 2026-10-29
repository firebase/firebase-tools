import { expect } from "chai";
import * as sinon from "sinon";
import { setup } from "./setup";
import * as apps from "../../../management/apps";
import { McpContext } from "../../types";

function getText(result: Awaited<ReturnType<typeof setup.fn>>): string {
  const first = result.content[0];
  if (first && first.type === "text" && typeof first.text === "string") {
    return first.text;
  }
  throw new Error("Expected first content element to be text");
}

describe("setup tool", () => {
  let sandbox: sinon.SinonSandbox;
  let listFirebaseAppsStub: sinon.SinonStub;
  let getAppConfigStub: sinon.SinonStub;

  const baseMockContext: McpContext = {
    projectId: "",
    accountEmail: "test@example.com",
    config: {} as unknown as import("../../../config").Config,
    host: {
      logger: {
        debug: () => void 0,
        info: () => void 0,
        warn: () => void 0,
        error: () => void 0,
      },
    } as unknown as import("../../index").FirebaseMcpServer,
    rc: {} as unknown as import("../../../rc").RC,
    firebaseCliCommand: "firebase",
    isBillingEnabled: true,
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    listFirebaseAppsStub = sandbox.stub(apps, "listFirebaseApps");
    getAppConfigStub = sandbox.stub(apps, "getAppConfig");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should have isAvailable return true", async () => {
    const available = await setup.isAvailable(baseMockContext);
    expect(available).to.be.true;
  });

  it("should return the full setup guide with all frameworks when no options are provided", async () => {
    const result = await setup.fn({}, baseMockContext);

    expect(result.content).to.have.length(1);
    const text = getText(result);

    expect(text).to.include("Firebase Crashlytics for Web Apps - Setup Guide");
    expect(text).to.include("Crashlytics setup via this tool only applies to **Web apps**");
    expect(text).to.include("Step 1: Configure Firebase / Cloud Project");
    expect(text).to.include("Option 1: Using Firebase Console");
    expect(text).to.include("Option 2: Using Firebase CLI");
    expect(text).to.include("firebase crashlytics:setup");
    expect(text).to.include("Step 2: Core SDK Installation & Initialization");
    expect(text).to.include("npm install firebase");
    expect(text).to.include("Next.js Setup Guide");
    expect(text).to.include("React Setup Guide");
    expect(text).to.include("React Router (v6+) Setup Guide");
    expect(text).to.include("TanStack Router Setup Guide");
    expect(text).to.include("Angular Setup Guide");
    expect(text).to.include("Step 4: Force an Initial Crash");
    expect(text).to.include('throw new Error("Test Crash");');
    expect(text).to.include("Step 5: Source Map Uploading");
    expect(text).to.include("firebase crashlytics:sourcemap:upload");
    expect(text).to.include("Additional Configuration");
    expect(text).to.include("FIREBASE_TELEMETRY_DEBUG");
  });

  it("should return framework-specific guide when framework is nextjs", async () => {
    const result = await setup.fn({ framework: "nextjs" }, baseMockContext);
    const text = getText(result);

    expect(text).to.include("Next.js Setup Guide");
    expect(text).to.include("instrumentation-client.ts");
    expect(text).to.include("CrashlyticsProvider");
    expect(text).to.not.include("provideCrashlytics");
    expect(text).to.not.include("TanStack Router Setup Guide");
  });

  it("should return framework-specific guide when framework is react", async () => {
    const result = await setup.fn({ framework: "react" }, baseMockContext);
    const text = getText(result);

    expect(text).to.include("React Setup Guide (without React Router)");
    expect(text).to.include("<FirebaseCrashlytics firebaseApp={app}>");
    expect(text).to.not.include("instrumentation-client.ts");
    expect(text).to.not.include("provideCrashlytics");
  });

  it("should return framework-specific guide when framework is angular", async () => {
    const result = await setup.fn({ framework: "angular" }, baseMockContext);
    const text = getText(result);

    expect(text).to.include("Angular Setup Guide");
    expect(text).to.include("provideCrashlytics(() => app)");
    expect(text).to.not.include("instrumentation-client.ts");
  });

  it("should return framework-specific guide when framework is tanstack", async () => {
    const result = await setup.fn({ framework: "tanstack" }, baseMockContext);
    const text = getText(result);

    expect(text).to.include("TanStack Router Setup Guide");
    expect(text).to.include("defaultOnCatch: (error, errorInfo)");
  });

  it("should return framework-specific guide when framework is react-router", async () => {
    const result = await setup.fn({ framework: "react-router" }, baseMockContext);
    const text = getText(result);

    expect(text).to.include("React Router (v6+) Setup Guide");
    expect(text).to.include("<CrashlyticsRoutes firebaseApp={app}>");
  });

  it("should inject provided appId into commands and config template", async () => {
    const result = await setup.fn(
      { appId: "1:9999999999:web:testappid" },
      { ...baseMockContext, projectId: "my-custom-project" },
    );
    const text = getText(result);

    expect(text).to.include(
      "firebase crashlytics:setup 1:9999999999:web:testappid --project my-custom-project",
    );
    expect(text).to.include('appId: "1:9999999999:web:testappid"');
    expect(text).to.include('projectId: "my-custom-project"');
    expect(text).to.include(
      "firebase crashlytics:sourcemap:upload [buildOutputFolder] --app 1:9999999999:web:testappid --project my-custom-project",
    );
  });

  it("should detect web app from active project if appId is omitted", async () => {
    listFirebaseAppsStub.resolves([
      {
        name: "projects/my-proj/webApps/1:111:web:aaa",
        appId: "1:111:web:aaa",
        displayName: "My Web App",
        projectId: "my-proj",
        platform: apps.AppPlatform.WEB,
      },
    ]);

    const result = await setup.fn({}, { ...baseMockContext, projectId: "my-proj" });
    const text = getText(result);

    expect(listFirebaseAppsStub).to.have.been.calledWith("my-proj", apps.AppPlatform.ANY);
    expect(text).to.include("firebase crashlytics:setup 1:111:web:aaa --project my-proj");
    expect(text).to.include('appId: "1:111:web:aaa"');
  });

  it("should populate real SDK config values when getAppConfig succeeds", async () => {
    getAppConfigStub.resolves({
      apiKey: "AIzaSyFakeApiKey12345",
      projectId: "my-proj",
      appId: "1:111:web:aaa",
      authDomain: "my-proj.firebaseapp.com",
      storageBucket: "my-proj.firebasestorage.app",
      messagingSenderId: "111",
    });

    const result = await setup.fn(
      { appId: "1:111:web:aaa" },
      { ...baseMockContext, projectId: "my-proj" },
    );
    const text = getText(result);

    expect(getAppConfigStub).to.have.been.calledWith("1:111:web:aaa", apps.AppPlatform.WEB);
    expect(text).to.include('apiKey: "AIzaSyFakeApiKey12345"');
    expect(text).to.include('authDomain: "my-proj.firebaseapp.com"');
    expect(text).to.include('storageBucket: "my-proj.firebasestorage.app"');
  });

  it("should have correct metadata and humanReadableDescription", () => {
    expect(setup.mcp.name).to.equal("setup");
    expect(setup.mcp.humanReadableDescription).to.be.a("string").and.not.be.empty;
    expect(setup.mcp.annotations?.title).to.equal("Set up Crashlytics for Web");
    expect(setup.mcp.annotations?.readOnlyHint).to.be.true;
    expect(setup.mcp.annotations?.idempotentHint).to.be.true;
  });

  it("should note when multiple web apps are detected and default to the first", async () => {
    listFirebaseAppsStub.resolves([
      {
        name: "projects/my-proj/webApps/1:111:web:aaa",
        appId: "1:111:web:aaa",
        displayName: "Web App 1",
        projectId: "my-proj",
        platform: apps.AppPlatform.WEB,
      },
      {
        name: "projects/my-proj/webApps/1:222:web:bbb",
        appId: "1:222:web:bbb",
        displayName: "Web App 2",
        projectId: "my-proj",
        platform: apps.AppPlatform.WEB,
      },
    ]);

    const result = await setup.fn({}, { ...baseMockContext, projectId: "my-proj" });
    const text = getText(result);

    expect(text).to.include(
      "Multiple web apps found in project 'my-proj'. Defaulting to 1:111:web:aaa",
    );
    expect(text).to.include("1:222:web:bbb");
  });

  it("should fall back gracefully when listing apps fails", async () => {
    listFirebaseAppsStub.rejects(new Error("API network error"));

    const result = await setup.fn({}, { ...baseMockContext, projectId: "my-proj" });
    const text = getText(result);

    expect(text).to.include("<YOUR_FIREBASE_APP_ID>");
  });

  it("should fall back gracefully when getAppConfig fails", async () => {
    getAppConfigStub.rejects(new Error("App config fetch failed"));

    const result = await setup.fn(
      { appId: "1:111:web:aaa" },
      { ...baseMockContext, projectId: "my-proj" },
    );
    const text = getText(result);

    expect(text).to.include("<YOUR_FIREBASE_API_KEY>");
  });

  it("should return error when a non-web (Android) appId is provided", async () => {
    const result = await setup.fn({ appId: "1:9999999999:android:testappid" }, baseMockContext);

    expect(result.isError).to.be.true;
    expect(getText(result)).to.include(
      "Crashlytics setup is currently only supported for Web apps",
    );
    expect(getText(result)).to.include("1:9999999999:android:testappid");
  });

  it("should return error when a non-web (iOS) appId is provided", async () => {
    const result = await setup.fn({ appId: "1:9999999999:ios:testappid" }, baseMockContext);

    expect(result.isError).to.be.true;
    expect(getText(result)).to.include(
      "Crashlytics setup is currently only supported for Web apps",
    );
    expect(getText(result)).to.include("1:9999999999:ios:testappid");
  });

  it("should return error when project only contains non-web apps and appId is omitted", async () => {
    listFirebaseAppsStub.resolves([
      {
        name: "projects/my-proj/androidApps/1:111:android:aaa",
        appId: "1:111:android:aaa",
        displayName: "Android App",
        projectId: "my-proj",
        platform: apps.AppPlatform.ANDROID,
      },
    ]);

    const result = await setup.fn({}, { ...baseMockContext, projectId: "my-proj" });

    expect(result.isError).to.be.true;
    expect(getText(result)).to.include(
      "Crashlytics setup is currently only supported for Web apps",
    );
    expect(getText(result)).to.include("No Web apps found in project 'my-proj'");
  });

  it("should filter for web apps when project contains mixed platforms", async () => {
    listFirebaseAppsStub.resolves([
      {
        name: "projects/my-proj/androidApps/1:111:android:aaa",
        appId: "1:111:android:aaa",
        displayName: "Android App",
        projectId: "my-proj",
        platform: apps.AppPlatform.ANDROID,
      },
      {
        name: "projects/my-proj/webApps/1:222:web:bbb",
        appId: "1:222:web:bbb",
        displayName: "Web App",
        projectId: "my-proj",
        platform: apps.AppPlatform.WEB,
      },
    ]);

    const result = await setup.fn({}, { ...baseMockContext, projectId: "my-proj" });

    expect(result.isError).to.be.undefined;
    const text = getText(result);
    expect(text).to.include("1:222:web:bbb");
    expect(text).to.not.include("1:111:android:aaa");
  });
});
