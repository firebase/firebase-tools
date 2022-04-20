import { expect } from "chai";
import * as sinon from "sinon";

import * as resolveSource from "../../extensions/resolveSource";
import * as utils from "../../utils";
import * as warnings from "../../extensions/warnings";
import {
  Extension,
  ExtensionVersion,
  RegistryLaunchStage,
  Visibility,
} from "../../extensions/extensionsApi";
import { DeploymentInstanceSpec } from "../../deploy/extensions/planner";

const testExtensionVersion: ExtensionVersion = {
  name: "test",
  ref: "test/test@0.1.0",
  state: "PUBLISHED",
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

const testExtension = (publisherId: string, launchStage: RegistryLaunchStage): Extension => {
  return {
    name: "test",
    ref: `${publisherId}/test`,
    registryLaunchStage: launchStage,
    createTime: "101",
    visibility: Visibility.PUBLIC,
  };
};

const testInstanceSpec = (
  publisherId: string,
  instanceId: string,
  launchStage: RegistryLaunchStage
): DeploymentInstanceSpec => {
  return {
    instanceId,
    ref: {
      publisherId,
      extensionId: "test",
      version: "0.1.0",
    },
    params: {},
    extensionVersion: testExtensionVersion,
    extension: testExtension(publisherId, launchStage),
  };
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

  it("should not warn if from trusted publisher and not experimental", async () => {
    const publisherId = "firebase";

    await warnings.displayWarningPrompts(
      publisherId,
      RegistryLaunchStage.BETA,
      testExtensionVersion
    );

    expect(logLabeledStub).to.not.have.been.called;
  });

  it("should warn if experimental", async () => {
    const publisherId = "firebase";

    await warnings.displayWarningPrompts(
      publisherId,
      RegistryLaunchStage.EXPERIMENTAL,
      testExtensionVersion
    );

    expect(logLabeledStub).to.have.been.calledWithMatch("extensions", "experimental");
  });

  it("should warn if the publisher is not on the approved publisher list", async () => {
    const publisherId = "pubby-mcpublisher";

    await warnings.displayWarningPrompts(
      publisherId,
      RegistryLaunchStage.BETA,
      testExtensionVersion
    );

    expect(logLabeledStub).to.have.been.calledWithMatch("extensions", "Early Access Program");
  });
});

describe("displayWarningsForDeploy", () => {
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
    const toCreate = [
      testInstanceSpec("firebase", "ext-id-1", RegistryLaunchStage.GA),
      testInstanceSpec("firebase", "ext-id-2", RegistryLaunchStage.GA),
    ];

    const warned = await warnings.displayWarningsForDeploy(toCreate);

    expect(warned).to.be.false;
    expect(logLabeledStub).to.not.have.been.called;
  });

  it("should prompt if experimental", async () => {
    const toCreate = [
      testInstanceSpec("firebase", "ext-id-1", RegistryLaunchStage.EXPERIMENTAL),
      testInstanceSpec("firebase", "ext-id-2", RegistryLaunchStage.EXPERIMENTAL),
    ];

    const warned = await warnings.displayWarningsForDeploy(toCreate);

    expect(warned).to.be.true;
    expect(logLabeledStub).to.have.been.calledWithMatch("extensions", "experimental");
  });

  it("should prompt if the publisher is not on the approved publisher list", async () => {
    const publisherId = "pubby-mcpublisher";

    const toCreate = [
      testInstanceSpec("pubby-mcpublisher", "ext-id-1", RegistryLaunchStage.GA),
      testInstanceSpec("pubby-mcpublisher", "ext-id-2", RegistryLaunchStage.GA),
    ];

    const warned = await warnings.displayWarningsForDeploy(toCreate);

    expect(warned).to.be.true;
    expect(logLabeledStub).to.have.been.calledWithMatch("extensions", "Early Access Program");
  });

  it("should show multiple warnings at once if triggered", async () => {
    const publisherId = "pubby-mcpublisher";

    const toCreate = [
      testInstanceSpec("pubby-mcpublisher", "ext-id-1", RegistryLaunchStage.GA),
      testInstanceSpec("firebase", "ext-id-2", RegistryLaunchStage.EXPERIMENTAL),
    ];

    const warned = await warnings.displayWarningsForDeploy(toCreate);

    expect(warned).to.be.true;
    expect(logLabeledStub).to.have.been.calledWithMatch("extensions", "Early Access Program");
    expect(logLabeledStub).to.have.been.calledWithMatch("extensions", "experimental");
  });
});
