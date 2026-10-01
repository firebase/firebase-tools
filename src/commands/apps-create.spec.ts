import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./apps-create";
import * as projectUtils from "../projectUtils";
import * as apps from "../management/apps";
import * as getDefaultHostingSiteMod from "../getDefaultHostingSite";
import * as hostingInteractive from "../hosting/interactive";
import * as hostingApi from "../hosting/api";
import * as prompt from "../prompt";
import { logger } from "../logger";

describe("apps:create", () => {
  const PROJECT_ID = "test-project";
  const webAppMetadata: apps.WebAppMetadata = {
    name: "projects/test-project/webApps/1:12345:web:abcdef",
    appId: "1:12345:web:abcdef",
    displayName: "My Web App",
    platform: apps.AppPlatform.WEB,
    projectId: PROJECT_ID,
  };
  const iosAppMetadata: apps.IosAppMetadata = {
    name: "projects/test-project/iosApps/1:12345:ios:abcdef",
    appId: "1:12345:ios:abcdef",
    displayName: "My iOS App",
    platform: apps.AppPlatform.IOS,
    projectId: PROJECT_ID,
    bundleId: "com.example.app",
  };

  let sandbox: sinon.SinonSandbox;
  let sdkInitStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    sdkInitStub = sandbox.stub(apps, "sdkInit");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("when platform is WEB", () => {
    it("should log presence message and not prompt when a default hosting site exists", async () => {
      const getSiteStub = sandbox
        .stub(getDefaultHostingSiteMod, "getDefaultHostingSite")
        .resolves("existing-site");
      const confirmStub = sandbox.stub(prompt, "confirm");
      const loggerSpy = sandbox.spy(logger, "info");
      const createSiteStub = sandbox.stub(hostingApi, "createSite");
      sdkInitStub.resolves(webAppMetadata);

      const result = (await command.runner()("web", "My Web App", {
        interactive: true,
      })) as apps.AppMetadata;

      expect(result).to.deep.equal(webAppMetadata);
      expect(getSiteStub.calledOnceWith({ projectId: PROJECT_ID })).to.be.true;
      expect(confirmStub.called).to.be.false;
      expect(createSiteStub.called).to.be.false;
      expect(loggerSpy.calledWith(sinon.match(/Firebase Hosting site is present: .*existing-site/)))
        .to.be.true;
    });

    it("should offer to create default hosting site when none exists and user accepts", async () => {
      sandbox
        .stub(getDefaultHostingSiteMod, "getDefaultHostingSite")
        .rejects(getDefaultHostingSiteMod.errNoDefaultSite);
      const confirmStub = sandbox.stub(prompt, "confirm").resolves(true);
      const pickSiteStub = sandbox
        .stub(hostingInteractive, "pickHostingSiteName")
        .resolves("new-site-id");
      const createSiteStub = sandbox.stub(hostingApi, "createSite").resolves({
        name: "new-site-id",
        defaultUrl: "https://new-site-id.web.app",
        type: hostingApi.SiteType.DEFAULT_SITE,
        appId: webAppMetadata.appId,
        labels: {},
      });
      sdkInitStub.resolves(webAppMetadata);

      const result = (await command.runner()("web", "My Web App", {
        interactive: true,
      })) as apps.AppMetadata;

      expect(result).to.deep.equal(webAppMetadata);
      expect(confirmStub.calledOnce).to.be.true;
      expect(confirmStub.firstCall.args[0]).to.deep.include({
        message:
          "A Firebase Hosting site is required for Web apps. Would you like to create a default site now?",
        default: true,
        nonInteractive: false,
      });
      expect(
        pickSiteStub.calledOnceWith("", {
          projectId: PROJECT_ID,
          nonInteractive: false,
        }),
      ).to.be.true;
      expect(createSiteStub.calledOnceWith(PROJECT_ID, "new-site-id", webAppMetadata.appId)).to.be
        .true;
    });

    it("should not create a hosting site if user declines", async () => {
      sandbox
        .stub(getDefaultHostingSiteMod, "getDefaultHostingSite")
        .rejects(getDefaultHostingSiteMod.errNoDefaultSite);
      const confirmStub = sandbox.stub(prompt, "confirm").resolves(false);
      const pickSiteStub = sandbox.stub(hostingInteractive, "pickHostingSiteName");
      const createSiteStub = sandbox.stub(hostingApi, "createSite");
      sdkInitStub.resolves(webAppMetadata);

      const result = (await command.runner()("web", "My Web App", {
        interactive: true,
      })) as apps.AppMetadata;

      expect(result).to.deep.equal(webAppMetadata);
      expect(confirmStub.calledOnce).to.be.true;
      expect(pickSiteStub.called).to.be.false;
      expect(createSiteStub.called).to.be.false;
    });

    it("should rethrow unexpected errors from getDefaultHostingSite", async () => {
      const networkError = new Error("Network failure");
      sandbox.stub(getDefaultHostingSiteMod, "getDefaultHostingSite").rejects(networkError);

      await expect(command.runner()("web", "My Web App", { interactive: true })).to.be.rejectedWith(
        networkError,
      );
      expect(sdkInitStub.called).to.be.false;
    });

    it("should check for hosting site when platform is selected interactively as Web", async () => {
      sandbox.stub(prompt, "select").resolves(apps.AppPlatform.WEB);
      const getSiteStub = sandbox
        .stub(getDefaultHostingSiteMod, "getDefaultHostingSite")
        .resolves("existing-site");
      const confirmStub = sandbox.stub(prompt, "confirm");
      sdkInitStub.resolves(webAppMetadata);

      const result = (await command.runner()("", "My Web App", {
        interactive: true,
      })) as apps.AppMetadata;

      expect(result).to.deep.equal(webAppMetadata);
      expect(getSiteStub.calledOnceWith({ projectId: PROJECT_ID })).to.be.true;
      expect(confirmStub.called).to.be.false;
    });
  });

  describe("when platform is not WEB", () => {
    it("should not check for or create a hosting site for iOS apps", async () => {
      const getSiteStub = sandbox.stub(getDefaultHostingSiteMod, "getDefaultHostingSite");
      const confirmStub = sandbox.stub(prompt, "confirm");
      const createSiteStub = sandbox.stub(hostingApi, "createSite");
      sdkInitStub.resolves(iosAppMetadata);

      const result = (await command.runner()("ios", "My iOS App", {
        nonInteractive: false,
        bundleId: "com.example.app",
      })) as apps.AppMetadata;

      expect(result).to.deep.equal(iosAppMetadata);
      expect(getSiteStub.called).to.be.false;
      expect(confirmStub.called).to.be.false;
      expect(createSiteStub.called).to.be.false;
    });
  });
});
