import { startAgentTest } from "../runner/index.js";
import { AgentTestRunner } from "../runner/index.js";
// import { DEFAULT_FIREBASE_PROJECT } from "../data/index.js";
import "../helpers/hooks.js";
// import { toMockContent } from "../../mock/tool-mock-utils.js";
// import { DEFAULT_FIREBASE_USER } from "../../data/index.js";

describe("/crashlytics:connect", function (this: Mocha.Suite) {
  this.retries(2);

  it("should not load if no crashlytics detected", async function (this: Mocha.Context) {
    const run: AgentTestRunner = await startAgentTest(this, {
      templateName: "next-app-hello-world",
      toolMocks: [],
    });

    await run.type("/mcp list");
    await run.not.expectText("crashlytics:connect");
  });

  it("should load command when crashlytics detected", async function (this: Mocha.Context) {
    const run: AgentTestRunner = await startAgentTest(this, {
      templateName: "crashlytics-android",
      toolMocks: [],
    });

    await run.type("/mcp list");
    await run.expectText("crashlytics:connect");
  });

  it("should remember an app id for android", async function (this: Mocha.Context) {
    const run: AgentTestRunner = await startAgentTest(this, {
      // this directory is unimportant given the mocked get_environment call
      templateName: "crashlytics-android",
      toolMocks: ["getEnvironmentWithAndroidApp"],
    });

    await run.type("/crashlytics:connect");
    await run.expectToolCalls([
      "firebase_get_environment",
    ]);

    await run.expectText("remember");
    await run.expectText("1:123456789012:android:abcdef1234567890abcdef");

    await run.type("yes");

    await run.expectText("Saved");
    await run.expectMemory(
      /.*\/crashlytics-android.*:.*(1:123456789012:android:abcdef1234567890abcdef.*com\.example\.crashlytics|com\.example\.crashlytics.*1:123456789012:android:abcdef1234567890abcdef).*/
    );
  });

  // it("should ask to remember an app id for a directory", async function (this: Mocha.Context) {
  //   const run: AgentTestRunner = await startAgentTest(this, {
  //     templateName: "next-app-hello-world",
  //     toolMocks: ["getEnvironmentWithAndroidApp"],
  //   });

  //   await run.type("/crashlytics:connect");
  //   await run.expectTextContains(/Would you like to remember this app for this directory?/);
  //   await run.type("Yes");
  //   await run.expectMemoryContains(/app ID for directory .*Users.fakeuser.develop.fake-project/);
  // });

  // it("backend app", async function (this: Mocha.Context) {
  //   const run: AgentTestRunner = await startAgentTest(this, {
  //     templateName: "next-app-hello-world",
  //     toolMocks: ["nextJsWithProjectMock"],
  //   });

  //   await run.type("/firebase:init");
  //   await run.expectText("Backend Services");
  //   await run.expectText("AI Logic");

  //   await run.type(
  //     "Build a single page backend app with html and pure javascript. It should say Hello World, but let you login and edit the hello world text for your user",
  //   );

  //   await run.type(`Yes that looks good. Use Firebase Project ${DEFAULT_FIREBASE_PROJECT}`);
  //   await run.expectToolCalls([
  //     "firebase_update_environment",
  //     {
  //       name: "firebase_read_resources",
  //       argumentContains: "firebase://guides/init/backend",
  //       successIs: true,
  //     },
  //   ]);
  // });
});
