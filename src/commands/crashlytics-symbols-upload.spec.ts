import * as chai from "chai";
import * as sinon from "sinon";

import { command } from "./crashlytics-symbols-upload";
import * as buildToolsJarHelper from "../crashlytics/buildToolsJarHelper";
import { FirebaseError } from "../error";
import * as utils from "../utils";

const expect = chai.expect;

const APP_ID = "1:1234567890:android:0123456789abcdef";
const JAR_PATH = "/tmp/crashlytics-buildtools.jar";

describe("crashlytics:symbols:upload", () => {
  let sandbox: sinon.SinonSandbox;
  let fetchBuildtoolsJarStub: sinon.SinonStub;
  let runBuildtoolsCommandStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    fetchBuildtoolsJarStub = sandbox
      .stub(buildToolsJarHelper, "fetchBuildtoolsJar")
      .resolves(JAR_PATH);
    runBuildtoolsCommandStub = sandbox.stub(buildToolsJarHelper, "runBuildtoolsCommand");
    sandbox.stub(utils, "logBullet");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should throw an error if no app ID is provided", async () => {
    await expect(command.runner()(["libnative.so"], {})).to.be.rejectedWith(
      FirebaseError,
      "set --app <appID> to a valid Firebase Android app ID",
    );
    expect(fetchBuildtoolsJarStub).to.not.have.been.called;
  });

  it("should throw an error referencing --generator for an invalid generator", async () => {
    await expect(
      command.runner()(["libnative.so"], { app: APP_ID, generator: "dsym" }),
    ).to.be.rejectedWith(FirebaseError, '--generator should be set to either "breakpad" or "csym"');
    expect(fetchBuildtoolsJarStub).to.not.have.been.called;
  });

  it("should throw an error if --generator is passed without a value", async () => {
    await expect(
      command.runner()(["libnative.so"], { app: APP_ID, generator: true }),
    ).to.be.rejectedWith(FirebaseError, '--generator should be set to either "breakpad" or "csym"');
  });

  it("should generate symbols for each file and skip upload on --dry-run", async () => {
    await command.runner()(["liba.so", "libb.so"], { app: APP_ID, dryRun: true });

    expect(runBuildtoolsCommandStub).to.have.been.calledTwice;
    const firstArgs = runBuildtoolsCommandStub.firstCall.args[1] as string[];
    expect(firstArgs).to.include("-generateNativeSymbols");
    expect(firstArgs).to.include("liba.so");
    expect(firstArgs[firstArgs.indexOf("-symbolGenerator") + 1]).to.equal("breakpad");
    expect(runBuildtoolsCommandStub.secondCall.args[1]).to.include("libb.so");
  });

  it("should upload generated symbols with the provided app ID and generator", async () => {
    await command.runner()(["liba.so"], { app: APP_ID, generator: "csym" });

    expect(runBuildtoolsCommandStub).to.have.been.calledTwice;
    const uploadArgs = runBuildtoolsCommandStub.secondCall.args[1] as string[];
    expect(uploadArgs).to.include("-uploadNativeSymbols");
    expect(uploadArgs[uploadArgs.indexOf("-googleAppId") + 1]).to.equal(APP_ID);
    expect(uploadArgs[uploadArgs.indexOf("-symbolGenerator") + 1]).to.equal("csym");
  });
});
