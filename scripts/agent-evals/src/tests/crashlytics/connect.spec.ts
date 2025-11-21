import { startAgentTest } from "../../runner/index";
import { AgentTestRunner } from "../../runner/index";
import "../../helpers/hooks.js";

describe("/crashlytics:connect", function (this: Mocha.Suite) {
  this.retries(2);

  it("should not load if no crashlytics detected", async function (this: Mocha.Context) {
    const run: AgentTestRunner = await startAgentTest(this, {
      templateName: "next-app-hello-world",
      toolMocks: ["nextJsWithProjectMock"],
    });

    await run.type("/mcp list");
    await run.dont.expectText("crashlytics:connect");
  });

  it("should load command when crashlytics detected", async function (this: Mocha.Context) {
    const run: AgentTestRunner = await startAgentTest(this, {
      templateName: "crashlytics-android",
      toolMocks: ["getEnvironmentWithAndroidApp"],
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
    // Example text: "- The app ID for the directory /Users/fakeUser/develop/crashlytics-android is 1:1234567890:android:1234ab5678cd9101 with package name com.example.crashlytics."
    await run.expectMemory(
      /.*\/crashlytics-android.*(1:123456789012:android:abcdef1234567890abcdef.*com\.example\.crashlytics|com\.example\.crashlytics.*1:123456789012:android:abcdef1234567890abcdef).*/
    );
  });
});
