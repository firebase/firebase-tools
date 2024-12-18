import { expect } from "chai";
import { join } from "path";
import { writeFileSync, emptyDirSync, ensureDirSync } from "fs-extra";
import * as tmp from "tmp";

import * as firebase from "../../../src";
import { execSync } from "child_process";
import { command as functionsDelete } from "../../../src/commands/functions-delete";
import fetch, { Request } from "node-fetch";
import { FirebaseError } from "../../../src/error";

tmp.setGracefulCleanup();

// Run this test manually by:
// - Setting the target project to any project that can create publicly invokable functions.
// - Disabling mockAuth in .mocharc

const functionName = `helloWorld_${process.env.CI_RUN_ID || "XX"}_${
  process.env.CI_RUN_ATTEMPT || "YY"
}`;

// Typescript doesn't like calling functions on `firebase`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client: any = firebase;

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

async function deleteDeployedFunctions(): Promise<void> {
  try {
    await functionsDelete.runner()([functionName], {
      projectId: process.env.FBTOOLS_TARGET_PROJECT,
      force: true,
    });
  } catch (FirebaseError) {
    // do nothing if the function doesn't match.
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
  functionRegions?: string[],
): void {
  ensureDirSync(functionsDirectory);

  const region = functionRegions ? `.region(${functionRegionString(functionRegions)})` : "";
  const functionFileContents = `
const functions = require("firebase-functions");

exports.${functionName} = functions${region}.https.onRequest((request, response) => {
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
< /html>`,
  );
}

class TempDirectoryInfo {
  tempDir = tmp.dirSync({ prefix: "hosting_rewrites_tests_" });
  firebasercFilePath = join(this.tempDir.name, ".", ".firebaserc");
  hostingDirPath = join(this.tempDir.name, ".", "hosting");
}

describe("deploy function-targeted rewrites And functions", () => {
  let tempDirInfo = new TempDirectoryInfo();

  // eslint-disable-next-line prefer-arrow-callback
  beforeEach(async function () {
    tempDirInfo = new TempDirectoryInfo();
    // eslint-disable-next-line @typescript-eslint/no-invalid-this
    this.timeout(100 * 1e3);
    await deleteDeployedFunctions();
    emptyDirSync(tempDirInfo.tempDir.name);
    writeFirebaseRc(tempDirInfo.firebasercFilePath);
  });

  afterEach(async function () {
    // eslint-disable-next-line @typescript-eslint/no-invalid-this
    this.timeout(100 * 1e3);
    await deleteDeployedFunctions();
  });

  after(async function () {
    // eslint-disable-next-line @typescript-eslint/no-invalid-this
    this.timeout(100 * 1e3);
    await deleteDeployedFunctions();
  });

  it("should deploy with default function region", async () => {
    const firebaseJson = {
      hosting: {
        public: "hosting",
        rewrites: [
          {
            source: "/helloWorld",
            function: functionName,
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
    );

    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "hosting,functions",
      force: true,
    });

    const staticResponse = await fetch(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/index.html`,
    );
    expect(await staticResponse.text()).to.contain("Rabbit");

    const functionsRequest = new Request(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/helloWorld`,
    );

    const functionsResponse = await fetch(functionsRequest);

    expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  }).timeout(1000 * 1e3);

  it("should deploy with default function region explicitly specified in rewrite", async () => {
    const firebaseJson = {
      hosting: {
        public: "hosting",
        rewrites: [
          {
            source: "/helloWorld",
            function: functionName,
            region: "us-central1",
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
    );

    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "hosting,functions",
      force: true,
    });

    const staticResponse = await fetch(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/index.html`,
    );
    expect(await staticResponse.text()).to.contain("Rabbit");

    const functionsRequest = new Request(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/helloWorld`,
    );

    const functionsResponse = await fetch(functionsRequest);

    expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  }).timeout(1000 * 1e3);

  it("should deploy with autodetected (not us-central1) function region", async () => {
    const firebaseJson = {
      hosting: {
        public: "hosting",
        rewrites: [
          {
            source: "/helloWorld",
            function: functionName,
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
      ["europe-west1"],
    );

    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "hosting,functions",
      force: true,
    });

    const staticResponse = await fetch(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/index.html`,
    );
    expect(await staticResponse.text()).to.contain("Rabbit");

    const functionsRequest = new Request(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/helloWorld`,
    );

    const functionsResponse = await fetch(functionsRequest);

    expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  }).timeout(1000 * 1e3);

  it("should deploy rewrites and functions with function region specified in both", async () => {
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
      ["asia-northeast1"],
    );

    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "hosting,functions",
      force: true,
    });

    const staticResponse = await fetch(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/index.html`,
    );
    expect(await staticResponse.text()).to.contain("Rabbit");

    const functionsRequest = new Request(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/helloWorld`,
    );

    const functionsResponse = await fetch(functionsRequest);

    expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  }).timeout(1000 * 1e3);

  it("should fail to deploy rewrites with the wrong function region", async () => {
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
      ["europe-west2"],
    );

    await expect(
      client.deploy({
        project: process.env.FBTOOLS_TARGET_PROJECT,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting,functions",
        force: true,
      }),
    ).to.eventually.be.rejectedWith(FirebaseError, "Unable to find a valid endpoint for function");
  }).timeout(1000 * 1e3);

  it("should fail to deploy rewrites to a function being deleted in a region", async () => {
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
      ["asia-northeast1"],
    );

    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "functions",
      force: true,
    });

    writeHelloWorldFunctionWithRegions(
      functionName,
      join(tempDirInfo.tempDir.name, ".", "functions"),
      ["europe-west1"],
    );
    await expect(
      client.deploy({
        project: process.env.FBTOOLS_TARGET_PROJECT,
        cwd: tempDirInfo.tempDir.name,
        only: "functions,hosting",
        force: true,
      }),
    ).to.eventually.be.rejectedWith(FirebaseError, "Unable to find a valid endpoint for function");
  }).timeout(1000 * 1e3);

  it("should deploy when a rewrite points to a non-existent function", async () => {
    const firebaseJson = {
      hosting: {
        public: "hosting",
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
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "hosting,functions",
      force: true,
    });

    const staticResponse = await fetch(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/index.html`,
    );
    expect(await staticResponse.text()).to.contain("Rabbit");
  }).timeout(1000 * 1e3);

  it("should rewrite using a specified function region for a function with multiple regions", async () => {
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
      ["asia-northeast1", "europe-west1"],
    );

    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "hosting,functions",
      force: true,
    });

    const staticResponse = await fetch(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/index.html`,
    );
    expect(await staticResponse.text()).to.contain("Rabbit");

    const functionsRequest = new Request(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/helloWorld`,
    );

    const functionsResponse = await fetch(functionsRequest);

    expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  }).timeout(1000 * 1e3);

  it("should rewrite to the default of us-central1 if multiple regions including us-central1 are available", async () => {
    const firebaseJson = {
      hosting: {
        public: "hosting",
        rewrites: [
          {
            source: "/helloWorld",
            function: functionName,
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
      ["asia-northeast1", "us-central1"],
    );

    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "hosting,functions",
      force: true,
    });

    const staticResponse = await fetch(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/index.html`,
    );
    expect(await staticResponse.text()).to.contain("Rabbit");

    const functionsRequest = new Request(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/helloWorld`,
    );

    const functionsResponse = await fetch(functionsRequest);

    expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  }).timeout(1000 * 1e3);

  it("should fail when rewrite points to an invalid region for a function with multiple regions", async () => {
    const firebaseJson = {
      hosting: {
        public: "hosting",
        rewrites: [
          {
            source: "/helloWorld",
            function: functionName,
            region: "us-east1",
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
      ["asia-northeast1", "europe-west1"],
    );

    await expect(
      client.deploy({
        project: process.env.FBTOOLS_TARGET_PROJECT,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting,functions",
      }),
    ).to.eventually.be.rejectedWith(FirebaseError, "Unable to find a valid endpoint for function");
  }).timeout(1000 * 1e3);

  it("should fail when rewrite has no region specified for a function with multiple regions", async () => {
    const firebaseJson = {
      hosting: {
        public: "hosting",
        rewrites: [
          {
            source: "/helloWorld",
            function: functionName,
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
      ["asia-northeast1", "europe-west1"],
    );

    await expect(
      client.deploy({
        project: process.env.FBTOOLS_TARGET_PROJECT,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting,functions",
        force: true,
      }),
    ).to.eventually.be.rejectedWith(FirebaseError, "More than one backend found for function");
  }).timeout(1000 * 1e3);

  it("should deploy with autodetected function region when function region is changed", async () => {
    const firebaseJson = {
      hosting: {
        public: "hosting",
        rewrites: [
          {
            source: "/helloWorld",
            function: functionName,
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
      ["europe-west1"],
    );

    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "hosting,functions",
      force: true,
    });

    const staticResponse = await fetch(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/index.html`,
    );
    expect(await staticResponse.text()).to.contain("Rabbit");

    const functionsRequest = new Request(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/helloWorld`,
    );

    const functionsResponse = await fetch(functionsRequest);
    const responseText = await functionsResponse.text();
    expect(responseText).to.contain("Hello from Firebase");
    expect(responseText).to.contain("europe-west1");

    writeHelloWorldFunctionWithRegions(
      functionName,
      join(tempDirInfo.tempDir.name, ".", "functions"),
      ["asia-northeast1"],
    );

    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "hosting,functions",
      force: true,
    });

    const staticResponse2 = await fetch(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/index.html`,
    );
    expect(await staticResponse2.text()).to.contain("Rabbit");
    const functionsResponse2 = await fetch(functionsRequest);
    const responseText2 = await functionsResponse2.text();

    expect(responseText2).to.contain("Hello from Firebase");
    expect(responseText2).to.contain("asia-northeast1");
    expect(responseText2).not.to.contain("europe-west1");
  }).timeout(1000 * 1e3);

  it("should deploy with specified function region when function region is changed", async () => {
    let firebaseJson = {
      hosting: {
        public: "hosting",
        rewrites: [
          {
            source: "/helloWorld",
            function: functionName,
            region: "europe-west1",
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
      ["europe-west1"],
    );

    const functionsRequest = new Request(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/helloWorld`,
    );

    {
      await client.deploy({
        project: process.env.FBTOOLS_TARGET_PROJECT,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting,functions",
      });

      const staticResponse = await fetch(
        `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/index.html`,
      );
      expect(await staticResponse.text()).to.contain("Rabbit");

      const functionsResponse = await fetch(functionsRequest);

      const responseText = await functionsResponse.text();
      expect(responseText).to.contain("Hello from Firebase");
      expect(responseText).to.contain("europe-west1");
    }

    // Change function region in both firebase.json and function definition.
    firebaseJson = {
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
    writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
    writeHelloWorldFunctionWithRegions(
      functionName,
      join(tempDirInfo.tempDir.name, ".", "functions"),
      ["asia-northeast1"],
    );

    {
      await client.deploy({
        project: process.env.FBTOOLS_TARGET_PROJECT,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting,functions",
        force: true,
      });

      const staticResponse = await fetch(
        `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/index.html`,
      );
      expect(await staticResponse.text()).to.contain("Rabbit");
      const functionsResponse = await fetch(functionsRequest);
      const responseText = await functionsResponse.text();

      expect(responseText).to.contain("Hello from Firebase");
      expect(responseText).to.contain("asia-northeast1");
      expect(responseText).not.to.contain("europe-west1");
    }
  }).timeout(1000 * 1e3);

  it("should fail to deploy when rewrite function region changes and actual function region doesn't", async () => {
    let firebaseJson = {
      hosting: {
        public: "hosting",
        rewrites: [
          {
            source: "/helloWorld",
            function: functionName,
            region: "europe-west1",
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
      ["europe-west1"],
    );

    const functionsRequest = new Request(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/helloWorld`,
    );

    {
      await client.deploy({
        project: process.env.FBTOOLS_TARGET_PROJECT,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting,functions",
        force: true,
      });

      const staticResponse = await fetch(
        `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/index.html`,
      );
      expect(await staticResponse.text()).to.contain("Rabbit");

      const functionsResponse = await fetch(functionsRequest);

      const responseText = await functionsResponse.text();
      expect(responseText).to.contain("Hello from Firebase");
      expect(responseText).to.contain("europe-west1");
    }

    // Change function region in both firebase.json.
    firebaseJson = {
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
    writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
    {
      await expect(
        client.deploy({
          project: process.env.FBTOOLS_TARGET_PROJECT,
          cwd: tempDirInfo.tempDir.name,
          only: "hosting",
          force: true,
        }),
      ).to.eventually.be.rejectedWith(FirebaseError);
    }
  }).timeout(1000 * 1e3);

  it("should fail to deploy when target function doesn't exist in specified region and isn't being deployed to that region", async () => {
    const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
    writeFileSync(firebaseJsonFilePath, "{}");

    writeHelloWorldFunctionWithRegions(
      functionName,
      join(tempDirInfo.tempDir.name, ".", "functions"),
      ["europe-west1"],
    );

    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "functions",
      force: true,
    });

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
    writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
    ensureDirSync(tempDirInfo.hostingDirPath);
    writeBasicHostingFile(tempDirInfo.hostingDirPath);

    await expect(
      client.deploy({
        project: process.env.FBTOOLS_TARGET_PROJECT,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting",
        force: true,
      }),
    ).to.eventually.be.rejectedWith(FirebaseError);
  }).timeout(1000 * 1e3);

  it("should deploy when target function exists in prod but code isn't available", async () => {
    const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
    writeFileSync(firebaseJsonFilePath, "{}");
    writeHelloWorldFunctionWithRegions(
      functionName,
      join(tempDirInfo.tempDir.name, ".", "functions"),
    );

    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "functions",
      force: true,
    });

    emptyDirSync(join(tempDirInfo.tempDir.name, ".", "functions"));
    ensureDirSync(tempDirInfo.hostingDirPath);

    const firebaseJson = {
      hosting: {
        public: "hosting",
        rewrites: [
          {
            source: "/helloWorld",
            function: functionName,
          },
        ],
      },
    };

    writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
    emptyDirSync(join(tempDirInfo.tempDir.name, ".", "functions"));
    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "hosting", // Including functions here will prompt for deletion.
      // Forcing the prompt will delete the function.
    });

    const functionsRequest = new Request(
      `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/helloWorld`,
    );

    const functionsResponse = await fetch(functionsRequest);
    expect(await functionsResponse.text()).to.contain("Hello from Firebase");
  }).timeout(1000 * 1e3);

  it("should fail to deploy when target function exists in prod, code isn't available, and rewrite region is specified incorrectly", async () => {
    const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
    writeHelloWorldFunctionWithRegions(
      functionName,
      join(tempDirInfo.tempDir.name, ".", "functions"),
      ["asia-northeast1"],
    );
    writeFileSync(firebaseJsonFilePath, "{}");

    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "functions",
      force: true,
    });

    const firebaseJson = {
      hosting: {
        public: "hosting",
        rewrites: [
          {
            source: "/helloWorld",
            function: functionName,
            region: "europe-west1",
          },
        ],
      },
    };

    emptyDirSync(join(tempDirInfo.tempDir.name, ".", "functions"));
    writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
    ensureDirSync(tempDirInfo.hostingDirPath);

    await expect(
      client.deploy({
        project: process.env.FBTOOLS_TARGET_PROJECT,
        cwd: tempDirInfo.tempDir.name,
        only: "hosting", // Including functions here will prompt for deletion.
        // Forcing the prompt will delete the function.
      }),
    ).to.eventually.be.rejectedWith(FirebaseError);
  }).timeout(1000 * 1e3);

  it("should deploy when target function exists in prod, codebase isn't available, and region matches", async () => {
    const firebaseJsonFilePath = join(tempDirInfo.tempDir.name, ".", "firebase.json");
    writeFileSync(firebaseJsonFilePath, "{}");
    writeHelloWorldFunctionWithRegions(
      functionName,
      join(tempDirInfo.tempDir.name, ".", "functions"),
      ["asia-northeast1"],
    );

    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "functions",
      force: true,
    });

    emptyDirSync(join(tempDirInfo.tempDir.name, ".", "functions"));
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
    writeFileSync(firebaseJsonFilePath, JSON.stringify(firebaseJson));
    ensureDirSync(tempDirInfo.hostingDirPath);
    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: tempDirInfo.tempDir.name,
      only: "hosting", // Including functions here will prompt for deletion.
      // Forcing the prompt will delete the function.
    });

    {
      const functionsRequest = new Request(
        `https://${process.env.FBTOOLS_CLIENT_INTEGRATION_SITE}.web.app/helloWorld`,
      );

      const functionsResponse = await fetch(functionsRequest);
      expect(await functionsResponse.text()).to.contain("Hello from Firebase");
    }
  }).timeout(1000 * 1e3);
}).timeout(1000 * 1e3);
