import { startAgentTest } from "../runner/index.js";
import { AgentTestRunner } from "../runner/index.js";
import { DEFAULT_FIREBASE_PROJECT } from "../data/index.js";
import "../helpers/hooks.js";

const PROMPT = `"Follow these steps:
 1) Read the @firestore.rules file
 2) Generate a \`firestore.rules.spec.json\` file with at least 1 ALLOW and 1 DENY rule for each "match" case in the firestore.rules file
 3) Run \`firebase firestore:rules:test firestore.rules firestore.rules.spec.json\`
 4) Report any security issues with the application"

The schema for the firestore.rules.spec.json file is as follows:

\`\`\`ts

\`\`\`

Example firestore.rules.spec.json:

\`\`\`json
{
  "testCases": [
    {
      "expectation": "ALLOW",
      "request": {
        "auth": {
          "uid": "testuser"
        },
        "time": "2025-12-13T00:00:00Z",
        "method": "get",
        "path": "/databases/(default)/documents/users/testuser"
      },
      "resource": {
        "data": {
          "owner": "testuser"
        }
      }
    },
    {
      "expectation": "DENY",
      "request": {
        "auth": {
          "uid": "anotheruser"
        },
        "time": "2025-12-15T00:00:00Z",
        "method": "get",
        "path": "/databases/(default)/documents/users/testuser"
      },
      "resource": {
        "data": {
          "owner": "testuser"
        }
      }
    }
  ]
}
\`\`\`

`

describe("firestore:rules:test", function (this: Mocha.Suite) {
  this.retries(2);

  it("backend app", async function (this: Mocha.Context) {
    const run: AgentTestRunner = await startAgentTest(this, {
      templateName: "next-app-rules-simple",
      toolMocks: [],
    });

    await run.type();
  });
});
