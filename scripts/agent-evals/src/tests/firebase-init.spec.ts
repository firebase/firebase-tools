import { startAgentTest } from "../runner/index.js";
import { AgentTestRunner } from "../runner/index.js";
import "../helpers/hooks.js";

describe("/firebase:init", function (this: Mocha.Suite) {
  this.retries(2);

  // it("backend app", async function (this: Mocha.Context) {
  //   const run: AgentTestRunner = await startAgentTest(this, {
  //     templateName: "next-app-hello-world",
  //   });

  //   await run.type("/firebase:init");
  //   await run.expectText("Backend Services");
  //   await run.expectText("AI Logic");

  //   await run.type(
  //     "Build a single page backend app with html and pure javascript. It should say Hello World, but let you login and edit the hello world text for your user",
  //   );

  //   await run.type("Yes that looks good. Use Firebase Project gcli-ext-sam-01");
  //   await run.expectToolCalls([
  //     "firebase_update_environment",
  //     {
  //       name: "firebase_read_resources",
  //       argumentContains: "firebase://guides/init/backend",
  //       successIs: true,
  //     },
  //   ]);
  // });

  it.only("WIP firebase_get_environment", async function (this: Mocha.Context) {
    const run: AgentTestRunner = await startAgentTest(this, {
      templateName: "next-app-hello-world",
    });

    await run.type("Run the firebase_get_environment function");
    await run.expectToolCalls(["firebase_get_environment"]);
  });
});
