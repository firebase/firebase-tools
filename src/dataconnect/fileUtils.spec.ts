// import * as mockfs from "mock-fs";

// import { expect } from "chai";
// import { WEB_FRAMEWORKS_SIGNALS, WEB_FRAMEWORKS } from "./appFinder";
// import { generateSdkYaml } from "../init/features/dataconnect/sdk";
// import { ConnectorYaml, Platform } from "./types";

// describe("generateSdkYaml", () => {
//   // Test Data
//   function getSampleConnectorYaml(): ConnectorYaml {
//     return {
//       connectorId: "default",
//       generate: {},
//     };
//   }
//   const connectorYamlFolder = "/my/app/folder/connector";

//   const appFolderBase = "/my/app/folder";
//   const appFolderDetectable = "/my/app/folder/detected";
//   const appFolderBelowConnector = "/my/app/folder/connector/belowConnector";
//   const appFolderOutside = "/my/app/outside";

//   describe("Web platform should add JavaScript SDK Generation", () => {
//     const cases: {
//       desc: string;
//       appDir: string;
//       output: any;
//     }[] = [
//       {
//         desc: "basic",
//         appDir: appFolderBase,
//         output: {
//           outputDir: "../dataconnect-generated/js/default-connector",
//           package: "@dataconnect/generated",
//           packageJsonDir: "..",
//         },
//       },
//       {
//         desc: "has package.json",
//         appDir: appFolderDetectable,
//         output: {
//           outputDir: "../detected/dataconnect-generated/js/default-connector",
//           package: "@dataconnect/generated",
//           packageJsonDir: "../detected",
//         },
//       },
//       {
//         desc: "below connector",
//         appDir: appFolderBelowConnector,
//         output: {
//           outputDir: "belowConnector/dataconnect-generated/js/default-connector",
//           package: "@dataconnect/generated",
//           packageJsonDir: "belowConnector",
//         },
//       },
//       {
//         desc: "outside",
//         appDir: appFolderOutside,
//         output: {
//           outputDir: "../../outside/dataconnect-generated/js/default-connector",
//           package: "@dataconnect/generated",
//           packageJsonDir: "../../outside",
//         },
//       },
//     ];
//     for (const c of cases) {
//       it(c.desc, async () => {
//         mockfs({ [appFolderDetectable]: { ["package.json"]: "{}" } });
//         const modifiedYaml = await generateSdkYaml(
//           Platform.WEB,
//           getSampleConnectorYaml(),
//           connectorYamlFolder,
//           c.appDir,
//         );
//         expect(modifiedYaml.generate?.javascriptSdk).to.deep.equal(c.output);
//       });
//     }
//   });
//   for (const f of WEB_FRAMEWORKS) {
//     describe(`Check support for ${f} framework`, () => {
//       const cases = [
//         {
//           desc: `can detect a ${f}`,
//           deps: WEB_FRAMEWORKS_SIGNALS[f],
//           detect: true,
//         },
//         {
//           desc: `can detect not ${f}`,
//           deps: `not-${f}`,
//         },
//       ];
//       async function testDependency(dep: string, shouldDetect: boolean | undefined) {
//         mockfs({
//           [appFolderDetectable]: {
//             ["package.json"]: `{"dependencies": {"${dep}": "1"}}`,
//           },
//         });
//         const modifiedYaml = await generateSdkYaml(
//           Platform.WEB,
//           getSampleConnectorYaml(),
//           connectorYamlFolder,
//           appFolderDetectable,
//         );
//         console.log(`{"dependencies": {"${dep}": "1"}}`);
//         expect(modifiedYaml.generate?.javascriptSdk?.[f]).to.equal(shouldDetect);
//       }
//       for (const c of cases) {
//         it(c.desc, async () => {
//           if (Array.isArray(c.deps)) {
//             for (const dep of c.deps) {
//               await testDependency(dep, c.detect);
//             }
//           } else {
//             await testDependency(c.deps as string, c.detect);
//           }
//         });
//       }
//     });
//   }

//   describe("IOS platform should add Swift SDK Generation", () => {
//     const cases: {
//       desc: string;
//       appDir: string;
//       output: any;
//     }[] = [
//       {
//         desc: "basic",
//         appDir: appFolderBase,
//         output: {
//           outputDir: "../dataconnect-generated/swift",
//           package: "DataConnectGenerated",
//         },
//       },
//       {
//         desc: "below connector",
//         appDir: appFolderBelowConnector,
//         output: {
//           outputDir: "belowConnector/dataconnect-generated/swift",
//           package: "DataConnectGenerated",
//         },
//       },
//       {
//         desc: "outside",
//         appDir: appFolderOutside,
//         output: {
//           outputDir: "../../outside/dataconnect-generated/swift",
//           package: "DataConnectGenerated",
//         },
//       },
//     ];
//     for (const c of cases) {
//       it(c.desc, async () => {
//         const modifiedYaml = await generateSdkYaml(
//           Platform.IOS,
//           getSampleConnectorYaml(),
//           connectorYamlFolder,
//           c.appDir,
//         );
//         expect(modifiedYaml.generate?.swiftSdk).to.deep.equal(c.output);
//       });
//     }
//   });

//   describe("Android platform should add Kotlin SDK Generation", () => {
//     const appFolderHasJava = "/my/app/folder/has-java";
//     const appFolderHasKotlin = "/my/app/folder/has-kotlin";
//     const appFolderHasBoth = "/my/app/folder/has-both";
//     const cases: {
//       desc: string;
//       appDir: string;
//       output: any;
//     }[] = [
//       {
//         desc: "basic",
//         appDir: appFolderBase,
//         output: {
//           outputDir: "../dataconnect-generated/kotlin",
//           package: "com.google.firebase.dataconnect.generated",
//         },
//       },
//       {
//         desc: "has java folder",
//         appDir: appFolderHasJava,
//         output: {
//           outputDir: "../has-java/app/src/main/java",
//           package: "com.google.firebase.dataconnect.generated",
//         },
//       },
//       {
//         desc: "has kotlin folder",
//         appDir: appFolderHasKotlin,
//         output: {
//           outputDir: "../has-kotlin/app/src/main/kotlin",
//           package: "com.google.firebase.dataconnect.generated",
//         },
//       },
//       {
//         desc: "prefer kotlin folder over java folder",
//         appDir: appFolderHasBoth,
//         output: {
//           outputDir: "../has-both/app/src/main/kotlin",
//           package: "com.google.firebase.dataconnect.generated",
//         },
//       },
//       {
//         desc: "below connector",
//         appDir: appFolderBelowConnector,
//         output: {
//           outputDir: "belowConnector/dataconnect-generated/kotlin",
//           package: "com.google.firebase.dataconnect.generated",
//         },
//       },
//       {
//         desc: "outside",
//         appDir: appFolderOutside,
//         output: {
//           outputDir: "../../outside/dataconnect-generated/kotlin",
//           package: "com.google.firebase.dataconnect.generated",
//         },
//       },
//     ];
//     for (const c of cases) {
//       it(c.desc, async () => {
//         mockfs({
//           [appFolderHasJava + "/app/src/main/java"]: {},
//           [appFolderHasKotlin + "/app/src/main/kotlin"]: {},
//           [appFolderHasBoth + "/app/src/main/java"]: {},
//           [appFolderHasBoth + "/app/src/main/kotlin"]: {},
//         });
//         const modifiedYaml = await generateSdkYaml(
//           Platform.ANDROID,
//           getSampleConnectorYaml(),
//           connectorYamlFolder,
//           c.appDir,
//         );
//         expect(modifiedYaml.generate?.kotlinSdk).to.deep.equal(c.output);
//       });
//     }
//   });

//   describe("Flutter platform should add Dart SDK Generation", () => {
//     const cases: {
//       desc: string;
//       appDir: string;
//       output: any;
//     }[] = [
//       {
//         desc: "basic",
//         appDir: appFolderBase,
//         output: {
//           outputDir: "../dataconnect-generated/dart/default_connector",
//           package: "dataconnect_generated",
//         },
//       },
//       {
//         desc: "below connector",
//         appDir: appFolderBelowConnector,
//         output: {
//           outputDir: "belowConnector/dataconnect-generated/dart/default_connector",
//           package: "dataconnect_generated",
//         },
//       },
//       {
//         desc: "outside",
//         appDir: appFolderOutside,
//         output: {
//           outputDir: "../../outside/dataconnect-generated/dart/default_connector",
//           package: "dataconnect_generated",
//         },
//       },
//     ];
//     for (const c of cases) {
//       it(c.desc, async () => {
//         const modifiedYaml = await generateSdkYaml(
//           Platform.FLUTTER,
//           getSampleConnectorYaml(),
//           connectorYamlFolder,
//           c.appDir,
//         );
//         expect(modifiedYaml.generate?.dartSdk).to.deep.equal(c.output);
//       });
//     }
//   });

//   it("should create generate object if it doesn't exist", async () => {
//     const yamlWithoutGenerate: ConnectorYaml = { connectorId: "default-connector" };
//     const modifiedYaml = await generateSdkYaml(
//       Platform.WEB,
//       yamlWithoutGenerate,
//       connectorYamlFolder,
//       appFolderBase,
//     );
//     expect(modifiedYaml.generate).to.exist;
//   });

//   it("should not modify yaml for unknown platforms", async () => {
//     const unknownPlatform = "unknown" as Platform; // Type assertion for test
//     const modifiedYaml = await generateSdkYaml(
//       unknownPlatform,
//       getSampleConnectorYaml(),
//       connectorYamlFolder,
//       appFolderBase,
//     );
//     expect(modifiedYaml).to.deep.equal(getSampleConnectorYaml()); // No changes
//   });

//   afterEach(() => {
//     mockfs.restore();
//   });
// });
