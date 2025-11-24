import { startAgentTest } from "../../runner/index";
import { AgentTestRunner } from "../../runner/index";
import "../../helpers/hooks.js";
import {
  ANDROID_APP_ID,
  ANDROID_PACKAGE_NAME,
  IOS_APP_ID,
} from "../../mock/mocks/get-environment-mock";

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

  it("should load command when crashlytics detected on android", async function (this: Mocha.Context) {
    const run: AgentTestRunner = await startAgentTest(this, {
      templateName: "crashlytics-android",
      toolMocks: ["getEnvironmentWithAndroidApp"],
    });

    await run.type("/mcp list");
    await run.expectText("crashlytics:connect");
  });

  it("should load command when crashlytics detected on flutter", async function (this: Mocha.Context) {
    const run: AgentTestRunner = await startAgentTest(this, {
      templateName: "crashlytics-flutter",
      toolMocks: ["getEnvironmentWithFlutterApp"],
    });

    await run.type("/mcp list");
    await run.expectText("crashlytics:connect");
  });

  it("should load command when crashlytics detected on ios", async function (this: Mocha.Context) {
    const run: AgentTestRunner = await startAgentTest(this, {
      templateName: "crashlytics-ios",
      toolMocks: ["getEnvironmentWithIosApp"],
    });

    await run.type("/mcp list");
    await run.expectText("crashlytics:connect");
  });

  it("should ask the user to choose when multiple app ids found", async function (this: Mocha.Context) {
    const run: AgentTestRunner = await startAgentTest(this, {
      // this directory is unimportant given the mocked get_environment call
      templateName: "crashlytics-flutter",
      toolMocks: ["getEnvironmentWithFlutterApp"],
    });

    await run.type("/crashlytics:connect");
    await run.expectToolCalls(["firebase_get_environment"]);

    await run.expectText("choose");
    await run.expectText(ANDROID_APP_ID);
    await run.expectText(IOS_APP_ID);

    await run.type(IOS_APP_ID);

    await run.expectText("remember");
    await run.expectText(IOS_APP_ID);

    await run.type("yes");

    await run.expectText("prioritize");
    await run.expectText("fix");
  });

  it("should remember an app id for android", async function (this: Mocha.Context) {
    const run: AgentTestRunner = await startAgentTest(this, {
      // this directory is unimportant given the mocked get_environment call
      templateName: "crashlytics-android",
      toolMocks: ["getEnvironmentWithAndroidApp"],
    });

    await run.type("/crashlytics:connect");
    await run.expectToolCalls(["firebase_get_environment"]);

    await run.expectText("remember");
    await run.expectText(ANDROID_APP_ID);

    await run.type("yes");

    await run.expectText("SaveMemory");
    await run.expectText("Memory refreshed successfully.");
    // Example text: "- The app ID for the directory /Users/fakeUser/develop/crashlytics-android is 1:1234567890:android:1234ab5678cd9101 with package name com.example.crashlytics."
    await run.expectMemory(
      new RegExp(
        `^(?=.*${ANDROID_APP_ID})(?=.*${run.dirs.runDir})(?=.*${ANDROID_PACKAGE_NAME}).*$`,
        "m",
      ),
    );
  });

  it("should use previously remembered value for android", async function (this: Mocha.Context) {
    const run: AgentTestRunner = await startAgentTest(this, {
      // this directory is unimportant given the mocked get_environment call
      templateName: "crashlytics-android",
      toolMocks: ["getEnvironmentWithAndroidApp"],
    });

    await run.remember(
      `- App ID for directory ${run.dirs.runDir}: ${ANDROID_APP_ID} (${ANDROID_PACKAGE_NAME})`,
    );

    await run.type("/crashlytics:connect");
    await run.expectToolCalls(["firebase_get_environment"]);

    await run.expectText("prioritize");
    await run.expectText("fix");
    await run.dont.expectText("SaveMemory");
    await run.dont.expectText("Memory refreshed successfully.");

    await run.type("Which app id are you using?");
    await run.expectText(ANDROID_APP_ID);
  });
});
