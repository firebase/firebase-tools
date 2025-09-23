import * as chai from "chai";
import * as sinon from "sinon";
import * as studio from "./studio";
import * as prompt from "../prompt";
import { configstore } from "../configstore";
import { Client } from "../apiv2";
import * as utils from "../utils";
import { Options } from "../options";
import { Config } from "../config";
import { RC } from "../rc";
import { logger } from "../logger";

const expect = chai.expect;

describe("Studio Management", () => {
  let sandbox: sinon.SinonSandbox;
  let promptStub: sinon.SinonStub;
  let clientRequestStub: sinon.SinonStub;
  let utilsStub: sinon.SinonStub;

  let testOptions: Options;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    promptStub = sandbox.stub(prompt, "select");
    sandbox.stub(configstore, "get");
    sandbox.stub(configstore, "set");
    clientRequestStub = sandbox.stub(Client.prototype, "request");
    utilsStub = sandbox.stub(utils, "makeActiveProject");
    const emptyConfig = new Config("{}", {});
    testOptions = {
      cwd: "",
      configPath: "",
      only: "",
      except: "",
      filteredTargets: [],
      force: false,
      json: false,
      nonInteractive: false,
      interactive: false,
      debug: false,
      config: emptyConfig,
      rc: new RC(),
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("reconcileStudioFirebaseProject", () => {
    it("should return active project from config if WORKSPACE_SLUG is not set", async () => {
      process.env.WORKSPACE_SLUG = "";
      const result = await studio.reconcileStudioFirebaseProject(testOptions, "cli-project");
      expect(result).to.equal("cli-project");
      expect(clientRequestStub).to.not.have.been.called;
    });

    it("should return active project from config if getStudioWorkspace fails", async () => {
      process.env.WORKSPACE_SLUG = "test-workspace";
      clientRequestStub.rejects(new Error("API Error"));
      const result = await studio.reconcileStudioFirebaseProject(testOptions, "cli-project");
      expect(result).to.equal("cli-project");
    });

    it("should update studio with CLI project if studio has no project", async () => {
      process.env.WORKSPACE_SLUG = "test-workspace";
      clientRequestStub
        .onFirstCall()
        .resolves({ body: { name: "test-workspace", firebaseProjectId: undefined } });
      clientRequestStub.onSecondCall().resolves({ body: {} });

      const result = await studio.reconcileStudioFirebaseProject(testOptions, "cli-project");

      expect(result).to.equal("cli-project");
      expect(clientRequestStub).to.have.been.calledTwice;
      expect(clientRequestStub.secondCall.args[0].body.firebaseProjectId).to.equal("cli-project");
    });

    it("should update CLI with studio project if CLI has no project", async () => {
      process.env.WORKSPACE_SLUG = "test-workspace";
      clientRequestStub.resolves({
        body: { name: "test-workspace", firebaseProjectId: "studio-project" },
      });

      const result = await studio.reconcileStudioFirebaseProject(
        { ...testOptions, projectRoot: "/test" },
        undefined,
      );

      expect(result).to.equal("studio-project");
      expect(utilsStub).to.have.been.calledOnceWith("/test", "studio-project");
    });

    it("should prompt user and update studio if user chooses CLI project", async () => {
      process.env.WORKSPACE_SLUG = "test-workspace";
      clientRequestStub
        .onFirstCall()
        .resolves({ body: { name: "test-workspace", firebaseProjectId: "studio-project" } });
      clientRequestStub.onSecondCall().resolves({ body: {} });
      promptStub.resolves(true);

      const result = await studio.reconcileStudioFirebaseProject(testOptions, "cli-project");

      expect(result).to.equal("cli-project");
      expect(promptStub).to.have.been.calledOnce;
      expect(clientRequestStub).to.have.been.calledTwice;
      expect(clientRequestStub.secondCall.args[0].body.firebaseProjectId).to.equal("cli-project");
    });

    it("should prompt user and update CLI if user chooses studio project", async () => {
      process.env.WORKSPACE_SLUG = "test-workspace";
      clientRequestStub.resolves({
        body: { name: "test-workspace", firebaseProjectId: "studio-project" },
      });
      promptStub.resolves(false);

      const result = await studio.reconcileStudioFirebaseProject(
        { ...testOptions, projectRoot: "/test" },
        "cli-project",
      );

      expect(result).to.equal("studio-project");
      expect(promptStub).to.have.been.calledOnce;
      expect(utilsStub).to.have.been.calledOnceWith("/test", "studio-project");
    });

    it("should do nothing if projects are the same", async () => {
      process.env.WORKSPACE_SLUG = "test-workspace";
      clientRequestStub.resolves({
        body: { name: "test-workspace", firebaseProjectId: "same-project" },
      });

      const result = await studio.reconcileStudioFirebaseProject(testOptions, "same-project");

      expect(result).to.equal("same-project");
      expect(promptStub).to.not.have.been.called;
      expect(utilsStub).to.not.have.been.called;
    });

    it("should do nothing if in non-interactive mode", async () => {
      process.env.WORKSPACE_SLUG = "test-workspace";
      clientRequestStub.resolves({
        body: { name: "test-workspace", firebaseProjectId: "studio-project" },
      });

      const result = await studio.reconcileStudioFirebaseProject(
        { ...testOptions, nonInteractive: true },
        "cli-project",
      );

      expect(result).to.equal("studio-project");
      expect(promptStub).to.not.have.been.called;
      expect(utilsStub).to.not.have.been.called;
    });
  });

  describe("updateStudioFirebaseProject", () => {
    it("should not call api if WORKSPACE_SLUG is not set", async () => {
      process.env.WORKSPACE_SLUG = "";
      await studio.updateStudioFirebaseProject("new-project");
      expect(clientRequestStub).to.not.have.been.called;
    });

    it("should call api to update project id", async () => {
      process.env.WORKSPACE_SLUG = "test-workspace";
      clientRequestStub.resolves({ body: {} });

      await studio.updateStudioFirebaseProject("new-project");

      expect(clientRequestStub).to.have.been.calledOnceWith({
        method: "PATCH",
        path: `/workspaces/test-workspace`,
        responseType: "json",
        body: {
          firebaseProjectId: "new-project",
        },
        queryParams: {
          updateMask: "workspace.firebaseProjectId",
        },
        timeout: 30000,
      });
    });

    it("should log error if api call fails", async () => {
      process.env.WORKSPACE_SLUG = "test-workspace";
      clientRequestStub.rejects(new Error("API Error"));
      const errorLogSpy = sandbox.spy(logger, "debug");

      await studio.updateStudioFirebaseProject("new-project");

      expect(errorLogSpy).to.have.been.calledOnce;
    });
  });
});
