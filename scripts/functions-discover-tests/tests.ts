import * as path from "path";

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

  for (const tc of testCases) {
    it(`discovers functions using HTTP in a ${tc.name} project`, async () => {
      const cli = new CLIProcess("default", path.join(FIXTURES, tc.projectDir));

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
      );
      expect(output.status).to.equal("success");
      for (const e of tc.expects) {
        const endpoints = output.result?.[e.codebase]?.endpoints;
        expect(endpoints).to.be.an("object").that.is.not.empty;
        expect(Object.keys(endpoints)).to.have.length(e.endpoints.length);
        expect(Object.keys(endpoints)).to.include.members(e.endpoints);
      }

      await cli.stop();
    });
  }

  describe("file-based discovery", () => {
    for (const tc of testCases) {
      it(`discovers functions using file-based discovery in a ${tc.name} project`, async () => {
        const cli = new CLIProcess("default", path.join(FIXTURES, tc.projectDir));
        const manifestPath = path.join(FIXTURES, tc.projectDir, `.test-manifest-${Date.now()}.yaml`);

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
          { FUNCTIONS_MANIFEST_OUTPUT_PATH: manifestPath },
        );
        expect(output.status).to.equal("success");
        for (const e of tc.expects) {
          const endpoints = output.result?.[e.codebase]?.endpoints;
          expect(endpoints).to.be.an("object").that.is.not.empty;
          expect(Object.keys(endpoints)).to.have.length(e.endpoints.length);
          expect(Object.keys(endpoints)).to.include.members(e.endpoints);
        }

        await cli.stop();
        
        // Clean up test manifest file if it exists
        try {
          const fs = await import("fs");
          await fs.promises.unlink(manifestPath);
        } catch (err) {
          // Ignore if file doesn't exist
        }
      });
    }
  });
});
