import * as mockfs from "mock-fs";

import { expect } from "chai";
import { getPlatformFromFolder } from "./fileUtils";
import { generateSdkYaml } from "../init/features/dataconnect/sdk";
import { ConnectorYaml, Platform } from "./types";
import FileSystem from "mock-fs/lib/filesystem";
import { DartSDK } from '../../clean/src/dataconnect/types';

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
      desc: "Dart identifier 1",
      folderName: "is/this/a/dart/test",
      folderItems: {
        file1: "contents",
        "pubspec.yaml": "my deps",
      },
      output: Platform.DART,
    },
    {
      desc: "Dart identifier 2",
      folderName: "is/this/a/dart/test",
      folderItems: {
        "pubspec.lock": "my deps",
      },
      output: Platform.DART,
    },
    {
      desc: "Dart identifier with experiment disabled",
      folderName: "is/this/a/dart/test",
      folderItems: {
        "pubspec.mispelled": "my deps",
      },
      output: Platform.UNDETERMINED,
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
    connectorId: "test-connector",
    generate: {},
  };
  const appFolder = "/my/app/folder";
  const appFolderBelowConnector = "/my/app/folder/connectors/belowConnector";
  const appFolderOutside = "/my/app/outside";
  const connectorYamlFolder = "/my/app/folder/connectors/";

  describe("Web platform", () => {
    it("should add JavaScript SDK generation", () => {
      const modifiedYaml = generateSdkYaml(
        Platform.WEB,
        sampleConnectorYaml,
        connectorYamlFolder,
        appFolder,
      );
      expect(modifiedYaml.generate?.javascriptSdk).to.deep.equal({
        outputDir: "../dataconnect-generated/js",
        package: "@firebasegen/test-connector",
      });
    });
    it("should add JavaScript SDK generation and link packageJsonDir", () => {
      mockfs({ "/my/app/folder": { ["package.json"]: "{}" } });
      const modifiedYaml = generateSdkYaml(
        Platform.WEB,
        sampleConnectorYaml,
        connectorYamlFolder,
        appFolder,
      );
      expect(modifiedYaml.generate?.javascriptSdk).to.deep.equal({
        outputDir: "../dataconnect-generated/js",
        package: "@firebasegen/test-connector",
        packageJsonDir: "..", // use relative path!
      });
    });

    it("should add JavaScript SDK generation to sub folder", () => {
      const modifiedYaml = generateSdkYaml(
        Platform.WEB,
        sampleConnectorYaml,
        connectorYamlFolder,
        appFolderBelowConnector,
      );
      expect(modifiedYaml.generate?.javascriptSdk).to.deep.equal({
        outputDir: "belowConnector/dataconnect-generated/js",
        package: "@firebasegen/test-connector",
      });
    });
    it("should add JavaScript SDK generation to outside folder", () => {
      const modifiedYaml = generateSdkYaml(
        Platform.WEB,
        sampleConnectorYaml,
        connectorYamlFolder,
        appFolderOutside,
      );
      expect(modifiedYaml.generate?.javascriptSdk).to.deep.equal({
        outputDir: "../../outside/dataconnect-generated/js",
        package: "@firebasegen/test-connector",
      });
    });
  });

  describe("IOS platform", () => {
    it("should add Swift SDK generation", () => {
      const modifiedYaml = generateSdkYaml(
        Platform.IOS,
        sampleConnectorYaml,
        connectorYamlFolder,
        appFolder,
      );
      expect(modifiedYaml.generate?.swiftSdk).to.deep.equal({
        outputDir: "../dataconnect-generated/swift",
        package: "TestConnector",
      });
    });

    it("should add Swift SDK generation to sub folder", () => {
      const modifiedYaml = generateSdkYaml(
        Platform.IOS,
        sampleConnectorYaml,
        connectorYamlFolder,
        appFolderBelowConnector,
      );
      expect(modifiedYaml.generate?.swiftSdk).to.deep.equal({
        outputDir: "belowConnector/dataconnect-generated/swift",
        package: "TestConnector",
      });
    });
    it("should add Swift SDK generation to outside folder", () => {
      const modifiedYaml = generateSdkYaml(
        Platform.IOS,
        sampleConnectorYaml,
        connectorYamlFolder,
        appFolderOutside,
      );
      expect(modifiedYaml.generate?.swiftSdk).to.deep.equal({
        outputDir: "../../outside/dataconnect-generated/swift",
        package: "TestConnector",
      });
    });
  });

  describe("ANDROID platform", () => {
    it("should add Kotlin SDK generation", () => {
      const modifiedYaml = generateSdkYaml(
        Platform.ANDROID,
        sampleConnectorYaml,
        connectorYamlFolder,
        appFolder,
      );
      expect(modifiedYaml.generate?.kotlinSdk).to.deep.equal({
        outputDir: "../dataconnect-generated/kotlin",
        package: "connectors.test_connector",
      });
    });
    it("should prefer android app folder", () => {
      mockfs({ "/my/app/folder/app/src/main/java": {} });
      const modifiedYaml1 = generateSdkYaml(
        Platform.ANDROID,
        sampleConnectorYaml,
        connectorYamlFolder,
        appFolder,
      );
      expect(modifiedYaml1.generate?.kotlinSdk).to.deep.equal({
        outputDir: "../app/src/main/java",
        package: "connectors.test_connector",
      });

      mockfs({ "/my/app/folder/app/src/main/kotlin": {} });
      const modifiedYaml2 = generateSdkYaml(
        Platform.ANDROID,
        sampleConnectorYaml,
        connectorYamlFolder,
        appFolder,
      );
      expect(modifiedYaml2.generate?.kotlinSdk).to.deep.equal({
        outputDir: "../app/src/main/kotlin", // Pick kotlin if both are present.
        package: "connectors.test_connector",
      });
    });

    it("should add Kotlin SDK generation to sub folder", () => {
      const modifiedYaml = generateSdkYaml(
        Platform.ANDROID,
        sampleConnectorYaml,
        connectorYamlFolder,
        appFolderBelowConnector,
      );
      expect(modifiedYaml.generate?.kotlinSdk).to.deep.equal({
        outputDir: "belowConnector/dataconnect-generated/kotlin",
        package: "connectors.test_connector",
      });
    });
    it("should add Kotlin SDK generation to outside folder", () => {
      const modifiedYaml = generateSdkYaml(
        Platform.ANDROID,
        sampleConnectorYaml,
        connectorYamlFolder,
        appFolderOutside,
      );
      expect(modifiedYaml.generate?.kotlinSdk).to.deep.equal({
        outputDir: "../../outside/dataconnect-generated/kotlin",
        package: "connectors.test_connector",
      });
    });
  });

  describe("DART platform", () => {
    it("should add Dart SDK generation for DART platform", () => {
      const modifiedYaml = generateSdkYaml(
        Platform.DART,
        sampleConnectorYaml,
        connectorYamlFolder,
        appFolder,
      );
      expect(modifiedYaml.generate?.dartSdk).to.deep.equal({
        outputDir: "../dataconnect-generated/dart",
        package: "test-connector",
      });
    });

    it("should add Dart SDK generation to sub folder", () => {
      const modifiedYaml = generateSdkYaml(
        Platform.DART,
        sampleConnectorYaml,
        connectorYamlFolder,
        appFolderBelowConnector,
      );
      expect(modifiedYaml.generate?.dartSdk).to.deep.equal({
        outputDir: "belowConnector/dataconnect-generated/dart",
        package: "test-connector",
      });
    });
    it("should add Dart SDK generation to outside folder", () => {
      const modifiedYaml = generateSdkYaml(
        Platform.DART,
        sampleConnectorYaml,
        connectorYamlFolder,
        appFolderOutside,
      );
      expect(modifiedYaml.generate?.dartSdk).to.deep.equal({
        outputDir: "../../outside/dataconnect-generated/dart",
        package: "test-connector",
      });
    });
  });

  it("should create generate object if it doesn't exist", () => {
    const yamlWithoutGenerate: ConnectorYaml = { connectorId: "test-connector" };
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
  afterEach(() => {
    mockfs.restore();
  });
});
