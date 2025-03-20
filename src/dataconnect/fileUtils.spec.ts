import * as mockfs from "mock-fs";

import { expect } from "chai";
import { frameworksMap, getPlatformFromFolder, SUPPORTED_FRAMEWORKS } from "./fileUtils";
import { generateSdkYaml } from "../init/features/dataconnect/sdk";
import { ConnectorYaml, Platform } from "./types";
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
      output: Platform.NONE,
    },
    {
      desc: "Empty folder, long path name",
      folderName: "root/abcd/test/",
      folderItems: {},
      output: Platform.NONE,
    },
    {
      desc: "folder w/ no identifier",
      folderName: "test/",
      folderItems: { file1: "contents", randomfile2: "my android contents" },
      output: Platform.NONE,
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
      desc: "Flutter identifier 1",
      folderName: "is/this/a/dart/test",
      folderItems: {
        file1: "contents",
        "pubspec.yaml": "my deps",
      },
      output: Platform.FLUTTER,
    },
    {
      desc: "Flutter identifier 2",
      folderName: "is/this/a/dart/test",
      folderItems: {
        "pubspec.lock": "my deps",
      },
      output: Platform.FLUTTER,
    },
    {
      desc: "Flutter identifier with experiment disabled",
      folderName: "is/this/a/dart/test",
      folderItems: {
        "pubspec.mispelled": "my deps",
      },
      output: Platform.NONE,
    },
    {
      desc: "multiple identifiers, returns undetermined",
      folderName: "test/",
      folderItems: {
        file1: "contents",
        podfile: "cocoa pods yummy",
        "androidmanifest.xml": "file found second :(",
      },
      output: Platform.MULTIPLE,
    },
  ];
  for (const c of cases) {
    it(c.desc, async () => {
      mockfs({ [c.folderName]: c.folderItems });
      const platform = await getPlatformFromFolder(c.folderName);
      expect(platform).to.equal(c.output);
    });
  }
  afterEach(() => {
    mockfs.restore();
  });
});

describe("generateSdkYaml", () => {
  // Test Data
  function getSampleConnectorYaml(): ConnectorYaml {
    return {
      connectorId: "default",
      generate: {},
    };
  }
  const connectorYamlFolder = "/my/app/folder/connector";

  const appFolderBase = "/my/app/folder";
  const appFolderDetectable = "/my/app/folder/detected";
  const appFolderBelowConnector = "/my/app/folder/connector/belowConnector";
  const appFolderOutside = "/my/app/outside";

  describe("Web platform should add JavaScript SDK Generation", () => {
    const cases: {
      desc: string;
      appDir: string;
      output: any;
    }[] = [
      {
        desc: "basic",
        appDir: appFolderBase,
        output: {
          outputDir: "../dataconnect-generated/js/default-connector",
          package: "@firebasegen/default-connector",
          packageJsonDir: "..",
        },
      },
      {
        desc: "has package.json",
        appDir: appFolderDetectable,
        output: {
          outputDir: "../detected/dataconnect-generated/js/default-connector",
          package: "@firebasegen/default-connector",
          packageJsonDir: "../detected",
        },
      },
      {
        desc: "below connector",
        appDir: appFolderBelowConnector,
        output: {
          outputDir: "belowConnector/dataconnect-generated/js/default-connector",
          package: "@firebasegen/default-connector",
          packageJsonDir: "belowConnector",
        },
      },
      {
        desc: "outside",
        appDir: appFolderOutside,
        output: {
          outputDir: "../../outside/dataconnect-generated/js/default-connector",
          package: "@firebasegen/default-connector",
          packageJsonDir: "../../outside",
        },
      },
    ];
    for (const c of cases) {
      it(c.desc, async () => {
        mockfs({ [appFolderDetectable]: { ["package.json"]: "{}" } });
        const modifiedYaml = await generateSdkYaml(
          Platform.WEB,
          getSampleConnectorYaml(),
          connectorYamlFolder,
          c.appDir,
        );
        expect(modifiedYaml.generate?.javascriptSdk).to.deep.equal(c.output);
      });
    }
  });
  for (const f of SUPPORTED_FRAMEWORKS) {
    describe(`Check support for ${f} framework`, () => {
      const cases = [
        {
          desc: `can detect a ${f}`,
          deps: frameworksMap[f],
          detect: true,
        },
        {
          desc: `can detect not ${f}`,
          deps: `not-${f}`,
        },
      ];
      async function testDependency(dep: string, shouldDetect: boolean | undefined) {
        mockfs({
          [appFolderDetectable]: {
            ["package.json"]: `{"dependencies": {"${dep}": "1"}}`,
          },
        });
        const modifiedYaml = await generateSdkYaml(
          Platform.WEB,
          getSampleConnectorYaml(),
          connectorYamlFolder,
          appFolderDetectable,
        );
        console.log(`{"dependencies": {"${dep}": "1"}}`);
        expect(modifiedYaml.generate?.javascriptSdk?.[f]).to.equal(shouldDetect);
      }
      for (const c of cases) {
        it(c.desc, async () => {
          if (Array.isArray(c.deps)) {
            for (const dep of c.deps) {
              await testDependency(dep, c.detect);
            }
          } else {
            await testDependency(c.deps as string, c.detect);
          }
        });
      }
    });
  }

  describe("IOS platform should add Swift SDK Generation", () => {
    const cases: {
      desc: string;
      appDir: string;
      output: any;
    }[] = [
      {
        desc: "basic",
        appDir: appFolderBase,
        output: {
          outputDir: "../dataconnect-generated/swift",
          package: "DefaultConnector",
        },
      },
      {
        desc: "below connector",
        appDir: appFolderBelowConnector,
        output: {
          outputDir: "belowConnector/dataconnect-generated/swift",
          package: "DefaultConnector",
        },
      },
      {
        desc: "outside",
        appDir: appFolderOutside,
        output: {
          outputDir: "../../outside/dataconnect-generated/swift",
          package: "DefaultConnector",
        },
      },
    ];
    for (const c of cases) {
      it(c.desc, async () => {
        const modifiedYaml = await generateSdkYaml(
          Platform.IOS,
          getSampleConnectorYaml(),
          connectorYamlFolder,
          c.appDir,
        );
        expect(modifiedYaml.generate?.swiftSdk).to.deep.equal(c.output);
      });
    }
  });

  describe("Android platform should add Kotlin SDK Generation", () => {
    const appFolderHasJava = "/my/app/folder/has-java";
    const appFolderHasKotlin = "/my/app/folder/has-kotlin";
    const appFolderHasBoth = "/my/app/folder/has-both";
    const cases: {
      desc: string;
      appDir: string;
      output: any;
    }[] = [
      {
        desc: "basic",
        appDir: appFolderBase,
        output: {
          outputDir: "../dataconnect-generated/kotlin",
          package: "connectors.default",
        },
      },
      {
        desc: "has java folder",
        appDir: appFolderHasJava,
        output: {
          outputDir: "../has-java/app/src/main/java",
          package: "connectors.default",
        },
      },
      {
        desc: "has kotlin folder",
        appDir: appFolderHasKotlin,
        output: {
          outputDir: "../has-kotlin/app/src/main/kotlin",
          package: "connectors.default",
        },
      },
      {
        desc: "prefer kotlin folder over java folder",
        appDir: appFolderHasBoth,
        output: {
          outputDir: "../has-both/app/src/main/kotlin",
          package: "connectors.default",
        },
      },
      {
        desc: "below connector",
        appDir: appFolderBelowConnector,
        output: {
          outputDir: "belowConnector/dataconnect-generated/kotlin",
          package: "connectors.default",
        },
      },
      {
        desc: "outside",
        appDir: appFolderOutside,
        output: {
          outputDir: "../../outside/dataconnect-generated/kotlin",
          package: "connectors.default",
        },
      },
    ];
    for (const c of cases) {
      it(c.desc, async () => {
        mockfs({
          [appFolderHasJava + "/app/src/main/java"]: {},
          [appFolderHasKotlin + "/app/src/main/kotlin"]: {},
          [appFolderHasBoth + "/app/src/main/java"]: {},
          [appFolderHasBoth + "/app/src/main/kotlin"]: {},
        });
        const modifiedYaml = await generateSdkYaml(
          Platform.ANDROID,
          getSampleConnectorYaml(),
          connectorYamlFolder,
          c.appDir,
        );
        expect(modifiedYaml.generate?.kotlinSdk).to.deep.equal(c.output);
      });
    }
  });

  describe("Flutter platform should add Dart SDK Generation", () => {
    const cases: {
      desc: string;
      appDir: string;
      output: any;
    }[] = [
      {
        desc: "basic",
        appDir: appFolderBase,
        output: {
          outputDir: "../dataconnect-generated/dart/default_connector",
          package: "default_connector",
        },
      },
      {
        desc: "below connector",
        appDir: appFolderBelowConnector,
        output: {
          outputDir: "belowConnector/dataconnect-generated/dart/default_connector",
          package: "default_connector",
        },
      },
      {
        desc: "outside",
        appDir: appFolderOutside,
        output: {
          outputDir: "../../outside/dataconnect-generated/dart/default_connector",
          package: "default_connector",
        },
      },
    ];
    for (const c of cases) {
      it(c.desc, async () => {
        const modifiedYaml = await generateSdkYaml(
          Platform.FLUTTER,
          getSampleConnectorYaml(),
          connectorYamlFolder,
          c.appDir,
        );
        expect(modifiedYaml.generate?.dartSdk).to.deep.equal(c.output);
      });
    }
  });

  it("should create generate object if it doesn't exist", async () => {
    const yamlWithoutGenerate: ConnectorYaml = { connectorId: "default-connector" };
    const modifiedYaml = await generateSdkYaml(
      Platform.WEB,
      yamlWithoutGenerate,
      connectorYamlFolder,
      appFolderBase,
    );
    expect(modifiedYaml.generate).to.exist;
  });

  it("should not modify yaml for unknown platforms", async () => {
    const unknownPlatform = "unknown" as Platform; // Type assertion for test
    const modifiedYaml = await generateSdkYaml(
      unknownPlatform,
      getSampleConnectorYaml(),
      connectorYamlFolder,
      appFolderBase,
    );
    expect(modifiedYaml).to.deep.equal(getSampleConnectorYaml()); // No changes
  });

  afterEach(() => {
    mockfs.restore();
  });
});
