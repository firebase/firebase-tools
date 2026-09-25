import { expect } from "chai";
import * as sinon from "sinon";
import * as prompt from "../../prompt";
import * as config from "../../config";
import * as getDefaultHostingSiteMod from "../../getDefaultHostingSite";
import * as hostingInteractive from "../../hosting/interactive";
import * as hostingApi from "../../hosting/api";
import { logger } from "../../logger";
import { askQuestions, actuate } from "./auth";
import { Setup } from "..";

describe("auth feature init", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("askQuestions", () => {
    it("should prompt for auth providers and configure them", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

      sandbox.stub(getDefaultHostingSiteMod, "getDefaultHostingSite").resolves("test-site");
      sandbox.stub(prompt, "checkbox").resolves(["anonymous", "email", "google"]);
      const inputStub = sandbox.stub(prompt, "input");
      inputStub.onFirstCall().resolves("My Brand");
      inputStub.onSecondCall().resolves("brand@example.com");

      await askQuestions(setup, cfg);

      expect(setup.featureInfo?.auth?.providers).to.deep.equal({
        anonymous: true,
        emailPassword: true,
        googleSignIn: {
          oAuthBrandDisplayName: "My Brand",
          supportEmail: "brand@example.com",
        },
      });
      expect(setup.featureInfo?.auth?.newSiteId).to.be.undefined;
    });

    it("should not check for hosting site if projectId is not set", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

      const getSiteStub = sandbox.stub(getDefaultHostingSiteMod, "getDefaultHostingSite");
      sandbox.stub(prompt, "checkbox").resolves(["anonymous"]);
      const confirmStub = sandbox.stub(prompt, "confirm");

      await askQuestions(setup, cfg);

      expect(getSiteStub.called).to.be.false;
      expect(confirmStub.called).to.be.false;
      expect(setup.featureInfo?.auth?.newSiteId).to.be.undefined;
    });

    it("should not prompt to create site if a default hosting site already exists and log presence message", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

      const getSiteStub = sandbox
        .stub(getDefaultHostingSiteMod, "getDefaultHostingSite")
        .resolves("test-site");
      sandbox.stub(prompt, "checkbox").resolves([]);
      const confirmStub = sandbox.stub(prompt, "confirm");
      const loggerSpy = sandbox.spy(logger, "info");

      await askQuestions(setup, cfg);

      expect(getSiteStub.calledOnceWith({ projectId: "test-project" })).to.be.true;
      expect(confirmStub.called).to.be.false;
      expect(setup.featureInfo?.auth?.newSiteId).to.be.undefined;
      expect(loggerSpy.calledWith(sinon.match(/Firebase Hosting site is present: .*test-site/))).to
        .be.true;
    });

    it("should not check or prompt to create site if featureInfo.hosting.newSiteId is already set and log presence message", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        featureInfo: {
          hosting: {
            newSiteId: "existing-new-site",
          },
        },
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

      const getSiteStub = sandbox.stub(getDefaultHostingSiteMod, "getDefaultHostingSite");
      sandbox.stub(prompt, "checkbox").resolves([]);
      const confirmStub = sandbox.stub(prompt, "confirm");
      const loggerSpy = sandbox.spy(logger, "info");

      await askQuestions(setup, cfg);

      expect(getSiteStub.called).to.be.false;
      expect(confirmStub.called).to.be.false;
      expect(setup.featureInfo?.auth?.newSiteId).to.be.undefined;
      expect(
        loggerSpy.calledWith(sinon.match(/Firebase Hosting site is present: .*existing-new-site/)),
      ).to.be.true;
    });

    it("should prompt to create a default site if none exists and user accepts", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

      sandbox
        .stub(getDefaultHostingSiteMod, "getDefaultHostingSite")
        .rejects(getDefaultHostingSiteMod.errNoDefaultSite);
      sandbox.stub(prompt, "checkbox").resolves([]);
      const confirmStub = sandbox.stub(prompt, "confirm").resolves(true);
      const pickSiteStub = sandbox
        .stub(hostingInteractive, "pickHostingSiteName")
        .resolves("new-default-site");

      await askQuestions(setup, cfg, { nonInteractive: false });

      expect(confirmStub.calledOnce).to.be.true;
      expect(confirmStub.firstCall.args[0]).to.deep.include({
        message:
          "A Firebase Hosting site is required for Firebase Authentication. Would you like to create a default site now?",
        default: true,
      });
      expect(pickSiteStub.calledOnceWith("", { projectId: "test-project", nonInteractive: false }))
        .to.be.true;
      expect(setup.featureInfo?.auth?.newSiteId).to.equal("new-default-site");
    });

    it("should not create a site if none exists but user declines", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

      sandbox
        .stub(getDefaultHostingSiteMod, "getDefaultHostingSite")
        .rejects(getDefaultHostingSiteMod.errNoDefaultSite);
      sandbox.stub(prompt, "checkbox").resolves([]);
      sandbox.stub(prompt, "confirm").resolves(false);
      const pickSiteStub = sandbox.stub(hostingInteractive, "pickHostingSiteName");

      await askQuestions(setup, cfg);

      expect(pickSiteStub.called).to.be.false;
      expect(setup.featureInfo?.auth?.newSiteId).to.be.undefined;
    });

    it("should rethrow errors from getDefaultHostingSite other than errNoDefaultSite", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

      const genericError = new Error("Network error");
      sandbox.stub(getDefaultHostingSiteMod, "getDefaultHostingSite").rejects(genericError);
      sandbox.stub(prompt, "checkbox").resolves([]);

      await expect(askQuestions(setup, cfg)).to.be.rejectedWith(genericError);
    });
  });

  describe("actuate", () => {
    it("should do nothing if auth featureInfo is not present", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });
      const setStub = sandbox.stub(cfg, "set");

      await actuate(setup, cfg);

      expect(setStub.called).to.be.false;
    });

    it("should create site if newSiteId is present and write config without newSiteId", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        featureInfo: {
          auth: {
            providers: { anonymous: true },
            newSiteId: "new-site-id",
          },
        },
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });
      const setStub = sandbox.stub(cfg, "set");
      sandbox.stub(cfg, "writeProjectFile").resolves();
      const createSiteStub = sandbox.stub(hostingApi, "createSite").resolves({
        name: "new-site-id",
        defaultUrl: "https://new-site-id.web.app",
        type: hostingApi.SiteType.DEFAULT_SITE,
        appId: "app-id",
        labels: {},
      });

      await actuate(setup, cfg);

      expect(createSiteStub.calledOnceWith("test-project", "new-site-id")).to.be.true;
      expect(setStub.calledOnceWith("auth", { providers: { anonymous: true } })).to.be.true;
    });

    it("should not create site if newSiteId is not present", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        featureInfo: {
          auth: {
            providers: { emailPassword: true },
          },
        },
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });
      const setStub = sandbox.stub(cfg, "set");
      sandbox.stub(cfg, "writeProjectFile").resolves();
      const createSiteStub = sandbox.stub(hostingApi, "createSite");

      await actuate(setup, cfg);

      expect(createSiteStub.called).to.be.false;
      expect(setStub.calledOnceWith("auth", { providers: { emailPassword: true } })).to.be.true;
    });
  });
});
