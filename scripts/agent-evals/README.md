# Agent Evals

This codebase evaluates the Firebase MCP server running in various coding agents.

## Running Tests

Agent Evals use [mocha](https://www.npmjs.com/package/mocha) to run tests, similar to how the Firebase CLI unit tests are implemented. The test commands will automatically instrument the Firebase MCP Server.

WARNING: Running evals will remove any existing Firebase MCP Servers and the Firebase Gemini CLI Extension from your user account so that they don't interfere with the test.

For running tests during development, run:

```bash
# Link and build the CLI so that the `firebase` is built with your changes
$ npm link
$ npm run build:watch

# In a separate terminal, run the test suite.
# Running test:dev will skip rebuilding the Firebase CLI (because your watch
# command is doing that for you)
$ cd scripts/agent-evals
$ npm run test:dev
```

For running in CI, the eval system will do a clean install of the Firebase CLI before running tests:

```bash
$ npm run test
```

## Writing Tests

Add a new file in `src/tests`:

```typescript
import { startAgentTest } from "../runner/index.js";
import { AgentTestRunner } from "../runner/index.js";

// Ensure you import hooks which instruments an afterEach block that cleans up
// the agent and the pseudo terminal.
import "../helpers/hooks.js";

describe("<prompt-or-tool-name>", function (this: Mocha.Suite) {
  // Recommend setting retries > 0 because LLMs are nondeterministic
  this.retries(2);

  it("<use-case>", async function (this: Mocha.Context) {
    // Start the AgentTestRunner, which will start up the coding agent in a
    // pseudo-terminal, and wait for it to load the Firebase MCP server, and
    // start accepting keystrokes
    const run: AgentTestRunner = await startAgentTest(this);

    // Simulate typing in the terminal. This will await until the "turn" is over
    // so any assertions on what happened will happen on the current "turn"
    await run.type("/firebase:init");
    // Assert that the agent outputted "Backend Services"
    await run.expectText("Backend Services");

    await run.type("Use Firebase Project `project-id-1000`");
    // Assert that a tool was called with the given arguments, and that it was
    // successful
    await run.expectToolCalls([
      "firebase_update_environment",
      argumentContains: "project-id-1000",
      isSuccess: true,
    ]);

    // Important: Expectations apply to the last "turn". Each time you type, it
    // creates a new turn. This ensures you are only asserting against the most
    // recent actions of the agent
    await run.type("Hello world");
    // This will fail, because "Hello World" doesn't trigger a tool call
    await run.expectToolCalls([
      "firebase_update_environment",
      argumentContains: "project-id-1000",
      isSuccess: true,
    ]);
  });
});
```

