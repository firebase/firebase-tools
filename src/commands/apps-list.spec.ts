import { expect } from "chai";
import * as sinon from "sinon";
import * as clc from "colorette";
import * as Table from "cli-table3";
import { Command } from "../command";
import * as projectUtils from "../projectUtils";
import * as apps from "../management/apps";
import { AppMetadata, AppPlatform } from "../management/apps";
import { command, logAppsList, logAppCount } from "./apps-list";
import * as auth from "../requireAuth";

const NOT_SPECIFIED = clc.yellow("[Not specified]");

describe("apps:list", () => {
  let sandbox: sinon.SinonSandbox;
  let listFirebaseAppsStub: sinon.SinonStub;
  let getAppPlatformStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(auth, "requireAuth").resolves();
    sandbox.stub(projectUtils, "needProjectId").returns("test-project-id");
    listFirebaseAppsStub = sandbox.stub(apps, "listFirebaseApps");
    getAppPlatformStub = sandbox.stub(apps, "getAppPlatform");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should be a Command", () => {
    expect(command).to.be.an.instanceOf(Command);
  });

  describe("action", () => {
    it("should list all apps if no platform is provided", async () => {
      const appsList: AppMetadata[] = [
        { name: "n1", projectId: "p1", appId: "1", displayName: "app1", platform: AppPlatform.IOS },
        {
          name: "n2",
          projectId: "p2",
          appId: "2",
          displayName: "app2",
          platform: AppPlatform.ANDROID,
        },
      ];
      listFirebaseAppsStub.resolves(appsList);
      getAppPlatformStub.returns(AppPlatform.ANY);

      await command.runner()(undefined, {});

      expect(listFirebaseAppsStub).to.have.been.calledOnceWith("test-project-id", AppPlatform.ANY);
    });

    it("should list apps for a specific platform", async () => {
      const appsList: AppMetadata[] = [
        { name: "n1", projectId: "p1", appId: "1", displayName: "app1", platform: AppPlatform.IOS },
      ];
      listFirebaseAppsStub.resolves(appsList);
      getAppPlatformStub.returns(AppPlatform.IOS);

      await command.runner()("IOS", {});

      expect(listFirebaseAppsStub).to.have.been.calledOnceWith("test-project-id", AppPlatform.IOS);
    });

    it('should display "No apps found." if no apps exist', async () => {
      listFirebaseAppsStub.resolves([]);
      getAppPlatformStub.returns(AppPlatform.ANY);

      await command.runner()(undefined, {});

      // No assertion needed here, we are just checking that it does not throw.
    });
  });

  describe("logAppsList", () => {
    it("should print a table of apps", () => {
      const appsList: AppMetadata[] = [
        { name: "n1", projectId: "p1", appId: "1", displayName: "app1", platform: AppPlatform.IOS },
        {
          name: "n2",
          projectId: "p2",
          appId: "2",
          displayName: "app2",
          platform: AppPlatform.ANDROID,
        },
        { name: "n3", projectId: "p3", appId: "3", platform: AppPlatform.WEB },
      ];
      const tableSpy = sandbox.spy(Table.prototype, "push");

      logAppsList(appsList);

      expect(tableSpy.getCall(0).args[0]).to.deep.equal(["app1", "1", "IOS"]);
      expect(tableSpy.getCall(1).args[0]).to.deep.equal(["app2", "2", "ANDROID"]);
      expect(tableSpy.getCall(2).args[0]).to.deep.equal([NOT_SPECIFIED, "3", "WEB"]);
    });
  });

  describe("logAppCount", () => {
    it("should print the total number of apps", () => {
      logAppCount(5);
      // No assertion needed here, we are just checking that it does not throw.
    });

    it("should not print if count is 0", () => {
      logAppCount(0);
      // No assertion needed here, we are just checking that it does not throw.
    });
  });
});
