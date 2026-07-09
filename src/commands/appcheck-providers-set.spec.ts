import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./appcheck-providers-set";
import * as appcheck from "../gcp/appcheck";
import * as apps from "../management/apps";
import { AppPlatform, AppMetadata } from "../management/apps";
import * as projectUtils from "../projectUtils";
import * as utils from "../utils";
import { FirebaseError } from "../error";

const PROJECT_ID = "test-project";
const WEB_APP = "1:1234:web:abcd";
const IOS_APP = "1:1234:ios:efgh";

function app(appId: string, platform: AppPlatform): AppMetadata {
  return { name: `projects/${PROJECT_ID}/apps/${appId}`, projectId: PROJECT_ID, appId, platform };
}

describe("appcheck:providers:set", () => {
  let setStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = []; // bypass pre-action hooks
    sinon.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    sinon.stub(appcheck, "ensureAppCheckApiEnabled").resolves();
    sinon.stub(utils, "logSuccess");
    sinon
      .stub(apps, "listFirebaseApps")
      .resolves([app(WEB_APP, AppPlatform.WEB), app(IOS_APP, AppPlatform.IOS)]);
    setStub = sinon.stub(appcheck, "setProviderConfig").resolves({ siteKey: "key" });
  });

  afterEach(() => {
    sinon.restore();
  });

  it("throws when the app is not found", async () => {
    await expect(
      command.runner()("1:1234:web:missing", "recaptcha-enterprise", {
        project: PROJECT_ID,
        siteKey: "key",
      }),
    ).to.be.rejectedWith(FirebaseError, /was not found/);
  });

  it("throws on a provider/platform mismatch", async () => {
    await expect(
      command.runner()(WEB_APP, "play-integrity", { project: PROJECT_ID }),
    ).to.be.rejectedWith(FirebaseError, /attests ANDROID apps/);
  });

  it("throws on an unknown provider", async () => {
    await expect(command.runner()(WEB_APP, "nope", { project: PROJECT_ID })).to.be.rejectedWith(
      FirebaseError,
      /Unknown provider/,
    );
  });

  it("requires --site-key for recaptcha-enterprise", async () => {
    await expect(
      command.runner()(WEB_APP, "recaptcha-enterprise", { project: PROJECT_ID }),
    ).to.be.rejectedWith(FirebaseError, /requires --site-key/);
  });

  it("configures recaptcha-enterprise with a site key", async () => {
    await command.runner()(WEB_APP, "recaptcha-enterprise", {
      project: PROJECT_ID,
      siteKey: "site-key-value",
    });
    expect(setStub).to.have.been.calledWith(PROJECT_ID, WEB_APP, "recaptcha-enterprise", {
      siteKey: "site-key-value",
    });
  });

  it("requires both --key-id and --private-key for device-check", async () => {
    await expect(
      command.runner()(IOS_APP, "device-check", { project: PROJECT_ID, keyId: "k" }),
    ).to.be.rejectedWith(FirebaseError, /requires --key-id and --private-key/);
  });

  it("parses --token-ttl into an API Duration", async () => {
    await command.runner()(IOS_APP, "app-attest", { project: PROJECT_ID, tokenTtl: "1h" });
    expect(setStub).to.have.been.calledWith(PROJECT_ID, IOS_APP, "app-attest", {
      tokenTtl: "3600s",
    });
  });

  it("throws when there is nothing to configure", async () => {
    await expect(
      command.runner()(IOS_APP, "app-attest", { project: PROJECT_ID }),
    ).to.be.rejectedWith(FirebaseError, /Nothing to configure/);
  });
});
