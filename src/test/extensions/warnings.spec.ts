import { expect } from "chai";
import * as sinon from "sinon";

import * as warnings from "../../extensions/warnings";
import {
  Extension,
  ExtensionVersion,
  ListingState,
  RegistryLaunchStage,
  Visibility,
} from "../../extensions/types";
import { DeploymentInstanceSpec } from "../../deploy/extensions/planner";
import * as utils from "../../utils";

const testExtensionVersion = (listingState: ListingState): ExtensionVersion => {
  return {
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
      systemParams: [],
      sourceUrl: "github.com/test/meout",
    },
    listing: {
      state: listingState,
    },
  };
};

const testExtension = (publisherId: string): Extension => {
  return {
    name: "test",
    state: "PUBLISHED",
    ref: `${publisherId}/test`,
    registryLaunchStage: RegistryLaunchStage.BETA,
    createTime: "101",
    visibility: Visibility.PUBLIC,
  };
};

const testInstanceSpec = (
  publisherId: string,
  instanceId: string,
  listingState: ListingState,
): DeploymentInstanceSpec => {
  return {
    instanceId,
    ref: {
      publisherId,
      extensionId: "test",
      version: "0.1.0",
    },
    params: {},
    systemParams: {},
    extensionVersion: testExtensionVersion(listingState),
    extension: testExtension(publisherId),
  };
};

describe("displayWarningsForDeploy", () => {
  let loggerStub: sinon.SinonStub;

  beforeEach(() => {
    loggerStub = sinon.stub(utils, "logLabeledBullet");
  });

  afterEach(() => {
    loggerStub.restore();
  });

  it("should not warn if published", async () => {
    const toCreate = [
      testInstanceSpec("firebase", "ext-id-1", "APPROVED"),
      testInstanceSpec("firebase", "ext-id-2", "APPROVED"),
    ];

    const warned = await warnings.displayWarningsForDeploy(toCreate);

    expect(warned).to.be.false;
    expect(loggerStub).to.not.have.been.called;
  });

  it("should not warn if not published", async () => {
    const toCreate = [
      testInstanceSpec("pubby-mcpublisher", "ext-id-1", "PENDING"),
      testInstanceSpec("pubby-mcpublisher", "ext-id-2", "REJECTED"),
    ];

    const warned = await warnings.displayWarningsForDeploy(toCreate);

    expect(warned).to.be.true;
    expect(loggerStub).to.have.been.calledWithMatch(
      "extensions",
      "have not been published to the Firebase Extensions Hub",
    );
  });
});
