import { expect } from "chai";
import { join } from "path";
import { writeFileSync, emptyDirSync, ensureDirSync } from "fs-extra";
import * as tmp from "tmp";

import * as firebase from "../../../src";
import { execSync } from "child_process";
import { command as functionsDelete } from "../../../src/commands/functions-delete";
import { command as sitesCreate } from "../../../src/commands/hosting-sites-create";
import { command as sitesList } from "../../../src/commands/hosting-sites-list";
import { command as sitesDelete } from "../../../src/commands/hosting-sites-delete";
import fetch, { Request } from "node-fetch";
import { FirebaseError } from "../../../src/error";
import { QueueExecutor } from "../../../src/deploy/functions/release/executor";
import { GoogleAuth } from "google-auth-library";
import { Headers } from "google-auth-library/build/src/auth/oauth2client";

tmp.setGracefulCleanup();

const projectName = (() => {
  if (process.env.FBTOOLS_TARGET_PROJECT) {
    return process.env.FBTOOLS_TARGET_PROJECT;
  }
  throw new Error("FBTOOLS_TARGET_PROJECT environment variable was not set properly.");
})();
const siteNamePrefixLabel = "rwtestsite";
const runId = process.env.CI_RUN_ID || "xx";
const runAttempt = process.env.CI_RUN_ATTEMPT || "yy";
const testInstance = process.env.TEST_INSTANCE || "zz";
const testConcurrency = 6;

// Run this test manually by:
// - Setting the target project to any project that can create publicly invokable functions.
// - Disabling mockAuth in .mocharc

// Typescript doesn't like calling functions on `firebase`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client: any = firebase;
const auth = new GoogleAuth();

function writeFirebaseRc(firebasercFilePath: string, siteName: string): void {
  const config = {
    projects: {
      default: projectName,
    },
    targets: {
      [projectName]: {
        hosting: {
          [siteName]: [siteName],
        },
      },
    },
  };
  writeFileSync(firebasercFilePath, JSON.stringify(config));
}

async function createSite(siteName: string): Promise<void> {
  await sitesCreate.runner()([siteName], {
    projectId: projectName,
    force: true,
  });
}

async function deleteSite(siteName: string, cwd: string): Promise<void> {
  try {
    await sitesDelete.runner()([siteName], {
      projectId: projectName,
      force: true,
      cwd: cwd,
    });
  } catch (e) {
    // site might not exist
  }
}

async function deleteDeployedFunctions(functionName: string): Promise<void> {
  try {
    await functionsDelete.runner()([functionName], {
      projectId: projectName,
      force: true,
    });
  } catch (e) {
    // function might not exist
  }
}

function functionRegionString(functionRegions: string[]): string {
  const functionRegionsQuoted = functionRegions.map((regionString) => {
    return `"${regionString}"`;
  });
  return functionRegionsQuoted.join(",");
}

function writeHelloWorldFunctionWithRegions(
  functionName: string,
  functionsDirectory: string,
  functionRegions?: string[]
): void {
  ensureDirSync(functionsDirectory);

  const region = functionRegions ? `.region(${functionRegionString(functionRegions)})` : "";
  const functionFileContents = `
const functions = require("firebase-functions");

exports.${functionName} = functions.runWith({ invoker: "private" })${region}.https.onRequest((request, response) => {
  functions.logger.info("Hello logs!", { structuredData: true });
  const envVarFunctionsRegion = process.env.FUNCTION_REGION;
  response.send("Hello from Firebase ${
    functionRegions ? "from " + functionRegions.toString() : ""
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

function writeBasicHostingFile(hostingDirectory: string): void {
  writeFileSync(
    join(hostingDirectory, ".", "index.html"),
    `< !DOCTYPE html >
<html>
<head>
</head>
< body >
Rabbit
< /body>
< /html>`
  );
}

class TempDirectoryInfo {
  tempDir = tmp.dirSync({ prefix: "hosting_rewrites_tests_" });
  firebasercFilePath = join(this.tempDir.name, ".", ".firebaserc");
  hostingDirPath = join(this.tempDir.name, ".", "hosting");
  functionsDirPath = join(this.tempDir.name, ".", "functions");
}

const functionNamePrefix = `helloworld_${runId}_${runAttempt}_${testInstance}_${Date.now()}`;
const siteNamePrefix = `${siteNamePrefixLabel}-${runId}-${runAttempt}-${testInstance}-${Date.now()}`;

async function deleteOldSites(): Promise<void> {
  const sites = await sitesList.runner()({
    projectId: projectName,
  });
  console.log(`got sites ${sites.length}`);

  const validDateCutoff = new Date("2021-06-01");
  for (const site of sites) {
    if (!site.name.includes(siteNamePrefixLabel)) {
      console.log("skipping because not ours");
      continue;
    }
    const siteName = site.name.substring(site.name.lastIndexOf(siteNamePrefixLabel));
    const siteNameParts = siteName.split("-");
    if (siteNameParts.length !== 5) {
      console.log(`errored ${siteNameParts.length}`);
      throw new Error(
        `Found a site that begins with '${siteNamePrefixLabel}' but the name looks malformed: ${site.name}`
      );
    }
    const siteTimestamp = parseInt(siteNameParts[3]);
    if (siteTimestamp < validDateCutoff.getSeconds() || siteTimestamp > Date.now()) {
      // Date doesn't make sense and we don't know what's going on.
      console.log(`errored ${siteTimestamp.toString()}`);
      throw new Error(
        `Parsed a date for an existing site that looks unexpected: ${siteTimestamp.toString()}`
      );
    }
    if (siteTimestamp > Date.now() - 3600) {
      // Don't delete sites less than an hour old.
      console.log("skipping because new");
      continue;
    }
    const tempDirInfo = new TempDirectoryInfo();
    const firebaseJson = {
      hosting: {
        public: "hosting",
        target: siteName,
      },
    };
    const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
    writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
    console.log("deleting");
    await deleteSite(siteName, tempDirInfo.tempDir.name);
    console.log("deleted");
  }
  console.log("deleteOldSites done");
}

async function createAuthHeadersForFunction(
  region: string,
  functionName: string
): Promise<Headers> {
  const url = `https://${region}-${projectName}.cloudfunctions.net/${functionName}`;
  const reqclient = await auth.getIdTokenClient(url);
  return await reqclient.getRequestHeaders(url);
}
class TestCase {
  private static testNumbering = 1;
  private testNumber = TestCase.testNumbering++;
  private tempDirInfo = new TempDirectoryInfo();

  siteName = siteNamePrefix + "-" + this.testNumber.toString();
  functionName = functionNamePrefix + "_" + this.testNumber.toString();

  description: string;

  constructor(
    description: string,
    testFunction: (
      siteName: string,
      functionName: string,
      tempDirInfo: TempDirectoryInfo
    ) => Promise<void>
  ) {
    this.description = description;
    this.testFn = testFunction;
  }

  private doneLock = Promise.resolve();
  // doneLock: AsyncLock = new AsyncLock();
  donePromise: Promise<void> | undefined;
  async getDonePromise(): Promise<void> {
    return await this.doneLock.then(() => {
      if (this.donePromise === undefined) {
        this.donePromise = this.testFunction();
      }
      return this.donePromise;
    });
  }

  private testFn: (
    siteName: string,
    functionName: string,
    tempDirInfo: TempDirectoryInfo
  ) => Promise<void>;

  private async cleanup(): Promise<void> {
    await deleteDeployedFunctions(this.functionName);
    await deleteSite(this.siteName, this.tempDirInfo.tempDir.name);
  }

  private async testFunction(): Promise<void> {
    try {
      await deleteDeployedFunctions(this.functionName);
      emptyDirSync(this.tempDirInfo.tempDir.name);
      await createSite(this.siteName);
      writeFirebaseRc(this.tempDirInfo.firebasercFilePath, this.siteName);
      await this.testFn(this.siteName, this.functionName, this.tempDirInfo);
    } finally {
      await this.cleanup();
    }
  }
}

const testCases: TestCase[] = [];

testCases.push(
  new TestCase(
    "should deploy with default function region",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };

      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      writeBasicHostingFile(tempDirInfo.hostingDirPath);

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath);

      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting,functions",
        force: true,
      });

      const staticResponse = await fetch(`https://${siteName}.web.app/index.html`);
      expect(await staticResponse.text()).to.contain("Rabbit");

      const functionsRequest = new Request(`https://${siteName}.web.app/helloWorld`);
      const functionsResponse = await fetch(functionsRequest, {
        headers: await createAuthHeadersForFunction("us-central1", functionName),
      });
      expect(await functionsResponse.text()).to.contain("Hello from Firebase");
    }
  )
);

testCases.push(
  new TestCase(
    "should deploy with default function region explicitly specified in rewrite",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
              region: "us-central1",
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };

      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      writeBasicHostingFile(tempDirInfo.hostingDirPath);

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath);

      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting,functions",
        force: true,
      });

      const staticResponse = await fetch(`https://${siteName}.web.app/index.html`);
      expect(await staticResponse.text()).to.contain("Rabbit");

      const functionsRequest = new Request(`https://${siteName}.web.app/helloWorld`);
      const functionsResponse = await fetch(functionsRequest, {
        headers: await createAuthHeadersForFunction("us-central1", functionName),
      });
      expect(await functionsResponse.text()).to.contain("Hello from Firebase");
    }
  )
);

testCases.push(
  new TestCase(
    "should deploy with autodetected (not us-central1) function region",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };

      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      writeBasicHostingFile(tempDirInfo.hostingDirPath);

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath, [
        "europe-west1",
      ]);

      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting,functions",
        force: true,
      });

      const staticResponse = await fetch(`https://${siteName}.web.app/index.html`);
      expect(await staticResponse.text()).to.contain("Rabbit");

      const functionsRequest = new Request(`https://${siteName}.web.app/helloWorld`);
      const functionsResponse = await fetch(functionsRequest, {
        headers: await createAuthHeadersForFunction("europe-west1", functionName),
      });
      expect(await functionsResponse.text()).to.contain("Hello from Firebase");
    }
  )
);

testCases.push(
  new TestCase(
    "should deploy rewrites and functions with function region specified in both",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
              region: "asia-northeast1",
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };

      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      writeBasicHostingFile(tempDirInfo.hostingDirPath);

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath, [
        "asia-northeast1",
      ]);

      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting,functions",
        force: true,
      });

      const staticResponse = await fetch(`https://${siteName}.web.app/index.html`);
      expect(await staticResponse.text()).to.contain("Rabbit");

      const functionsRequest = new Request(`https://${siteName}.web.app/helloWorld`);
      const functionsResponse = await fetch(functionsRequest, {
        headers: await createAuthHeadersForFunction("asia-northeast1", functionName),
      });
      expect(await functionsResponse.text()).to.contain("Hello from Firebase");
    }
  )
);

testCases.push(
  new TestCase(
    "should fail to deploy rewrites with the wrong function region",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
              region: "asia-northeast1",
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };

      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      writeBasicHostingFile(tempDirInfo.hostingDirPath);

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath, [
        "europe-west2",
      ]);

      await expect(
        client.deploy({
          project: projectName,
          cwd: tempDirInfo.tempDir.name,
          only: "hosting,functions",
          force: true,
        })
      ).to.eventually.be.rejectedWith(
        FirebaseError,
        "Unable to find a valid endpoint for function"
      );
    }
  )
);

testCases.push(
  new TestCase(
    "should fail to deploy rewrites to a function being deleted in a region",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJson = {
        hosting: {
          public: "hosting",
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
              region: "asia-northeast1",
            },
          ],
        },
      };

      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      writeBasicHostingFile(tempDirInfo.hostingDirPath);

      writeHelloWorldFunctionWithRegions(
        functionName,
        join(tempDirInfo.tempDir.name, ".", "functions"),
        ["asia-northeast1"]
      );

      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "functions",
        force: true,
      });

      writeHelloWorldFunctionWithRegions(
        functionName,
        join(tempDirInfo.tempDir.name, ".", "functions"),
        ["europe-west1"]
      );
      await expect(
        client.deploy({
          project: projectName,
          cwd: tempDirInfo.tempDir.name,
          only: "functions,hosting",
          force: true,
        })
      ).to.eventually.be.rejectedWith(
        FirebaseError,
        "Unable to find a valid endpoint for function"
      );
    }
  )
);

testCases.push(
  new TestCase(
    "should deploy when a rewrite points to a non-existent function",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: "function-that-doesnt-exist",
            },
          ],
        },
      };

      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      writeBasicHostingFile(tempDirInfo.hostingDirPath);

      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting,functions",
        force: true,
      });

      const staticResponse = await fetch(`https://${siteName}.web.app/index.html`);
      expect(await staticResponse.text()).to.contain("Rabbit");
    }
  )
);

testCases.push(
  new TestCase(
    "should rewrite using a specified function region for a function with multiple regions",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
              region: "asia-northeast1",
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };

      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      writeBasicHostingFile(tempDirInfo.hostingDirPath);

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath, [
        "asia-northeast1",
        "europe-west1",
      ]);

      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting,functions",
        force: true,
      });

      const staticResponse = await fetch(`https://${siteName}.web.app/index.html`);
      expect(await staticResponse.text()).to.contain("Rabbit");

      const functionsRequest = new Request(`https://${siteName}.web.app/helloWorld`);
      const functionsResponse = await fetch(functionsRequest, {
        headers: await createAuthHeadersForFunction("asia-northeast1", functionName),
      });
      expect(await functionsResponse.text()).to.contain("Hello from Firebase");
    }
  )
);

testCases.push(
  new TestCase(
    "should rewrite to the default of us-central1 if multiple regions including us-central1 are available",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };

      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      writeBasicHostingFile(tempDirInfo.hostingDirPath);

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath, [
        "asia-northeast1",
        "us-central1",
      ]);

      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting,functions",
        force: true,
      });

      const staticResponse = await fetch(`https://${siteName}.web.app/index.html`);
      expect(await staticResponse.text()).to.contain("Rabbit");

      const functionsRequest = new Request(`https://${siteName}.web.app/helloWorld`);
      const functionsResponse = await fetch(functionsRequest, {
        headers: await createAuthHeadersForFunction("us-central1", functionName),
      });
      expect(await functionsResponse.text()).to.contain("Hello from Firebase");
    }
  )
);

testCases.push(
  new TestCase(
    "should fail when rewrite points to an invalid region for a function with multiple regions",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
              region: "us-east1",
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };

      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      writeBasicHostingFile(tempDirInfo.hostingDirPath);

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath, [
        "asia-northeast1",
        "europe-west1",
      ]);

      await expect(
        client.deploy({
          project: projectName,
          cwd: tempDirInfo.tempDir.name,
          only: "hosting,functions",
        })
      ).to.eventually.be.rejectedWith(
        FirebaseError,
        "Unable to find a valid endpoint for function"
      );
    }
  )
);

testCases.push(
  new TestCase(
    "should fail when rewrite has no region specified for a function with multiple regions",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };

      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      writeBasicHostingFile(tempDirInfo.hostingDirPath);

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath, [
        "asia-northeast1",
        "europe-west1",
      ]);

      await expect(
        client.deploy({
          project: projectName,
          cwd: tempDirInfo.tempDir.name,
          only: "hosting,functions",
          force: true,
        })
      ).to.eventually.be.rejectedWith(FirebaseError, "More than one backend found for function");
    }
  )
);

testCases.push(
  new TestCase(
    "should deploy with autodetected function region when function region is changed",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };

      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      writeBasicHostingFile(tempDirInfo.hostingDirPath);

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath, [
        "europe-west1",
      ]);

      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting,functions",
        force: true,
      });

      const staticResponse = await fetch(`https://${siteName}.web.app/index.html`);
      expect(await staticResponse.text()).to.contain("Rabbit");

      const functionsRequest = new Request(`https://${siteName}.web.app/helloWorld`);
      const functionsResponse = await fetch(functionsRequest, {
        headers: await createAuthHeadersForFunction("europe-west1", functionName),
      });
      const responseText = await functionsResponse.text();
      expect(responseText).to.contain("Hello from Firebase");
      expect(responseText).to.contain("europe-west1");

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath, [
        "asia-northeast1",
      ]);

      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting,functions",
        force: true,
      });

      const staticResponse2 = await fetch(`https://${siteName}.web.app/index.html`);
      expect(await staticResponse2.text()).to.contain("Rabbit");
      const functionsResponse2 = await fetch(functionsRequest, {
        headers: await createAuthHeadersForFunction("asia-northeast1", functionName),
      });
      const responseText2 = await functionsResponse2.text();

      expect(responseText2).to.contain("Hello from Firebase");
      expect(responseText2).to.contain("asia-northeast1");
      expect(responseText2).not.to.contain("europe-west1");
    }
  )
);

testCases.push(
  new TestCase(
    "should deploy with specified function region when function region is changed",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      let firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
              region: "europe-west1",
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };

      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      writeBasicHostingFile(tempDirInfo.hostingDirPath);

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath, [
        "europe-west1",
      ]);

      const functionsRequest = new Request(`https://${siteName}.web.app/helloWorld`);

      {
        await client.deploy({
          project: projectName,
          cwd: tempDirInfo.tempDir.name,
          only: "hosting,functions",
        });

        const staticResponse = await fetch(`https://${siteName}.web.app/index.html`);
        expect(await staticResponse.text()).to.contain("Rabbit");

        const functionsResponse = await fetch(functionsRequest, {
          headers: await createAuthHeadersForFunction("europe-west1", functionName),
        });

        const responseText = await functionsResponse.text();
        expect(responseText).to.contain("Hello from Firebase");
        expect(responseText).to.contain("europe-west1");
      }

      // Change function region in both firebase.json and function definition.
      firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
              region: "asia-northeast1",
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath, [
        "asia-northeast1",
      ]);

      {
        await client.deploy({
          project: projectName,
          cwd: tempDirInfo.tempDir.name,
          only: "hosting,functions",
          force: true,
        });

        const staticResponse = await fetch(`https://${siteName}.web.app/index.html`);
        expect(await staticResponse.text()).to.contain("Rabbit");
        const functionsResponse = await fetch(functionsRequest, {
          headers: await createAuthHeadersForFunction("asia-northeast1", functionName),
        });
        const responseText = await functionsResponse.text();

        expect(responseText).to.contain("Hello from Firebase");
        expect(responseText).to.contain("asia-northeast1");
        expect(responseText).not.to.contain("europe-west1");
      }
    }
  )
);

testCases.push(
  new TestCase(
    "should fail to deploy when rewrite function region changes and actual function region doesn't",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      let firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
              region: "europe-west1",
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };

      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      writeBasicHostingFile(tempDirInfo.hostingDirPath);

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath, [
        "europe-west1",
      ]);

      const functionsRequest = new Request(`https://${siteName}.web.app/helloWorld`);

      {
        await client.deploy({
          project: projectName,
          cwd: tempDirInfo.tempDir.name,
          only: "hosting,functions",
          force: true,
        });

        const staticResponse = await fetch(`https://${siteName}.web.app/index.html`);
        expect(await staticResponse.text()).to.contain("Rabbit");

        const functionsResponse = await fetch(functionsRequest, {
          headers: await createAuthHeadersForFunction("europe-west1", functionName),
        });

        const responseText = await functionsResponse.text();
        expect(responseText).to.contain("Hello from Firebase");
        expect(responseText).to.contain("europe-west1");
      }

      // Change function region in firebase.json.
      firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
              region: "asia-northeast1",
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      {
        await expect(
          client.deploy({
            project: projectName,
            cwd: tempDirInfo.tempDir.name,
            only: "hosting",
            force: true,
          })
        ).to.eventually.be.rejectedWith(FirebaseError);
      }
    }
  )
);

testCases.push(
  new TestCase(
    "should fail to deploy when target function doesn't exist in specified region and isn't being deployed to that region",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");

      const functionsOnlyfirebaseJson = {
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };
      writeFileSync(firebaseJsonFilePath, JSON.stringify(functionsOnlyfirebaseJson));

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath, [
        "europe-west1",
      ]);

      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "functions",
        force: true,
      });

      const fullFirebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
              region: "asia-northeast1",
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };
      writeFileSync(firebaseJsonFilePath, JSON.stringify(fullFirebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      writeBasicHostingFile(tempDirInfo.hostingDirPath);

      await expect(
        client.deploy({
          project: projectName,
          cwd: tempDirInfo.tempDir.name,
          only: "hosting",
          force: true,
        })
      ).to.eventually.be.rejectedWith(FirebaseError);
    }
  )
);

testCases.push(
  new TestCase(
    "should deploy when target function exists in prod but code isn't available",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");

      const functionsOnlyfirebaseJson = {
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };
      writeFileSync(firebaseJsonFilePath, JSON.stringify(functionsOnlyfirebaseJson));

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath);

      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "functions",
        force: true,
      });

      emptyDirSync(tempDirInfo.functionsDirPath);
      ensureDirSync(tempDirInfo.hostingDirPath);

      const firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };

      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      emptyDirSync(tempDirInfo.functionsDirPath);
      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting", // Including functions here will prompt for deletion.
        // Forcing the prompt will delete the function.
      });

      const functionsRequest = new Request(`https://${siteName}.web.app/helloWorld`);
      const functionsResponse = await fetch(functionsRequest, {
        headers: await createAuthHeadersForFunction("us-central1", functionName),
      });
      expect(await functionsResponse.text()).to.contain("Hello from Firebase");
    }
  )
);

testCases.push(
  new TestCase(
    "should fail to deploy when target function exists in prod, code isn't available, and rewrite region is specified incorrectly",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
      const functionsOnlyfirebaseJson = {
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };
      writeFileSync(firebaseJsonFilePath, JSON.stringify(functionsOnlyfirebaseJson));

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath, [
        "asia-northeast1",
      ]);

      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "functions",
        force: true,
      });

      const firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
              region: "europe-west1",
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };

      emptyDirSync(tempDirInfo.functionsDirPath);
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);

      await expect(
        client.deploy({
          project: projectName,
          cwd: tempDirInfo.tempDir.name,
          only: "hosting", // Including functions here will prompt for deletion.
          // Forcing the prompt will delete the function.
        })
      ).to.eventually.be.rejectedWith(FirebaseError);
    }
  )
);

testCases.push(
  new TestCase(
    "should deploy when target function exists in prod, codebase isn't available, and region matches",
    async (siteName: string, functionName: string, tempDirInfo: TempDirectoryInfo) => {
      const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");

      const functionsOnlyfirebaseJson = {
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };
      writeFileSync(firebaseJsonFilePath, JSON.stringify(functionsOnlyfirebaseJson));

      writeHelloWorldFunctionWithRegions(functionName, tempDirInfo.functionsDirPath, [
        "asia-northeast1",
      ]);

      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "functions",
        force: true,
      });

      emptyDirSync(tempDirInfo.functionsDirPath);
      const firebaseJson = {
        hosting: {
          public: "hosting",
          target: siteName,
          rewrites: [
            {
              source: "/helloWorld",
              function: functionName,
              region: "asia-northeast1",
            },
          ],
        },
        functions: [
          {
            source: "functions",
            codebase: functionName,
          },
        ],
      };
      writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
      ensureDirSync(tempDirInfo.hostingDirPath);
      await client.deploy({
        project: projectName,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting", // Including functions here will prompt for deletion.
        // Forcing the prompt will delete the function.
      });

      {
        const functionsRequest = new Request(`https://${siteName}.web.app/helloWorld`);
        const functionsResponse = await fetch(functionsRequest, {
          headers: await createAuthHeadersForFunction("asia-northeast1", functionName),
        });
        expect(await functionsResponse.text()).to.contain("Hello from Firebase");
      }
    }
  )
);

describe("deploy function-targeted rewrites and functions", () => {
  const beforePromise = (async () => {
    console.log("attempting to delete old sites");
    await deleteOldSites();
    console.log("deleted old sites");
  })();

  // All test cases run concurrently. Isolation is handled by creating separate hosting
  // sites and deploying to separate functions codebases.
  const executor = new QueueExecutor({ concurrency: testConcurrency });
  const testQueue = testCases.map(async (testCase) => {
    console.log("queueing up a test");
    return executor.run(async () => {
      console.log("queued up a test");
      await beforePromise;
      console.log("before is done");
      return testCase.getDonePromise();
    });
  });

  testCases.forEach((testCase) => {
    it(testCase.description, async () => {
      try {
        console.log("waiting for queue to finish");
        await Promise.allSettled(testQueue);
      } catch (e) {
        // We want to wait for all tests to be finished, but don't care if any fail.
      }
      console.log("checking our test case");
      await testCase.getDonePromise();
    }).timeout(900 * 1e3);
  });

  // // For serial execution, comment the block above and uncomment the block below:
  // testCases.forEach((testCase) => {
  //   it(testCase.description, async () => {
  //     await beforePromise;
  //     await testCase.getDonePromise();
  //   }).timeout(900 * 1e3);
  // });
}).timeout(1000 * 1e3);
