import { expect } from "chai";
import * as sinon from "sinon";

import * as resolveSource from "../../extensions/resolveSource";
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
    params: [],
    sourceUrl: "github.com/test/meout",
  },
};

describe("displayWarningPrompts", () => {
  let getTrustedPublisherStub: sinon.SinonStub;
  let logLabeledStub: sinon.SinonStub;

  beforeEach(() => {
    getTrustedPublisherStub = sinon.stub(resolveSource, "getTrustedPublishers");
    getTrustedPublisherStub.returns(["firebase"]);
    logLabeledStub = sinon.stub(utils, "logLabeledBullet");
  });

  afterEach(() => {
    getTrustedPublisherStub.restore();
    logLabeledStub.restore();
  });

  it("should not warn or prompt if from trusted publisher and not experimental", async () => {
    const publisherId = "firebase";

    await warnings.displayWarningPrompts(
      publisherId,
      RegistryLaunchStage.BETA,
      testExtensionVersion
    );

    expect(logLabeledStub).to.not.have.been.called;
  });

  it("should prompt if experimental", async () => {
    const publisherId = "firebase";

    await warnings.displayWarningPrompts(
      publisherId,
      RegistryLaunchStage.EXPERIMENTAL,
      testExtensionVersion
    );

    expect(logLabeledStub).to.have.been.calledWithMatch("extensions", "experimental");
  });

  it("should prompt if the publisher is not on the approved publisher list", async () => {
    const publisherId = "pubby-mcpublisher";

    await warnings.displayWarningPrompts(
      publisherId,
      RegistryLaunchStage.BETA,
      testExtensionVersion
    );

    expect(logLabeledStub).to.have.been.calledWithMatch("extensions", "Early Access Program");
  });
});
