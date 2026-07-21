import { expect } from "chai";
import * as sinon from "sinon";

import * as warnings from "./warnings";
import {
  Extension,
  ExtensionVersion,
  ListingState,
  RegistryLaunchStage,
  Visibility,
} from "./types";
import { DeploymentInstanceSpec } from "../deploy/extensions/planner";
import * as utils from "../utils";
import { logger } from "../logger";
import { FirebaseError } from "../error";

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

describe("showDeprecationWarningBefore & showDeprecationWarningAfter", () => {
  let warnStub: sinon.SinonStub;
  let originalIsTTY: boolean;

  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    warnStub = sinon.stub(logger, "warn");
    originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    originalEnv = {
      CI: process.env.CI,
      GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
      BUILD_ID: process.env.BUILD_ID,
      TF_BUILD: process.env.TF_BUILD,
    };
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.BUILD_ID;
    delete process.env.TF_BUILD;
  });

  afterEach(() => {
    warnStub.restore();
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v !== undefined) {
        process.env[k] = v;
      } else {
        delete process.env[k];
      }
    }
  });

  it("should hard-error and exit 1 on ext:dev:register", () => {
    expect(() => warnings.showDeprecationWarningBefore("ext:dev:register", {})).to.throw(
      FirebaseError,
      /ext:dev:register is disabled/,
    );
  });

  it("should show concise warning for Category 1 commands", () => {
    warnings.showDeprecationWarningBefore("ext:install", {});
    expect(warnStub).to.have.been.calledWithMatch(
      /You will not be able to install or edit extensions/,
    );
  });

  it("should show prominent banner for Category 4 commands", () => {
    warnings.showDeprecationWarningBefore("ext:dev:upload", {});
    expect(warnStub).to.have.been.calledWithMatch(
      /Notice for Publishers: Firebase Extensions will shut down/,
    );
  });

  it("should silence warnings when isSilenced returns true", () => {
    warnings.showDeprecationWarningBefore("ext:install", { json: true });
    expect(warnStub).to.not.have.been.called;

    warnings.showDeprecationWarningBefore("ext:install", { nonInteractive: true });
    expect(warnStub).to.not.have.been.called;

    warnings.showDeprecationWarningAfter("ext:list", { quiet: true });
    expect(warnStub).to.not.have.been.called;
  });

  it("should show footer warning in showDeprecationWarningAfter for Category 2 commands", () => {
    warnings.showDeprecationWarningAfter("ext:list", {});
    expect(warnStub).to.have.been.calledWithMatch(/Notice: Firebase Extensions will shut down/);
  });

  it("should hard-error on ext:dev:register even if json flag is true", () => {
    expect(() =>
      warnings.showDeprecationWarningBefore("ext:dev:register", { json: true }),
    ).to.throw(FirebaseError, /ext:dev:register is disabled/);
  });

  it("should silence warnings when CI or GITHUB_ACTIONS environment variables are set", () => {
    const origCI = process.env.CI;
    process.env.CI = "true";
    try {
      expect(warnings.isSilenced({})).to.be.true;
    } finally {
      if (origCI !== undefined) {
        process.env.CI = origCI;
      } else {
        delete process.env.CI;
      }
    }
  });

  it("should not warn on Category 3 commands", () => {
    warnings.showDeprecationWarningBefore("ext:export", {});
    warnings.showDeprecationWarningAfter("ext:export", {});
    warnings.showDeprecationWarningBefore("ext:uninstall", {});
    expect(warnStub).to.not.have.been.called;
  });
});
