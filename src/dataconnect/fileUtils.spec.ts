import { expect } from "chai";
import { getPlatformFromFolder, generateSdkYaml } from "./fileUtils";
import { ConnectorYaml, Platform } from "./types";
import * as mockfs from "mock-fs";
import FileSystem from "mock-fs/lib/filesystem";

describe("getPlatformFromFolder", () => {
  const cases: {
    desc: string;
    folderName: string;
    folderItems: FileSystem.DirectoryItems;
    output: Platform;
  }[] = [
    {
      desc: "Empty folder",
      folderName: "test/",
      folderItems: {},
      output: Platform.UNDETERMINED,
    },
    {
      desc: "Empty folder, long path name",
      folderName: "root/abcd/test/",
      folderItems: {},
      output: Platform.UNDETERMINED,
    },
    {
      desc: "folder w/ no identifier",
      folderName: "test/",
      folderItems: { file1: "contents", randomfile2: "my android contents" },
      output: Platform.UNDETERMINED,
    },
    {
      desc: "Web identifier 1",
      folderName: "test/",
      folderItems: { file1: "contents", "package.json": "node" },
      output: Platform.WEB,
    },
    {
      desc: "Web identifier 2",
      folderName: "test/",
      folderItems: { file1: "contents", node_modules: { dep1: "firebase", dep2: "dataconnect" } },
      output: Platform.WEB,
    },
    {
      desc: "Android identifier 1",
      folderName: "/test",
      folderItems: { file1: "contents", "androidmanifest.xml": "my android contents" },
      output: Platform.ANDROID,
    },
    {
      desc: "Android identifier 2",
      folderName: "/test/",
      folderItems: {
        "build.gradle": "contents",
        file2: "my android contents",
      },
      output: Platform.ANDROID,
    },
    {
      desc: "Android identifier, long path name",
      folderName: "is/this/an/android/test",
      folderItems: { file1: "contents", "androidmanifest.xml": "my android contents" },
      output: Platform.ANDROID,
    },
    {
      desc: "iOS file identifier 1",
      folderName: "test/",
      folderItems: { file1: "contents", podfile: "cocoa pods yummy" },
      output: Platform.IOS,
    },
    {
      desc: "iOS file identifier 2",
      folderName: "root/abcd",
      folderItems: {
        file1: "ios",
        "myapp.xcodeproj": "folder in an xcode folder",
      },
      output: Platform.IOS,
    },
    {
      desc: "iOS folder identifier 3",
      folderName: "/users/googler/myprojects",
      folderItems: {
        "myapp.xcworkspace": { file1: "contents" },
      },
      output: Platform.IOS,
    },
    {
      desc: "multiple identifiers, returns undetermined",
      folderName: "test/",
      folderItems: {
        file1: "contents",
        podfile: "cocoa pods yummy",
        "androidmanifest.xml": "file found second :(",
      },
      output: Platform.UNDETERMINED,
    },
  ];
  for (const c of cases) {
    it(c.desc, async () => {
      mockfs({ [c.folderName]: c.folderItems });
      const platform = await getPlatformFromFolder(c.folderName);
      expect(platform).to.equal(c.output);
    });
    afterEach(() => {
      mockfs.restore();
    });
  }
});

describe("generateSdkYaml", () => {
  // Test Data
  const sampleConnectorYaml: ConnectorYaml = {
    connectorId: "test_connector",
    generate: {},
  };
  const appFolder = "/my/app/folder";
  const connectorYamlFolder = "/my/app/folder/connectors/";

  it("should add JavaScript SDK generation for WEB platform", () => {
    const modifiedYaml = generateSdkYaml(
      Platform.WEB,
      sampleConnectorYaml,
      connectorYamlFolder,
      appFolder,
    );
    expect(modifiedYaml.generate?.javascriptSdk).to.deep.equal({
      outputDir: "../dataconnect-generated",
      package: "@firebasegen/test_connector",
      packageJsonDir: appFolder,
    });
  });

  it("should add Swift SDK generation for IOS platform", () => {
    const modifiedYaml = generateSdkYaml(
      Platform.IOS,
      sampleConnectorYaml,
      connectorYamlFolder,
      appFolder,
    );
    expect(modifiedYaml.generate?.swiftSdk).to.deep.equal({
      outputDir: "../dataconnect-generated",
      package: "test_connector",
    });
  });

  it("should add Kotlin SDK generation for ANDROID platform", () => {
    const modifiedYaml = generateSdkYaml(
      Platform.ANDROID,
      sampleConnectorYaml,
      connectorYamlFolder,
      appFolder,
    );
    expect(modifiedYaml.generate?.kotlinSdk).to.deep.equal({
      outputDir: "../dataconnect-generated",
      package: "connectors.test_connector",
    });
  });

  it("should create generate object if it doesn't exist", () => {
    const yamlWithoutGenerate: ConnectorYaml = { connectorId: "test_connector" };
    const modifiedYaml = generateSdkYaml(
      Platform.WEB,
      yamlWithoutGenerate,
      connectorYamlFolder,
      appFolder,
    );
    expect(modifiedYaml.generate).to.exist;
  });

  it("should not modify yaml for unknown platforms", () => {
    const unknownPlatform = "unknown" as Platform; // Type assertion for test
    const modifiedYaml = generateSdkYaml(
      unknownPlatform,
      sampleConnectorYaml,
      connectorYamlFolder,
      appFolder,
    );
    expect(modifiedYaml).to.deep.equal(sampleConnectorYaml); // No changes
  });

  it("should handle relative paths", () => {
    const sameFolder = "/my/app/folder/connectors";
    const modifiedYaml1 = generateSdkYaml(
      Platform.ANDROID,
      sampleConnectorYaml,
      connectorYamlFolder,
      sameFolder,
    );
    expect(modifiedYaml1.generate?.kotlinSdk).to.deep.equal({
      outputDir: "dataconnect-generated",
      package: "connectors.test_connector",
    });

    const appFolderDown = "/my/app/folder/connectors/belowConnector";
    const modifiedYaml2 = generateSdkYaml(
      Platform.ANDROID,
      sampleConnectorYaml,
      connectorYamlFolder,
      appFolderDown,
    );
    expect(modifiedYaml2.generate?.kotlinSdk).to.deep.equal({
      outputDir: "belowConnector/dataconnect-generated",
      package: "connectors.test_connector",
    });
  });
});
