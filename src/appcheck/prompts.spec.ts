import { expect } from "chai";
import * as sinon from "sinon";

import { getOrPromptAppId, getOrPromptProjectAndAppId } from "./prompts";
import { AppCheckDebugOptions } from "./types";
import * as apps from "../management/apps";
import * as appUtils from "../appUtils";
import * as projectUtils from "../projectUtils";
import { FirebaseError } from "../error";

describe("appcheck prompts", () => {
  const projectId = "my-project";
  const webApp = { appId: "1:1:web:aaa", platform: apps.AppPlatform.WEB } as apps.AppMetadata;
  const otherApp = { appId: "1:1:web:bbb", platform: apps.AppPlatform.WEB } as apps.AppMetadata;

  let sandbox: sinon.SinonSandbox;
  let listFirebaseAppsStub: sinon.SinonStub;
  let selectAppInteractivelyStub: sinon.SinonStub;
  let detectAppsStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(projectUtils, "needProjectId").returns(projectId);
    listFirebaseAppsStub = sandbox.stub(apps, "listFirebaseApps");
    selectAppInteractivelyStub = sandbox.stub(apps, "selectAppInteractively");
    detectAppsStub = sandbox.stub(appUtils, "detectApps").resolves([]);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("uses the app id from options without listing apps", async () => {
    const result = await getOrPromptAppId({ app: webApp.appId } as AppCheckDebugOptions);

    expect(result).to.deep.equal({ projectId, appId: webApp.appId });
    expect(listFirebaseAppsStub.called).to.be.false;
  });

  it("throws when the project has no apps", async () => {
    listFirebaseAppsStub.resolves([]);

    await expect(getOrPromptAppId({} as AppCheckDebugOptions)).to.be.rejectedWith(
      FirebaseError,
      /no apps associated with project/,
    );
  });

  it("selects the only app without prompting", async () => {
    listFirebaseAppsStub.resolves([webApp]);

    const result = await getOrPromptAppId({} as AppCheckDebugOptions);

    expect(result).to.deep.equal({ projectId, appId: webApp.appId });
    expect(selectAppInteractivelyStub.called).to.be.false;
  });

  it("throws for multiple apps in non-interactive mode", async () => {
    listFirebaseAppsStub.resolves([webApp, otherApp]);

    await expect(
      getOrPromptAppId({ nonInteractive: true } as AppCheckDebugOptions),
    ).to.be.rejectedWith(FirebaseError, /must specify an app id/);
  });

  it("narrows the choices to locally detected apps", async () => {
    listFirebaseAppsStub.resolves([webApp, otherApp]);
    detectAppsStub.resolves([{ appId: otherApp.appId }]);

    const result = await getOrPromptAppId({} as AppCheckDebugOptions);

    expect(result.appId).to.equal(otherApp.appId);
    expect(selectAppInteractivelyStub.called).to.be.false;
  });

  it("prompts with the register wording by default", async () => {
    listFirebaseAppsStub.resolves([webApp, otherApp]);
    selectAppInteractivelyStub.resolves(webApp);

    await getOrPromptAppId({} as AppCheckDebugOptions);

    expect(selectAppInteractivelyStub.firstCall.args[2]).to.deep.equal({
      message: "Select the app to register a debug token for:",
    });
  });

  it("prompts with the caller supplied wording", async () => {
    listFirebaseAppsStub.resolves([webApp, otherApp]);
    selectAppInteractivelyStub.resolves(webApp);

    await getOrPromptProjectAndAppId(
      {} as AppCheckDebugOptions,
      "Select the app to delete a debug token from:",
    );

    expect(selectAppInteractivelyStub.firstCall.args[2]).to.deep.equal({
      message: "Select the app to delete a debug token from:",
    });
  });
});
