import { expect } from "chai";
import * as sinon from "sinon";

import * as resolveSource from "../../extensions/resolveSource";
import * as prompt from "../../prompt";
import * as utils from "../../utils";
import * as warnings from "../../extensions/warnings";
import { ExtensionVersion, RegistryLaunchStage } from "../../extensions/extensionsApi";

const testExtensionVersion: ExtensionVersion = {
  name: "test",
  ref: "test/test@0.1.0",
  hash: "abc123",
  sourceDownloadUri: "https://download.com/source",
  spec: {
    name: "test",
    version: "0.1.0",
    resources: [],
    sourceUrl: "github.com/test/meout",
  },
};
describe("displayWarningPrompts", () => {
  let getTrustedPublisherStub: sinon.SinonStub;
  let promptOnceStub: sinon.SinonStub;
  let logLabeledStub: sinon.SinonStub;

  beforeEach(() => {
    getTrustedPublisherStub = sinon.stub(resolveSource, "getTrustedPublishers");
    getTrustedPublisherStub.returns(["firebase"]);
    promptOnceStub = sinon.stub(prompt, "promptOnce");
    promptOnceStub.rejects("UNDEFINED TEST BEHAVIOR");
    logLabeledStub = sinon.stub(utils, "logLabeledBullet");
  });

  afterEach(() => {
    getTrustedPublisherStub.restore();
    promptOnceStub.restore();
    logLabeledStub.restore();
  });

  it("should not warn or prompt if from trusted publisher and not experimental", async () => {
    const publisherId = "firebase";

    expect(
      await warnings.displayWarningPrompts(
        publisherId,
        RegistryLaunchStage.BETA,
        testExtensionVersion
      )
    ).to.be.true;

    expect(logLabeledStub).to.not.have.been.called;
    expect(promptOnceStub).to.not.have.been.called;
  });

  it("should prompt if experimental", async () => {
    promptOnceStub.onFirstCall().returns(true);
    const publisherId = "firebase";

    expect(
      await warnings.displayWarningPrompts(
        publisherId,
        RegistryLaunchStage.EXPERIMENTAL,
        testExtensionVersion
      )
    ).to.be.true;

    expect(logLabeledStub).to.have.been.calledWithMatch("extensions", "experimental");
    expect(promptOnceStub).to.have.been.called;
  });

  it("should prompt if the publisher is not on the approved publisher list", async () => {
    promptOnceStub.onFirstCall().returns(true);
    const publisherId = "pubby-mcpublisher";

    expect(
      await warnings.displayWarningPrompts(
        publisherId,
        RegistryLaunchStage.BETA,
        testExtensionVersion
      )
    ).to.be.true;

    expect(logLabeledStub).to.have.been.calledWithMatch("extensions", "Early Access Program");
    expect(promptOnceStub).to.have.been.called;
  });

  it("should return false if the user doesn't accept the prompt", async () => {
    promptOnceStub.onFirstCall().returns(false);
    const publisherId = "pubby-mcpublisher";

    expect(
      await warnings.displayWarningPrompts(
        publisherId,
        RegistryLaunchStage.EXPERIMENTAL,
        testExtensionVersion
      )
    ).to.be.false;

    expect(promptOnceStub).to.have.been.called;
  });
});
