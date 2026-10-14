import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";

import { expect } from "chai";
import { CLIProcess } from "../integration-helpers/cli";

const FIXTURES = path.join(__dirname, "fixtures");
const FIREBASE_PROJECT = "demo-project";

interface Testcase {
  name: string;
  projectDir: string;
  expects: {
    codebase: string;
    endpoints: string[];
  }[];
}

async function runDiscoveryTest(
  projectDir: string,
  testcase: Testcase,
  env?: Record<string, string>,
): Promise<void> {
  const cli = new CLIProcess("default", projectDir);

  let outputBuffer = "";
  let output: any;
  await cli.start(
    "internaltesting:functions:discover",
    FIREBASE_PROJECT,
    ["--json"],
    (data: any) => {
      outputBuffer += data;
      try {
        output = JSON.parse(outputBuffer);
        return true;
      } catch (e) {
        // Not complete JSON yet, continue buffering
        return false;
      }
    },
    env,
  );

  expect(output.status).to.equal("success");
  for (const e of testcase.expects) {
    const endpoints = output.result?.[e.codebase]?.endpoints;
    expect(endpoints).to.be.an("object").that.is.not.empty;
    expect(Object.keys(endpoints)).to.have.length(e.endpoints.length);
    expect(Object.keys(endpoints)).to.include.members(e.endpoints);
  }

  await cli.stop();
}

describe("Function discovery test", function (this) {
  this.timeout(2000_000);

  before(() => {
    expect(FIREBASE_PROJECT).to.exist.and.not.be.empty;
  });

  const testCases: Testcase[] = [
    {
      name: "simple",
      projectDir: "simple",
      expects: [
        {
          codebase: "default",
          endpoints: ["hellov1", "hellov2"],
        },
      ],
    },
    {
      name: "esm",
      projectDir: "esm",
      expects: [
        {
          codebase: "default",
          endpoints: ["hellov1", "hellov2"],
        },
      ],
    },
    {
      name: "codebases",
      projectDir: "codebases",
      expects: [
        {
          codebase: "v1",
          endpoints: ["hellov1"],
        },
        {
          codebase: "v2",
          endpoints: ["hellov2"],
        },
      ],
    },
    {
      name: "yarn-workspaces",
      projectDir: "yarn-workspaces",
      expects: [
        {
          codebase: "default",
          endpoints: ["hellov1", "hellov2"],
        },
      ],
    },
    {
      name: "bundled",
      projectDir: "bundled",
      expects: [
        {
          codebase: "default",
          endpoints: ["hello"],
        },
      ],
    },
    {
      name: "pnpm",
      projectDir: "pnpm",
      expects: [
        {
          codebase: "default",
          endpoints: ["hellov1", "hellov2"],
        },
      ],
    },
    {
      name: "stress-test",
      projectDir: "stress-test",
      expects: [
        {
          codebase: "default",
          endpoints: Array.from({ length: 20 }, (_, i) => `stressFunction${i + 1}`),
        },
      ],
    },
  ];

  describe("detectFromPort", () => {
    for (const tc of testCases) {
      it(`discovers functions using HTTP in a ${tc.name} project`, async () => {
        await runDiscoveryTest(path.join(FIXTURES, tc.projectDir), tc);
      });
    }
  });

  describe("detectFromOutputPath", () => {
    for (const tc of testCases) {
      it(`discovers functions using file-based discovery in a ${tc.name} project`, async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "firebase-test-"));
        try {
          await runDiscoveryTest(path.join(FIXTURES, tc.projectDir), tc, {
            FIREBASE_FUNCTIONS_DISCOVERY_OUTPUT_PATH: tempDir,
          });
        } finally {
          // Clean up the temp directory
          await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {
            // Ignore cleanup errors
          });
        }
      });
    }
  });
});
