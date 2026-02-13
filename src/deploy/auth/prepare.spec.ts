import { expect } from "chai";
import * as sinon from "sinon";
import * as prepare from "./prepare";
import * as apps from "../../management/apps";
import { Options } from "../../options";

describe("deploy/auth/prepare", () => {
  let sandbox: sinon.SinonSandbox;
  let listAppsStub: sinon.SinonStub;
  let createAppStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    listAppsStub = sandbox.stub(apps, "listFirebaseApps").resolves([]);
    createAppStub = sandbox.stub(apps, "createWebApp").resolves({
      appId: "1:12345:web:created",
      displayName: "Default Web App",
      platform: apps.AppPlatform.WEB,
      projectId: "test-project",
      name: "projects/test-project/webApps/1:12345:web:created",
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should skip if no auth config", async () => {
    const options = { config: { src: {} }, project: "test-project" } as unknown as Options;
    const context = {};

    await prepare.prepare(context, options);

    expect(listAppsStub).to.not.be.called;
  });

  it("should use existing Default Web App if found", async () => {
    listAppsStub.resolves([
      {
        appId: "1:12345:web:found",
        displayName: "Default Web App",
        platform: apps.AppPlatform.WEB,
      },
    ]);

    const options = {
      config: { src: { auth: { providers: {} } } },
      project: "test-project",
    } as unknown as Options;
    const context: any = {};

    await prepare.prepare(context, options);

    expect(createAppStub).to.not.be.called;
    expect(context.auth.appId).to.equal("1:12345:web:found");
  });

  it("should use first web app if Default Web App not found", async () => {
    listAppsStub.resolves([
      { appId: "1:12345:web:other", displayName: "Other App", platform: apps.AppPlatform.WEB },
    ]);

    const options = {
      config: { src: { auth: { providers: {} } } },
      project: "test-project",
    } as unknown as Options;
    const context: any = {};

    await prepare.prepare(context, options);

    expect(createAppStub).to.not.be.called;
    expect(context.auth.appId).to.equal("1:12345:web:other");
  });

  it("should create Default Web App if no web apps exist", async () => {
    listAppsStub.resolves([]);

    const options = {
      config: { src: { auth: { providers: {} } } },
      project: "test-project",
    } as unknown as Options;
    const context: any = {};

    await prepare.prepare(context, options);

    expect(createAppStub).to.be.calledWith("test-project", { displayName: "Default Web App" });
    expect(context.auth.appId).to.equal("1:12345:web:created");
  });
});
