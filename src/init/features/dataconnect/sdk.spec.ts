import * as chai from "chai";
import { addSdkGenerateToConnectorYaml } from "./sdk";
import { ConnectorInfo, ConnectorYaml, Platform } from "../../../dataconnect/types";
import { App } from "../../../dataconnect/appFinder";

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
    app.frameworks = ["react"];
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

  it("should throw error for unsupported platform", () => {
    app.platform = Platform.NONE;
    expect(() => addSdkGenerateToConnectorYaml(connectorInfo, connectorYaml, app)).to.throw(
      "Unsupported platform",
    );
  });
});
