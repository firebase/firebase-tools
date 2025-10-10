import * as chai from "chai";
import * as clc from "colorette";
import * as yaml from "js-yaml";
import {
  addSdkGenerateToConnectorYaml,
  chooseApp,
  askQuestions,
  actuate,
  FDC_SDK_PLATFORM_ENV,
  FDC_SDK_FRAMEWORKS_ENV,
  FDC_APP_FOLDER,
} from "./sdk";
import { Setup } from "../..";
import { ConnectorInfo, ConnectorYaml } from "../../../dataconnect/types";
import { App, Framework, Platform } from "../../../appUtils";
import * as appUtils from "../../../appUtils";
import * as createApp from "./create_app";
import * as sinon from "sinon";
import { Config } from "../../../config";
import { DataConnectEmulator } from "../../../emulator/dataconnectEmulator";
import * as dcLoad from "../../../dataconnect/load";
import * as fsutils from "../../../fsutils";
import * as auth from "../../../auth";
import * as utils from "../../../utils";
import * as prompt from "../../../prompt";

const expect = chai.expect;

describe("addSdkGenerateToConnectorYaml", () => {
  let connectorInfo: ConnectorInfo;
  let connectorYaml: ConnectorYaml;
  let app: App;

  beforeEach(() => {
    connectorInfo = {
      directory: "/users/test/project/dataconnect",
      connectorYaml: {
        connectorId: "test-connector",
      },
      connector: {} as any,
    };
    connectorYaml = {
      connectorId: "test-connector",
    };
    app = {
      directory: "/users/test/project/app",
      platform: Platform.WEB,
      frameworks: [],
    };
  });

  it("should add javascriptSdk for web platform", () => {
    addSdkGenerateToConnectorYaml(connectorInfo, connectorYaml, app);
    expect(connectorYaml.generate?.javascriptSdk).to.deep.equal([
      {
        outputDir: "../app/src/dataconnect-generated",
        package: "@dataconnect/generated",
        packageJsonDir: "../app",
        react: false,
        angular: false,
      },
    ]);
  });

  it("should add javascriptSdk with react for web platform", () => {
    app.frameworks = [Framework.REACT];
    addSdkGenerateToConnectorYaml(connectorInfo, connectorYaml, app);
    expect(connectorYaml.generate?.javascriptSdk).to.deep.equal([
      {
        outputDir: "../app/src/dataconnect-generated",
        package: "@dataconnect/generated",
        packageJsonDir: "../app",
        react: true,
        angular: false,
      },
    ]);
  });

  it("should add dartSdk for flutter platform", () => {
    app.platform = Platform.FLUTTER;
    addSdkGenerateToConnectorYaml(connectorInfo, connectorYaml, app);
    expect(connectorYaml.generate?.dartSdk).to.deep.equal([
      {
        outputDir: "../app/lib/dataconnect_generated",
        package: "dataconnect_generated",
      },
    ]);
  });

  it("should add kotlinSdk for android platform", () => {
    app.platform = Platform.ANDROID;
    addSdkGenerateToConnectorYaml(connectorInfo, connectorYaml, app);
    expect(connectorYaml.generate?.kotlinSdk).to.deep.equal([
      {
        outputDir: "../app/src/main/kotlin",
        package: "com.google.firebase.dataconnect.generated",
      },
    ]);
  });

  it("should add swiftSdk for ios platform", () => {
    app.platform = Platform.IOS;
    addSdkGenerateToConnectorYaml(connectorInfo, connectorYaml, app);
    expect(connectorYaml.generate?.swiftSdk).to.deep.equal([
      {
        outputDir: "../FirebaseDataConnectGenerated",
        package: "DataConnectGenerated",
      },
    ]);
  });
});

describe("chooseApp", () => {
  let detectAppsStub: sinon.SinonStub;
  let promptStub: sinon.SinonStub;

  beforeEach(() => {
    detectAppsStub = sinon.stub(appUtils, "detectApps");
    promptStub = sinon.stub(prompt, "checkbox");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should prompt user to choose from multiple apps", async () => {
    const apps: App[] = [
      { platform: Platform.WEB, directory: "web", frameworks: [Framework.REACT] },
      { platform: Platform.ANDROID, directory: "android" },
    ];
    detectAppsStub.resolves(apps);
    promptStub.resolves([
      { platform: Platform.WEB, directory: "web", frameworks: [Framework.REACT] },
    ]);

    const selectedApps = await chooseApp();

    expect(selectedApps).to.deep.equal([apps[0]]);
    expect(promptStub.calledOnce).to.be.true;
  });

  it("should use app from environment variables", async () => {
    process.env[FDC_APP_FOLDER] = "web";
    process.env[FDC_SDK_PLATFORM_ENV] = "WEB";
    const apps: App[] = [
      { platform: Platform.WEB, directory: "web", frameworks: [Framework.REACT] },
      { platform: Platform.ANDROID, directory: "android" },
    ];
    detectAppsStub.resolves(apps);

    const selectedApps = await chooseApp();

    expect(selectedApps).to.have.deep.members([apps[0]]);
    expect(promptStub.called).to.be.false;

    delete process.env[FDC_APP_FOLDER];
    delete process.env[FDC_SDK_PLATFORM_ENV];
  });

  it("should return a placeholder when no app matches environment variables", async () => {
    process.env[FDC_APP_FOLDER] = "web";
    process.env[FDC_SDK_PLATFORM_ENV] = "WEB";
    process.env[FDC_SDK_FRAMEWORKS_ENV] = "react,next";
    const apps: App[] = [
      { platform: Platform.IOS, directory: "ios" },
      { platform: Platform.ANDROID, directory: "android" },
    ];
    detectAppsStub.resolves(apps);

    const selectedApps = await chooseApp();

    expect(selectedApps).to.have.deep.members([
      {
        platform: Platform.WEB,
        directory: "web",
        frameworks: ["react", "next"],
      },
    ]);
    expect(promptStub.called).to.be.false;

    delete process.env[FDC_APP_FOLDER];
    delete process.env[FDC_SDK_PLATFORM_ENV];
    delete process.env[FDC_SDK_FRAMEWORKS_ENV];
  });

  it("should return empty array when no apps are found", async () => {
    detectAppsStub.resolves([]);

    const selectedApps = await chooseApp();

    expect(selectedApps).to.be.empty;
    expect(promptStub.called).to.be.false;
  });

  it("should deduplicate apps with the same platform and directory", async () => {
    const apps: App[] = [
      { platform: Platform.WEB, directory: "web", frameworks: [Framework.REACT], appId: "app1" },
      { platform: Platform.WEB, directory: "web", frameworks: [Framework.REACT], appId: "app2" },
      { platform: Platform.ANDROID, directory: "android" },
    ];
    const uniqueApps: App[] = [
      { platform: Platform.WEB, directory: "web", frameworks: [Framework.REACT] },
      { platform: Platform.ANDROID, directory: "android" },
    ];
    detectAppsStub.resolves(apps);
    promptStub.resolves([
      { platform: Platform.WEB, directory: "web", frameworks: [Framework.REACT] },
    ]);

    const selectedApps = await chooseApp();

    expect(promptStub.callCount).to.equal(1);
    const promptCall = promptStub.getCall(0);
    const appsPassedToCheckbox = promptCall.args[0].choices.map(
      (choice: prompt.Choice<App>) => choice.value,
    );
    expect(appsPassedToCheckbox).to.have.deep.members(uniqueApps);

    expect(selectedApps).to.deep.equal([
      { platform: Platform.WEB, directory: "web", frameworks: [Framework.REACT] },
    ]);
  });
});

describe("askQuestions", () => {
  let detectAppsStub: sinon.SinonStub;
  let selectStub: sinon.SinonStub;
  let createReactAppStub: sinon.SinonStub;
  let createNextAppStub: sinon.SinonStub;
  let createFlutterAppStub: sinon.SinonStub;
  let setup: Setup;

  beforeEach(() => {
    detectAppsStub = sinon.stub(appUtils, "detectApps");
    selectStub = sinon.stub(prompt, "select");
    createReactAppStub = sinon.stub(createApp, "createReactApp");
    createNextAppStub = sinon.stub(createApp, "createNextApp");
    createFlutterAppStub = sinon.stub(createApp, "createFlutterApp");
    setup = {
      config: {} as any,
      rcfile: {} as any,
      featureInfo: {
        dataconnectSdk: {
          apps: [],
        },
      },
      instructions: [],
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should call createReactApp when user chooses react", async () => {
    detectAppsStub.resolves([]);
    selectStub.resolves("react");
    createReactAppStub.resolves();

    await askQuestions(setup);

    expect(selectStub.calledOnce).to.be.true;
    expect(createReactAppStub.calledOnce).to.be.true;
    expect(createNextAppStub.called).to.be.false;
    expect(createFlutterAppStub.called).to.be.false;
  });

  it("should call createNextApp when user chooses next", async () => {
    detectAppsStub.resolves([]);
    selectStub.resolves("next");
    createNextAppStub.resolves();

    await askQuestions(setup);

    expect(selectStub.calledOnce).to.be.true;
    expect(createReactAppStub.called).to.be.false;
    expect(createNextAppStub.calledOnce).to.be.true;
    expect(createFlutterAppStub.called).to.be.false;
  });

  it("should call createFlutterApp when user chooses flutter", async () => {
    detectAppsStub.resolves([]);
    selectStub.resolves("flutter");
    createFlutterAppStub.resolves();

    await askQuestions(setup);

    expect(selectStub.calledOnce).to.be.true;
    expect(createReactAppStub.called).to.be.false;
    expect(createNextAppStub.called).to.be.false;
    expect(createFlutterAppStub.calledOnce).to.be.true;
  });

  it("should not prompt to create a new sample app if apps are found", async () => {
    const apps: App[] = [
      { platform: Platform.WEB, directory: "web", frameworks: [Framework.REACT] },
    ];
    detectAppsStub.resolves(apps);

    await askQuestions(setup);

    expect(selectStub.called).to.be.false;
    expect(createReactAppStub.called).to.be.false;
    expect(createNextAppStub.called).to.be.false;
    expect(createFlutterAppStub.called).to.be.false;
    expect(setup.featureInfo?.dataconnectSdk?.apps).to.deep.equal(apps);
  });
});

describe("actuate", () => {
  let setup: Setup;
  let config: Config;
  let detectAppsStub: sinon.SinonStub;
  let loadAllStub: sinon.SinonStub;
  let dirExistsSyncStub: sinon.SinonStub;
  let writeProjectFileStub: sinon.SinonStub;
  let generateStub: sinon.SinonStub;
  let getGlobalDefaultAccountStub: sinon.SinonStub;
  let logLabeledBulletStub: sinon.SinonStub;
  let logLabeledSuccessStub: sinon.SinonStub;
  let logLabeledErrorStub: sinon.SinonStub;
  let logLabeledWarningStub: sinon.SinonStub;
  let logBulletStub: sinon.SinonStub;

  beforeEach(() => {
    detectAppsStub = sinon.stub(appUtils, "detectApps");
    loadAllStub = sinon.stub(dcLoad, "loadAll");
    dirExistsSyncStub = sinon.stub(fsutils, "dirExistsSync");
    writeProjectFileStub = sinon.stub();
    generateStub = sinon.stub(DataConnectEmulator, "generate");
    getGlobalDefaultAccountStub = sinon.stub(auth, "getGlobalDefaultAccount");
    logLabeledBulletStub = sinon.stub(utils, "logLabeledBullet");
    logLabeledSuccessStub = sinon.stub(utils, "logLabeledSuccess");
    logLabeledErrorStub = sinon.stub(utils, "logLabeledError");
    logLabeledWarningStub = sinon.stub(utils, "logLabeledWarning");
    logBulletStub = sinon.stub(utils, "logBullet");

    setup = {
      config: { projectDir: "/path/to/project" } as any,
      rcfile: {} as any,
      featureInfo: {
        dataconnectSdk: {
          apps: [],
        },
      },
      instructions: [],
    };
    config = {
      writeProjectFile: writeProjectFileStub,
      projectDir: "/path/to/project",
      get: () => ({}),
      set: () => ({}),
      has: () => true,
      path: (p: string) => p,
      readProjectFile: () => ({}),
      projectFileExists: () => true,
      deleteProjectFile: () => ({}),
      confirmWriteProjectFile: async () => true,
      askWriteProjectFile: async () => ({}),
    } as unknown as Config;
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should log a message and exit if no apps are found", async () => {
    detectAppsStub.resolves([]);

    await actuate(setup, config);

    expect(
      logLabeledBulletStub.calledWith(
        "dataconnect",
        "No apps to setup Data Connect Generated SDKs",
      ),
    ).to.be.true;
    expect(writeProjectFileStub.called).to.be.false;
    expect(generateStub.called).to.be.false;
  });

  it("should detect apps if none are provided in setup", async () => {
    const apps: App[] = [{ platform: Platform.WEB, directory: "web", frameworks: [] }];
    detectAppsStub.resolves(apps);
    loadAllStub.resolves([
      {
        connectorInfo: [
          {
            directory: "dataconnect",
            connectorYaml: { connectorId: "test-connector" },
          },
        ],
        dataConnectYaml: { location: "us-central1", serviceId: "test-service" },
      },
    ]);
    dirExistsSyncStub.returns(true);
    getGlobalDefaultAccountStub.resolves({ email: "test@google.com" });

    await actuate(setup, config);

    expect(writeProjectFileStub.calledOnce).to.be.true;
    expect(generateStub.calledOnce).to.be.true;
  });

  it("should set up SDKs for provided apps", async () => {
    const apps: App[] = [
      { platform: Platform.WEB, directory: "webDir", frameworks: [] },
      { platform: Platform.ANDROID, directory: "androidDir" },
      { platform: Platform.IOS, directory: "iosDir" },
    ];
    setup.featureInfo?.dataconnectSdk?.apps.push(...apps);
    loadAllStub.resolves([
      {
        connectorInfo: [
          {
            directory: "dataconnect",
            connectorYaml: { connectorId: "test-connector" },
          },
        ],
        dataConnectYaml: { location: "us-central1", serviceId: "test-service" },
      },
    ]);
    dirExistsSyncStub.returns(true);
    getGlobalDefaultAccountStub.resolves({ email: "test@google.com" });

    await actuate(setup, config);

    expect(writeProjectFileStub.calledOnce).to.be.true;
    expect(generateStub.calledOnce).to.be.true;
    expect(logLabeledSuccessStub.calledOnce).to.be.true;
    expect(
      logLabeledSuccessStub.calledWith(
        "dataconnect",
        `Installed generated SDKs for ${clc.bold("webDir (web), androidDir (android), iosDir (ios)")}`,
      ),
    ).to.be.true;
  });

  it("should warn if an app directory does not exist", async () => {
    const apps: App[] = [{ platform: Platform.WEB, directory: "web", frameworks: [] }];
    setup.featureInfo?.dataconnectSdk?.apps.push(...apps);
    loadAllStub.resolves([
      {
        connectorInfo: [
          {
            directory: "dataconnect",
            connectorYaml: { connectorId: "test-connector" },
          },
        ],
        dataConnectYaml: { location: "us-central1", serviceId: "test-service" },
      },
    ]);
    dirExistsSyncStub.returns(false);
    getGlobalDefaultAccountStub.resolves({ email: "test@google.com" });

    await actuate(setup, config);

    expect(logLabeledWarningStub.calledWith("dataconnect", "App directory web does not exist")).to
      .be.true;
    expect(writeProjectFileStub.calledOnce).to.be.true;
    expect(generateStub.calledOnce).to.be.true;
  });

  it("should handle SDK generation failure", async () => {
    const apps: App[] = [{ platform: Platform.WEB, directory: "web", frameworks: [] }];
    setup.featureInfo?.dataconnectSdk?.apps.push(...apps);
    loadAllStub.resolves([
      {
        connectorInfo: [
          {
            directory: "dataconnect",
            connectorYaml: { connectorId: "test-connector" },
          },
        ],
        dataConnectYaml: { location: "us-central1", serviceId: "test-service" },
      },
    ]);
    dirExistsSyncStub.returns(true);
    getGlobalDefaultAccountStub.resolves({ email: "test@google.com" });
    generateStub.throws(new Error("SDK generation failed"));

    await actuate(setup, config);

    expect(writeProjectFileStub.calledOnce).to.be.true;
    expect(
      logLabeledErrorStub.calledWith(
        "dataconnect",
        "Failed to generate Data Connect SDKs\nSDK generation failed",
      ),
    ).to.be.true;
  });

  it("should log platform-specific instructions", async () => {
    const apps: App[] = [
      { platform: Platform.IOS, directory: "ios" },
      { platform: Platform.WEB, directory: "web-react", frameworks: [Framework.REACT] },
      { platform: Platform.WEB, directory: "web-angular", frameworks: [Framework.ANGULAR] },
    ];
    setup.featureInfo?.dataconnectSdk?.apps.push(...apps);
    loadAllStub.resolves([
      {
        connectorInfo: [
          {
            directory: "dataconnect",
            connectorYaml: { connectorId: "test-connector" },
          },
        ],
        dataConnectYaml: { location: "us-central1", serviceId: "test-service" },
      },
    ]);
    dirExistsSyncStub.returns(true);
    getGlobalDefaultAccountStub.resolves({ email: "test@google.com" });

    await actuate(setup, config);

    expect(
      logBulletStub.calledWith(
        clc.bold(
          "Please follow the instructions here to add your generated sdk to your XCode project:\n\thttps://firebase.google.com/docs/data-connect/ios-sdk#set-client",
        ),
      ),
    ).to.be.true;
    expect(
      logBulletStub.calledWith(
        "Visit https://firebase.google.com/docs/data-connect/web-sdk#react for more information on how to set up React Generated SDKs for Firebase Data Connect",
      ),
    ).to.be.true;
    expect(
      logBulletStub.calledWith(
        "Run `ng add @angular/fire` to install angular sdk dependencies.\nVisit https://github.com/invertase/tanstack-query-firebase/tree/main/packages/angular for more information on how to set up Angular Generated SDKs for Firebase Data Connect",
      ),
    ).to.be.true;
  });

  it("should deduplicate apps when writing connector.yaml", async () => {
    const apps: App[] = [
      { platform: Platform.WEB, directory: "web", frameworks: [], appId: "app1" },
      { platform: Platform.WEB, directory: "web", frameworks: [], appId: "app2" },
    ];
    setup.featureInfo?.dataconnectSdk?.apps.push(...apps);
    loadAllStub.resolves([
      {
        connectorInfo: [
          {
            directory: "dataconnect",
            connectorYaml: { connectorId: "test-connector" },
          },
        ],
        dataConnectYaml: { location: "us-central1", serviceId: "test-service" },
      },
    ]);
    dirExistsSyncStub.returns(true);
    getGlobalDefaultAccountStub.resolves({ email: "test@google.com" });

    await actuate(setup, config);

    const writtenYaml = writeProjectFileStub.getCall(0).args[1];
    const parsedYaml = yaml.load(writtenYaml);
    expect(parsedYaml.generate.javascriptSdk).to.have.lengthOf(1);
  });
});
