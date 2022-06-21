import { expect } from "chai";
import { join } from "path";
import { writeFileSync, unlinkSync, emptyDirSync, ensureDirSync } from "fs-extra";
import * as tmp from "tmp";

import * as firebase from "../../../src";
import { execSync } from "child_process";
import { command as functionsDelete } from "../../../src/commands/functions-delete";
import fetch, { Request } from "node-fetch";
import { FirebaseError } from "../../../src/error";

tmp.setGracefulCleanup();

// Typescript doesn't like calling functions on `firebase`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client: any = firebase;

const accessToken = getAccessToken();

function writeFirebaseRc(firebasercFilePath: string): void {
  const config = {
    projects: {
      default: process.env.FBTOOLS_TARGET_PROJECT,
    },
    targets: {
      [process.env.FBTOOLS_TARGET_PROJECT as string]: {
        hosting: {
          "client-integration-site": [process.env.FBTOOLS_CLIENT_INTEGRATION_SITE],
        },
      },
    },
  };
  writeFileSync(firebasercFilePath, JSON.stringify(config));
}

async function deleteAllDeployedFunctions(): Promise<void> {
  try {
    await functionsDelete.runner()(["helloWorld"], {
      projectId: process.env.FBTOOLS_TARGET_PROJECT,
      force: true,
    });
  } catch (FirebaseError) {
    // do nothing if the function doesn't match.
  }
}

function getAccessToken() {
  const token = execSync("gcloud auth print-identity-token").toString().trim();
  return token;
}

function functionRegionString(functionRegions: string[]) {
  const functionRegionsQuoted = functionRegions.map((regionString) => {
    return `"${regionString}"`;
  });
  return functionRegionsQuoted.join(",");
}

function writeHelloWorldFunctionWithRegions(
  functionsDirectory: string,
  functionRegions?: string[]
): void {
  ensureDirSync(functionsDirectory);

  const region = functionRegions ? `.region(${functionRegionString(functionRegions)})` : "";
  const functionFileContents = `
const functions = require("firebase-functions");

exports.helloWorld = functions${region}.runWith({invoker: "private"}).https.onRequest((request, response) => {
  functions.logger.info("Hello logs!", { structuredData: true });
  const envVarFunctionsRegion = process.env.FUNCTION_REGION;
  response.send("Hello from Firebase ${functionRegions ? "from " + functionRegions.toString() : ""
    }");
});`;
  writeFileSync(join(functionsDirectory, ".", "index.js"), functionFileContents);

  const functionsPackage = {
    name: "functions",
    engines: {
      node: "16",
    },
    main: "index.js",
    dependencies: {
      "firebase-admin": "^10.0.2",
      "firebase-functions": "^3.18.0",
    },
    private: true,
  };
  writeFileSync(join(functionsDirectory, ".", "package.json"), JSON.stringify(functionsPackage));
  execSync("npm install", { cwd: functionsDirectory });
}

describe("deployHostingAndFunctions", () => {
  const tempDir = tmp.dirSync({ prefix: "hosting_rewrites_tests_" });
  const firebasercFilePath = join(tempDir.name, ".", ".firebaserc");
  const hostingDirPath = join(tempDir.name, ".", "hosting");

  // eslint-disable-next-line prefer-arrow-callback
  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-invalid-this
    this.timeout(100 * 1e3);
    emptyDirSync(tempDir.name);
    writeFirebaseRc(firebasercFilePath);
    await deleteAllDeployedFunctions();
  });

  after(() => {
    unlinkSync(firebasercFilePath);
  });

  //   it("should deploy hosting and functions with no specified function region", async () => {
  //     const firebaseJson = {
  //       hosting: {
  //         public: "hosting",
  //         rewrites: [
  //           {
  //             source: "/helloWorld",
  //             function: "helloWorld",
  //           },
  //         ],
  //       },
  //     };

  //     const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //     writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //     ensureDirSync(hostingDirPath);
  //     writeFileSync(
  //       join(hostingDirPath, ".", "index.html"),
  //       `< !DOCTYPE html >
  //   <html>
  //   <head>
  //   </head>
  //   < body >
  //   Rabbit
  //   < /body>
  //   < /html>`
  //     );

  //     writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"));

  //     await client.deploy({
  //       project: process.env.FBTOOLS_TARGET_PROJECT,
  //       cwd: tempDir.name,
  //       only: "hosting,functions",
  //     });

  //     const staticResponse = await fetch(
  //       `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/index.html`
  //     );
  //     expect(await staticResponse.text()).to.contain("Rabbit");

  //     const functionsRequest = new Request(
  //       `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/helloWorld`
  //     );

  //     functionsRequest.headers.set("Authorization", `Bearer ${accessToken}`);
  //     const functionsResponse = await fetch(functionsRequest);

  //     expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  //   }).timeout(1000 * 1e3); // Deploying takes several steps.

  //   it("should deploy hosting and functions with region specified in function but no specified function region in rewrite", async () => {
  //     const firebaseJson = {
  //       hosting: {
  //         public: "hosting",
  //         rewrites: [
  //           {
  //             source: "/helloWorld",
  //             function: "helloWorld",
  //           },
  //         ],
  //       },
  //     };

  //     const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //     writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //     ensureDirSync(hostingDirPath);
  //     writeFileSync(
  //       join(hostingDirPath, ".", "index.html"),
  //       `< !DOCTYPE html >
  //   <html>
  //   <head>
  //   </head>
  //   < body >
  //   Rabbit
  //   < /body>
  //   < /html>`
  //     );

  //     writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"), ["us-central1"]);

  //     await client.deploy({
  //       project: process.env.FBTOOLS_TARGET_PROJECT,
  //       cwd: tempDir.name,
  //       only: "hosting,functions",
  //     });

  //     const staticResponse = await fetch(
  //       `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/index.html`
  //     );
  //     expect(await staticResponse.text()).to.contain("Rabbit");

  //     const functionsRequest = new Request(
  //       `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/helloWorld`
  //     );

  //     functionsRequest.headers.set("Authorization", `Bearer ${accessToken}`);
  //     const functionsResponse = await fetch(functionsRequest);

  //     expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  //   }).timeout(1000 * 1e3); // Deploying takes several steps.

  //   it("should deploy hosting and functions with region specified in rewrite but no specified region in function", async () => {
  //     const firebaseJson = {
  //       hosting: {
  //         public: "hosting",
  //         rewrites: [
  //           {
  //             source: "/helloWorld",
  //             function: "helloWorld",
  //             region: "us-central1",
  //           },
  //         ],
  //       },
  //     };

  //     const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //     writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //     ensureDirSync(hostingDirPath);
  //     writeFileSync(
  //       join(hostingDirPath, ".", "index.html"),
  //       `< !DOCTYPE html >
  //   <html>
  //   <head>
  //   </head>
  //   < body >
  //   Rabbit
  //   < /body>
  //   < /html>`
  //     );

  //     writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"));

  //     await client.deploy({
  //       project: process.env.FBTOOLS_TARGET_PROJECT,
  //       cwd: tempDir.name,
  //       only: "hosting,functions",
  //     });

  //     const staticResponse = await fetch(
  //       `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/index.html`
  //     );
  //     expect(await staticResponse.text()).to.contain("Rabbit");

  //     const functionsRequest = new Request(
  //       `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/helloWorld`
  //     );

  //     functionsRequest.headers.set("Authorization", `Bearer ${accessToken}`);
  //     const functionsResponse = await fetch(functionsRequest);

  //     expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  //   }).timeout(1000 * 1e3); // Deploying takes several steps.

  //   it("should deploy hosting and functions with a specified function region", async () => {
  //     const firebaseJson = {
  //       hosting: {
  //         public: "hosting",
  //         rewrites: [
  //           {
  //             source: "/helloWorld",
  //             function: "helloWorld",
  //             region: "asia-northeast1",
  //           },
  //         ],
  //       },
  //     };

  //     const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //     writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //     ensureDirSync(hostingDirPath);
  //     writeFileSync(
  //       join(hostingDirPath, ".", "index.html"),
  //       `< !DOCTYPE html >
  //   <html>
  //   <head>
  //   </head>
  //   < body >
  //   Rabbit
  //   < /body>
  //   < /html>`
  //     );

  //     writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"), ["asia-northeast1"]);

  //     await client.deploy({
  //       project: process.env.FBTOOLS_TARGET_PROJECT,
  //       cwd: tempDir.name,
  //       only: "hosting,functions",
  //     });

  //     const staticResponse = await fetch(
  //       `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/index.html`
  //     );
  //     expect(await staticResponse.text()).to.contain("Rabbit");

  //     const functionsRequest = new Request(
  //       `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/helloWorld`
  //     );

  //     functionsRequest.headers.set("Authorization", `Bearer ${accessToken}`);
  //     const functionsResponse = await fetch(functionsRequest);

  //     expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  //   }).timeout(1000 * 1e3); // Deploying takes several steps.

  //   it("should not deploy hosting and functions with the wrong function region", async () => {
  //     const firebaseJson = {
  //       hosting: {
  //         public: "hosting",
  //         rewrites: [
  //           {
  //             source: "/helloWorld",
  //             function: "helloWorld",
  //             region: "asia-northeast1",
  //           },
  //         ],
  //       },
  //     };

  //     const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //     writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //     ensureDirSync(hostingDirPath);
  //     writeFileSync(
  //       join(hostingDirPath, ".", "index.html"),
  //       `< !DOCTYPE html >
  //   <html>
  //   <head>
  //   </head>
  //   < body >
  //   Rabbit
  //   < /body>
  //   < /html>`
  //     );

  //     writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"), ["europe-west2"]);

  //     await expect(
  //       client.deploy({
  //         project: process.env.FBTOOLS_TARGET_PROJECT,
  //         cwd: tempDir.name,
  //         only: "hosting,functions",
  //       })
  //     ).to.eventually.be.rejectedWith(FirebaseError, "Unable to find a valid endpoint for function");
  //   }).timeout(1000 * 1e3); // Deploying takes several steps.

  // it("should not deploy when a rewrite points to a non-existent function", async () => {
  //   const firebaseJson = {
  //     hosting: {
  //       public: "hosting",
  //       rewrites: [
  //         {
  //           source: "/helloWorld",
  //           function: "helloWorld",
  //         },
  //       ],
  //     },
  //   };

  //   const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //   writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //   ensureDirSync(hostingDirPath);
  //   writeFileSync(
  //     join(hostingDirPath, ".", "index.html"),
  //     `< !DOCTYPE html >
  // <html>
  // <head>
  // </head>
  // < body >
  // Rabbit
  // < /body>
  // < /html>`
  //   );

  //   await expect(
  //     client.deploy({
  //       project: process.env.FBTOOLS_TARGET_PROJECT,
  //       cwd: tempDir.name,
  //       only: "hosting,functions",
  //     })
  //   ).to.eventually.be.rejectedWith(FirebaseError, "Unable to find a valid endpoint for function");
  // }).timeout(1000 * 1e3); // Deploying takes several steps.

  // it("should deploy hosting and functions with any function region", async () => {
  //   const firebaseJson = {
  //     hosting: {
  //       public: "hosting",
  //       rewrites: [
  //         {
  //           source: "/helloWorld",
  //           function: "helloWorld",
  //           region: "europe-west2",
  //         },
  //       ],
  //     },
  //   };

  //   const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //   writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //   ensureDirSync(hostingDirPath);
  //   writeFileSync(
  //     join(hostingDirPath, ".", "index.html"),
  //     `< !DOCTYPE html >
  // <html>
  // <head>
  // </head>
  // < body >
  // Rabbit
  // < /body>
  // < /html>`
  // it("should rewrite using a specified function region for a function with multiple regions", async () => {
  //   const firebaseJson = {
  //     hosting: {
  //       public: "hosting",
  //       rewrites: [
  //         {
  //           source: "/helloWorld",
  //           function: "helloWorld",
  //           region: "asia-northeast1",
  //         },
  //       ],
  //     },
  //   };

  //   const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //   writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //   ensureDirSync(hostingDirPath);
  //   writeFileSync(
  //     join(hostingDirPath, ".", "index.html"),
  //     `< !DOCTYPE html >
  // <html>
  // <head>
  // </head>
  // < body >
  // Rabbit
  // < /body>
  // < /html>`
  //   );

  //   writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"), [
  //     "asia-northeast1",
  //     "europe-west1",
  //   ]);

  //   await client.deploy({
  //     project: process.env.FBTOOLS_TARGET_PROJECT,
  //     cwd: tempDir.name,
  //     only: "hosting,functions",
  //   });

  //   const staticResponse = await fetch(
  //     `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/index.html`
  //   );
  //   expect(await staticResponse.text()).to.contain("Rabbit");

  //   const functionsRequest = new Request(
  //     `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/helloWorld`
  //   );

  //   functionsRequest.headers.set("Authorization", `Bearer ${accessToken}`);
  //   const functionsResponse = await fetch(functionsRequest);

  //   expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  // }).timeout(1000 * 1e3); // Deploying takes several steps.

  // it("should fail when rewrite points to an invalid region for a function with multiple regions", async () => {
  //   const firebaseJson = {
  //     hosting: {
  //       public: "hosting",
  //       rewrites: [
  //         {
  //           source: "/helloWorld",
  //           function: "helloWorld",
  //           region: "us-east1",
  //         },
  //       ],
  //     },
  //   };

  //   const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //   writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //   ensureDirSync(hostingDirPath);
  //   writeFileSync(
  //     join(hostingDirPath, ".", "index.html"),
  //     `< !DOCTYPE html >
  // <html>
  // <head>
  // </head>
  // < body >
  // Rabbit
  // < /body>
  // < /html>`
  //   );

  //   writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"), [
  //     "asia-northeast1",
  //     "europe-west1",
  //   ]);

  //   await expect(
  //     client.deploy({
  //       project: process.env.FBTOOLS_TARGET_PROJECT,
  //       cwd: tempDir.name,
  //       only: "hosting,functions",
  //     })
  //   ).to.eventually.be.rejectedWith(FirebaseError, "Unable to find a valid endpoint for function");
  // }).timeout(1000 * 1e3); // Deploying takes several steps.

  // it("should fail when rewrite has no region specified for a function with multiple regions", async () => {
  //   const firebaseJson = {
  //     hosting: {
  //       public: "hosting",
  //       rewrites: [
  //         {
  //           source: "/helloWorld",
  //           function: "helloWorld",
  //         },
  //       ],
  //     },
  //   };

  //   const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //   writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //   ensureDirSync(hostingDirPath);
  //   writeFileSync(
  //     join(hostingDirPath, ".", "index.html"),
  //     `< !DOCTYPE html >
  // <html>
  // <head>
  // </head>
  // < body >
  // Rabbit
  // < /body>
  // < /html>`
  //   );

  //   writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"), [
  //     "asia-northeast1",
  //     "europe-west1",
  //   ]);

  //   await expect(
  //     client.deploy({
  //       project: process.env.FBTOOLS_TARGET_PROJECT,
  //       cwd: tempDir.name,
  //       only: "hosting,functions",
  //     })
  //   ).to.eventually.be.rejectedWith(FirebaseError, "More than one backend found for function");
  // }).timeout(1000 * 1e3); // Deploying takes several steps.

  // it("should deploy with autodetected function region", async () => {
  //   const firebaseJson = {
  //     hosting: {
  //       public: "hosting",
  //       rewrites: [
  //         {
  //           source: "/helloWorld",
  //           function: "helloWorld",
  //         },
  //       ],
  //     },
  //   };

  //   const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //   writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //   ensureDirSync(hostingDirPath);
  //   writeFileSync(
  //     join(hostingDirPath, ".", "index.html"),
  //     `< !DOCTYPE html >
  // <html>
  // <head>
  // </head>
  // < body >
  // Rabbit
  // < /body>
  // < /html>`
  //   );

  //   writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"), ["europe-west1"]);

  //   await client.deploy({
  //     project: process.env.FBTOOLS_TARGET_PROJECT,
  //     cwd: tempDir.name,
  //     only: "hosting,functions",
  //   });

  //   const staticResponse = await fetch(
  //     `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/index.html`
  //   );
  //   expect(await staticResponse.text()).to.contain("Rabbit");

  //   const functionsRequest = new Request(
  //     `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/helloWorld`
  //   );

  //   functionsRequest.headers.set("Authorization", `Bearer ${accessToken}`);
  //   const functionsResponse = await fetch(functionsRequest);

  //   expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  // }).timeout(1000 * 1e3); // Deploying takes several steps.

  // it("should deploy with autodetected function region when function region is changed", async () => {
  //   const firebaseJson = {
  //     hosting: {
  //       public: "hosting",
  //       rewrites: [
  //         {
  //           source: "/helloWorld",
  //           function: "helloWorld",
  //         },
  //       ],
  //     },
  //   };

  //   const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //   writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //   ensureDirSync(hostingDirPath);
  //   writeFileSync(
  //     join(hostingDirPath, ".", "index.html"),
  //     `< !DOCTYPE html >
  // <html>
  // <head>
  // </head>
  // < body >
  // Rabbit
  // < /body>
  // < /html>`
  //   );

  //   writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"), ["europe-west1"]);

  //   await client.deploy({
  //     project: process.env.FBTOOLS_TARGET_PROJECT,
  //     cwd: tempDir.name,
  //     only: "hosting,functions",
  //     force: true,
  //   });

  //   const staticResponse = await fetch(
  //     `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/index.html`
  //   );
  //   expect(await staticResponse.text()).to.contain("Rabbit");

  //   const functionsRequest = new Request(
  //     `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/helloWorld`
  //   );

  //   functionsRequest.headers.set("Authorization", `Bearer ${accessToken}`);
  //   const functionsResponse = await fetch(functionsRequest);

  //   const responseText = await functionsResponse.text();
  //   expect(responseText).to.contain("Hello from Firebase");
  //   expect(responseText).to.contain("europe-west1");

  //   writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"), ["asia-northeast1"]);

  //   await client.deploy({
  //     project: process.env.FBTOOLS_TARGET_PROJECT,
  //     cwd: tempDir.name,
  //     only: "hosting,functions",
  //     force: true,
  //   });

  //   const staticResponse2 = await fetch(
  //     `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/index.html`
  //   );
  //   expect(await staticResponse2.text()).to.contain("Rabbit");
  //   const functionsResponse2 = await fetch(functionsRequest);
  //   const responseText2 = await functionsResponse2.text();

  //   expect(responseText2).to.contain("Hello from Firebase");
  //   expect(responseText2).to.contain("asia-northeast1");
  //   expect(responseText2).not.to.contain("europe-west1");
  // }).timeout(1000 * 1e3); // Deploying takes several steps.

  // it("should deploy with specified function region when function region is changed", async () => {
  //   let firebaseJson = {
  //     hosting: {
  //       public: "hosting",
  //       rewrites: [
  //         {
  //           source: "/helloWorld",
  //           function: "helloWorld",
  //           region: "europe-west1",
  //         },
  //       ],
  //     },
  //   };

  //   const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //   writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //   ensureDirSync(hostingDirPath);
  //   writeFileSync(
  //     join(hostingDirPath, ".", "index.html"),
  //     `< !DOCTYPE html >
  // <html>
  // <head>
  // </head>
  // < body >
  // Rabbit
  // < /body>
  // < /html>`
  //   );

  //   writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"), ["europe-west1"]);

  //   const functionsRequest = new Request(
  //     `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/helloWorld`
  //   );

  //   {
  //     await client.deploy({
  //       project: process.env.FBTOOLS_TARGET_PROJECT,
  //       cwd: tempDir.name,
  //       only: "hosting,functions",
  //     });

  //     const staticResponse = await fetch(
  //       `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/index.html`
  //     );
  //     expect(await staticResponse.text()).to.contain("Rabbit");


  //     functionsRequest.headers.set("Authorization", `Bearer ${accessToken}`);
  //     const functionsResponse = await fetch(functionsRequest);

  //     const responseText = await functionsResponse.text();
  //     expect(responseText).to.contain("Hello from Firebase");
  //     expect(responseText).to.contain("europe-west1");
  //   }

  //   // Change function region in both firebase.json and function definition.
  //   firebaseJson = {
  //     hosting: {
  //       public: "hosting",
  //       rewrites: [
  //         {
  //           source: "/helloWorld",
  //           function: "helloWorld",
  //           region: "asia-northeast1",
  //         },
  //       ],
  //     },
  //   };
  //   writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //   writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"), ["asia-northeast1"]);

  //   {
  //     await client.deploy({
  //       project: process.env.FBTOOLS_TARGET_PROJECT,
  //       cwd: tempDir.name,
  //       only: "hosting,functions",
  //       force: true,
  //     });

  //     const staticResponse = await fetch(
  //       `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/index.html`
  //     );
  //     expect(await staticResponse.text()).to.contain("Rabbit");
  //     const functionsResponse = await fetch(functionsRequest);
  //     const responseText = await functionsResponse.text();

  //     expect(responseText).to.contain("Hello from Firebase");
  //     expect(responseText).to.contain("asia-northeast1");
  //     expect(responseText).not.to.contain("europe-west1");
  //   }
  // }).timeout(1000 * 1e3); // Deploying takes several steps.

  // it("should fail to deploy when rewrite function region changes and functions region doesn't", async () => {
  //   let firebaseJson = {
  //     hosting: {
  //       public: "hosting",
  //       rewrites: [
  //         {
  //           source: "/helloWorld",
  //           function: "helloWorld",
  //           region: "europe-west1",
  //         },
  //       ],
  //     },
  //   };

  //   const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //   writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //   ensureDirSync(hostingDirPath);
  //   writeFileSync(
  //     join(hostingDirPath, ".", "index.html"),
  //     `< !DOCTYPE html >
  // <html>
  // <head>
  // </head>
  // < body >
  // Rabbit
  // < /body>
  // < /html>`
  //   );

  //   writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"), ["europe-west1"]);

  //   const functionsRequest = new Request(
  //     `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/helloWorld`
  //   );

  //   {
  //     await client.deploy({
  //       project: process.env.FBTOOLS_TARGET_PROJECT,
  //       cwd: tempDir.name,
  //       only: "hosting,functions",
  //       force: true,
  //     });

  //     const staticResponse = await fetch(
  //       `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/index.html`
  //     );
  //     expect(await staticResponse.text()).to.contain("Rabbit");


  //     functionsRequest.headers.set("Authorization", `Bearer ${accessToken}`);
  //     const functionsResponse = await fetch(functionsRequest);

  //     const responseText = await functionsResponse.text();
  //     expect(responseText).to.contain("Hello from Firebase");
  //     expect(responseText).to.contain("europe-west1");
  //   }

  //   // Change function region in both firebase.json and function definition.
  //   firebaseJson = {
  //     hosting: {
  //       public: "hosting",
  //       rewrites: [
  //         {
  //           source: "/helloWorld",
  //           function: "helloWorld",
  //           region: "asia-northeast1",
  //         },
  //       ],
  //     },
  //   };
  //   writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //   {
  //     await expect(
  //       client.deploy({
  //         project: process.env.FBTOOLS_TARGET_PROJECT,
  //         cwd: tempDir.name,
  //         only: "hosting",
  //         force: true,
  //       })
  //     ).to.eventually.be.rejectedWith(FirebaseError);
  //   }
  // }).timeout(1000 * 1e3); // Deploying takes several steps.

  // it("should fail to deploy when target function doesn't exist", async () => {
  //   const firebaseJson = {
  //     hosting: {
  //       public: "hosting",
  //       rewrites: [
  //         {
  //           source: "/helloWorld",
  //           function: "helloWorld",
  //           region: "europe-west1",
  //         },
  //       ],
  //     },
  //   };

  //   const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //   writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //   ensureDirSync(hostingDirPath);
  //   writeFileSync(
  //     join(hostingDirPath, ".", "index.html"),
  //     `< !DOCTYPE html >
  // <html>
  // <head>
  // </head>
  // < body >
  // Rabbit
  // < /body>
  // < /html>`
  //   );
  //   await expect(
  //     client.deploy({
  //       project: process.env.FBTOOLS_TARGET_PROJECT,
  //       cwd: tempDir.name,
  //       only: "hosting",
  //       force: true,
  //     })
  //   ).to.eventually.be.rejectedWith(FirebaseError);
  // }).timeout(1000 * 1e3); // Deploying takes several steps.

  // it("should deploy when target function exists in prod but code isn't available", async () => {
  //   const firebaseJson = {
  //     hosting: {
  //       public: "hosting",
  //       rewrites: [
  //         {
  //           source: "/helloWorld",
  //           function: "helloWorld",
  //         },
  //       ],
  //     },
  //   };

  //   const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //   writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //   ensureDirSync(hostingDirPath);
  //   writeFileSync(
  //     join(hostingDirPath, ".", "index.html"),
  //     `< !DOCTYPE html >
  //   <html>
  //   <head>
  //   </head>
  //   < body >
  //   Rabbit
  //   < /body>
  //   < /html>`
  //   );

  //   writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"));

  //   await client.deploy({
  //     project: process.env.FBTOOLS_TARGET_PROJECT,
  //     cwd: tempDir.name,
  //     only: "hosting,functions",
  //   });

  //   const staticResponse = await fetch(
  //     `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/index.html`
  //   );

  //   expect(await staticResponse.text()).to.contain("Rabbit");
  //   {
  //     const functionsRequest = new Request(
  //       `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/helloWorld`
  //     );

  //     functionsRequest.headers.set("Authorization", `Bearer ${accessToken}`);
  //     const functionsResponse = await fetch(functionsRequest);

  //     expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  //   }

  //   emptyDirSync(join(tempDir.name, ".", "functions"));
  //   await client.deploy({
  //     project: process.env.FBTOOLS_TARGET_PROJECT,
  //     cwd: tempDir.name,
  //     only: "hosting", // Including functions here will prompt for deletion.
  //     // Forcing the prompt will delete the function.
  //   });

  //   {
  //     const functionsRequest = new Request(
  //       `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/helloWorld`
  //     );

  //     functionsRequest.headers.set("Authorization", `Bearer ${accessToken}`);
  //     const functionsResponse = await fetch(functionsRequest);

  //     expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  //   }
  // }).timeout(1000 * 1e3); // Deploying takes several steps.

  it("should fail to deploy when target function exists in prod, code isn't available, and rewrite region is specified incorrectly", async () => {
    writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"), ["asia-northeast1"]);

    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDir.name,
      only: "functions",
    });

    const firebaseJson = {
      hosting: {
        public: "hosting",
        rewrites: [
          {
            source: "/helloWorld",
            function: "helloWorld",
            region: "europe-west1",
          },
        ],
      },
    };

    const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
    writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));

    emptyDirSync(join(tempDir.name, ".", "functions"));
    await expect(
      client.deploy({
        project: process.env.FBTOOLS_TARGET_PROJECT,
        cwd: tempDir.name,
        only: "hosting", // Including functions here will prompt for deletion.
        // Forcing the prompt will delete the function.
      })
    ).to.eventually.be.rejectedWith(FirebaseError);
  }).timeout(1000 * 1e3); // Deploying takes several steps.

  // it("should deploy when target function exists in prod, codebase isn't available, and region matches", async () => {
  //   const firebaseJson = {
  //     hosting: {
  //       public: "hosting",
  //       rewrites: [
  //         {
  //           source: "/helloWorld",
  //           function: "helloWorld",
  //           region: "asia-northeast1",
  //         },
  //       ],
  //     },
  //   };

  //   const firebaseJsonFilePath = join(tempDir.name, ".", "firebase.json");
  //   writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
  //   writeHelloWorldFunctionWithRegions(join(tempDir.name, ".", "functions"), ["asia-northeast1"]);

  //   await client.deploy({
  //     project: process.env.FBTOOLS_TARGET_PROJECT,
  //     cwd: tempDir.name,
  //     only: "functions",
  //   });

  //   emptyDirSync(join(tempDir.name, ".", "functions"));
  //   await client.deploy({
  //     project: process.env.FBTOOLS_TARGET_PROJECT,
  //     cwd: tempDir.name,
  //     only: "hosting", // Including functions here will prompt for deletion.
  //     // Forcing the prompt will delete the function.
  //   });

  //   {
  //     const functionsRequest = new Request(
  //       `https://${process.env.FBTOOLS_TARGET_PROJECT}.web.app/helloWorld`
  //     );

  //     functionsRequest.headers.set("Authorization", `Bearer ${accessToken}`);
  //     const functionsResponse = await fetch(functionsRequest);

  //     expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  //   }
  // }).timeout(1000 * 1e3); // Deploying takes several steps.
}).timeout(1000 * 1e3);
