import { expect } from "chai";

import * as specHelper from "./specHelper";
import { Resource } from "../types";
import { FirebaseError } from "../../error";
import { Runtime } from "../../deploy/functions/runtimes/supported";
import { FIXTURE_DIR as MINIMAL_EXT_DIR } from "../../test/fixtures/extension-yamls/minimal";
import { FIXTURE_DIR as HELLO_WORLD_EXT_DIR } from "../../test/fixtures/extension-yamls/hello-world";

const testResource: Resource = {
  name: "test-resource",
  entryPoint: "functionName",
  type: "firebaseextensions.v1beta.function",
  properties: {
    timeout: "3s",
    location: "us-east1",
    availableMemoryMb: 1024,
  },
};

describe("readExtensionYaml", () => {
  const testCases: {
    desc: string;
    directory: string;
    expected: any; // ExtensionSpec
  }[] = [
    {
      desc: "should read a minimal extension.yaml",
      directory: MINIMAL_EXT_DIR,
      expected: {
        apis: [],
        contributors: [],
        description: "Sends the world a greeting.",
        displayName: "Greet the world",
        events: [],
        externalServices: [],
        license: "Apache-2.0",
        lifecycleEvents: [],
        name: "greet-the-world",
        params: [],
        resources: [],
        roles: [],
        specVersion: "v1beta",
        systemParams: [],
        version: "0.0.1",
      },
    },
    {
      desc: "should read a hello-world extension.yaml",
      directory: HELLO_WORLD_EXT_DIR,
      expected: {
        apis: [],
        billingRequired: true,
        contributors: [],
        description: "Sends the world a greeting.",
        displayName: "Greet the world",
        events: [],
        externalServices: [],
        license: "Apache-2.0",
        lifecycleEvents: [],
        name: "greet-the-world",
        params: [
          {
            default: "Hello",
            description:
              "What do you want to say to the world? For example, Hello world? or What's up, world?",
            immutable: false,
            label: "Greeting for the world",
            param: "GREETING",
            required: true,
            type: "string",
          },
        ],
        resources: [
          {
            description:
              "HTTP request-triggered function that responds with a specified greeting message",
            name: "greetTheWorld",
            properties: {
              httpsTrigger: {},
              runtime: "nodejs16",
            },
            type: "firebaseextensions.v1beta.function",
          },
        ],
        roles: [],
        sourceUrl: "https://github.com/ORG_OR_USER/REPO_NAME",
        specVersion: "v1beta",
        systemParams: [],
        version: "0.0.1",
      },
    },
  ];
  for (const tc of testCases) {
    it(tc.desc, async () => {
      const spec = await specHelper.readExtensionYaml(tc.directory);
      expect(spec).to.deep.equal(tc.expected);
    });
  }
});

describe("getRuntime", () => {
  it("gets runtime of resources", () => {
    const r1 = {
      ...testResource,
      properties: {
        runtime: "nodejs14" as const,
      },
    };
    const r2 = {
      ...testResource,
      properties: {
        runtime: "nodejs14" as const,
      },
    };
    expect(specHelper.getRuntime([r1, r2])).to.equal("nodejs14");
  });

  it("chooses the latest runtime if many runtime exists", () => {
    const r1 = {
      ...testResource,
      properties: {
        runtime: "nodejs12" as const,
      },
    };
    const r2 = {
      ...testResource,
      properties: {
        runtime: "nodejs14" as const,
      },
    };
    expect(specHelper.getRuntime([r1, r2])).to.equal("nodejs14");
  });

  it("returns default runtime if none specified", () => {
    const r1 = {
      ...testResource,
      properties: {},
    };
    const r2 = {
      ...testResource,
      properties: {},
    };
    expect(specHelper.getRuntime([r1, r2])).to.equal(specHelper.DEFAULT_RUNTIME);
  });

  it("returns default runtime given no resources", () => {
    expect(specHelper.getRuntime([])).to.equal(specHelper.DEFAULT_RUNTIME);
  });

  it("throws error given invalid runtime", () => {
    const r1 = {
      ...testResource,
      properties: {
        // Note: as const won't work since this is actually an invalid runtime.
        runtime: "dotnet6" as Runtime,
      },
    };
    const r2 = {
      ...testResource,
      properties: {
        runtime: "nodejs14" as const,
      },
    };
    expect(() => specHelper.getRuntime([r1, r2])).to.throw(FirebaseError);
  });
});
