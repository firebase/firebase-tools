import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs-extra";
import { Command } from "../command";
import * as apps from "../management/apps";
import { AppPlatform } from "../management/apps";
import * as projectUtils from "../projectUtils";
import * as projects from "../management/projects";
import { FirebaseError } from "../error";
import * as prompt from "../prompt";
import { command } from "./apps-sdkconfig";
import * as auth from "../requireAuth";

import { logger } from "../logger";

describe("apps:sdkconfig", () => {
  let sandbox: sinon.SinonSandbox;
  let needProjectIdStub: sinon.SinonStub;
  let getAppConfigStub: sinon.SinonStub;
  let getAppConfigFileStub: sinon.SinonStub;
  let listFirebaseAppsStub: sinon.SinonStub;
  let getOrPromptProjectStub: sinon.SinonStub;
  let selectStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;
  let writeFileSyncStub: sinon.SinonStub;
  let existsSyncStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(auth, "requireAuth").resolves();
    needProjectIdStub = sandbox.stub(projectUtils, "needProjectId").returns("test-project-id");
    getAppConfigStub = sandbox.stub(apps, "getAppConfig");
    getAppConfigFileStub = sandbox.stub(apps, "getAppConfigFile");
    listFirebaseAppsStub = sandbox.stub(apps, "listFirebaseApps");
    getOrPromptProjectStub = sandbox.stub(projects, "getOrPromptProject");
    selectStub = sandbox.stub(prompt, "select");
    confirmStub = sandbox.stub(prompt, "confirm");
    writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
    existsSyncStub = sandbox.stub(fs, "existsSync");
    loggerInfoStub = sandbox.stub(logger, "info");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should be a Command", () => {
    expect(command).to.be.an.instanceOf(Command);
  });

  describe("action", () => {
    it("should get config for a specified app", async () => {
      getAppConfigStub.resolves({} as any);
      getAppConfigFileStub.returns({ fileContents: "test-config" } as any);

      await command.runner()("IOS", "test-app-id", {});

      expect(getAppConfigStub).to.have.been.calledOnceWith("test-app-id", AppPlatform.IOS);
      expect(loggerInfoStub).to.have.been.calledWith("test-config");
    });

    it("should get config for the only app when no app id is provided", async () => {
      listFirebaseAppsStub.resolves([
        { name: "n1", projectId: "p1", appId: "test-app-id", platform: AppPlatform.ANDROID },
      ]);
      getAppConfigStub.resolves({ fileContents: "test-config" });
      getAppConfigFileStub.returns({ fileContents: "test-config" });

      await command.runner()("ANDROID", "", {});

      expect(listFirebaseAppsStub).to.have.been.calledOnceWith(
        "test-project-id",
        AppPlatform.ANDROID,
      );
      expect(getAppConfigStub).to.have.been.calledOnceWith("test-app-id", AppPlatform.ANDROID);
    });

    it("should prompt for app if multiple apps exist", async () => {
      const app1 = {
        name: "n1",
        projectId: "p1",
        appId: "app1",
        platform: AppPlatform.IOS,
        displayName: "app1",
      };
      const app2 = {
        name: "n2",
        projectId: "p2",
        appId: "app2",
        platform: AppPlatform.IOS,
        displayName: "app2",
      };
      listFirebaseAppsStub.resolves([app1, app2]);
      selectStub.resolves(app1);
      getAppConfigStub.resolves({ fileContents: "test-config" });
      getAppConfigFileStub.returns({ fileContents: "test-config" } as any);

      await command.runner()("IOS", "", { nonInteractive: false });

      expect(selectStub).to.have.been.calledOnce;
      expect(getAppConfigStub).to.have.been.calledOnceWith("app1", AppPlatform.IOS);
    });

    it("should throw if multiple apps exist in non-interactive mode", async () => {
      const app1 = { name: "n1", projectId: "p1", appId: "app1", platform: AppPlatform.IOS };
      const app2 = { name: "n2", projectId: "p2", appId: "app2", platform: AppPlatform.IOS };
      listFirebaseAppsStub.resolves([app1, app2]);

      await expect(command.runner()("IOS", "", { nonInteractive: true })).to.be.rejectedWith(
        FirebaseError,
        "Project test-project-id has multiple apps, must specify an app id.",
      );
    });

    it("should throw if no apps exist", async () => {
      listFirebaseAppsStub.resolves([]);

      await expect(command.runner()("IOS", "", {})).to.be.rejectedWith(
        FirebaseError,
        "There are no IOS apps associated with this Firebase project",
      );
    });

    it("should write config to a file", async () => {
      getAppConfigStub.resolves({});
      getAppConfigFileStub.returns({ fileName: "test.json", fileContents: "test-config" });
      existsSyncStub.returns(false);

      await command.runner()("WEB", "test-app-id", { out: "out.json" });

      expect(writeFileSyncStub).to.have.been.calledOnceWith("out.json", "test-config");
      expect(loggerInfoStub).to.have.been.calledWith("App configuration is written in out.json");
    });

    it("should overwrite existing file if confirmed", async () => {
      getAppConfigStub.resolves({});
      getAppConfigFileStub.returns({ fileName: "test.json", fileContents: "test-config" });
      existsSyncStub.returns(true);
      confirmStub.resolves(true);

      await command.runner()("WEB", "test-app-id", { out: "out.json" });

      expect(confirmStub).to.have.been.calledOnce;
      expect(writeFileSyncStub).to.have.been.calledOnceWith("out.json", "test-config");
    });

    it("should not overwrite existing file if not confirmed", async () => {
      getAppConfigStub.resolves({});
      getAppConfigFileStub.returns({ fileName: "test.json", fileContents: "test-config" });
      existsSyncStub.returns(true);
      confirmStub.resolves(false);

      await command.runner()("WEB", "test-app-id", { out: "out.json" });

      expect(confirmStub).to.have.been.calledOnce;
      expect(writeFileSyncStub).to.not.have.been.called;
    });

    it("should throw if file exists in non-interactive mode", async () => {
      getAppConfigStub.resolves({});
      getAppConfigFileStub.returns({ fileName: "test.json", fileContents: "test-config" });
      existsSyncStub.returns(true);

      await expect(
        command.runner()("WEB", "test-app-id", { out: "out.json", nonInteractive: true }),
      ).to.be.rejectedWith(FirebaseError, "out.json already exists");
    });

    it("should prompt for project if not available", async () => {
      needProjectIdStub.returns(undefined);
      getOrPromptProjectStub.resolves({ projectId: "test-project-id" });
      listFirebaseAppsStub.resolves([
        { name: "n1", projectId: "p1", appId: "test-app-id", platform: AppPlatform.ANDROID },
      ]);
      getAppConfigStub.resolves({ fileContents: "test-config" });
      getAppConfigFileStub.returns({ fileContents: "test-config" });

      await command.runner()("ANDROID", "", {});

      expect(getOrPromptProjectStub).to.have.been.calledOnce;
    });
  });
});
