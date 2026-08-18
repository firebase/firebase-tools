import { expect } from "chai";
import * as sinon from "sinon";
import { deploy } from "./deploy";
import * as deployModule from "../../../deploy";
import { jobTracker } from "../../util/jobs";
import { FirebaseMcpServer } from "../../../mcp";
import { McpContext } from "../../types";
import { RC } from "../../../rc";
import { Config } from "../../../config";

describe("deploy tool", () => {
  let sandbox: sinon.SinonSandbox;
  let coreDeployStub: sinon.SinonStub;
  let server: FirebaseMcpServer;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    coreDeployStub = sandbox.stub(deployModule, "deploy").resolves();
    server = new FirebaseMcpServer({ projectRoot: "/test-dir" });
    server.cachedProjectDir = "/test-dir";
  });

  afterEach(() => {
    sandbox.restore();
  });

  const mockContext = (baseOptions: Record<string, unknown> = {}): McpContext => {
    const rc = new RC(undefined, { projects: { default: "test-project" } });
    const config = new Config({}, { cwd: "/test-dir" });
    sandbox.stub(server, "resolveOptions").resolves(baseOptions);

    return {
      projectId: "test-project",
      host: server,
      accountEmail: "test@example.com",
      rc,
      config,
      firebaseCliCommand: "firebase",
      isBillingEnabled: true,
    };
  };

  it("should resolve base options and pass them to coreDeploy", async () => {
    const fakeUser = { email: "test@example.com" };
    const fakeTokens = { refresh_token: "fake_refresh_token" };
    const ctx = mockContext({
      user: fakeUser,
      tokens: fakeTokens,
      projectRoot: "/test-dir",
      cwd: "/test-dir",
    });

    const result = await deploy.fn({ only: "dataconnect" }, ctx);

    expect(result.structuredContent).to.have.property("jobId");
    expect((result.structuredContent as { message: string }).message).to.equal(
      "Deployment started",
    );

    // Wait for the background task to execute
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(coreDeployStub.calledOnce).to.be.true;
    const [targets, options] = coreDeployStub.firstCall.args as [string[], Record<string, unknown>];
    expect(targets).to.deep.equal(["dataconnect"]);
    expect(options).to.include({
      project: "test-project",
      projectId: "test-project",
      only: "dataconnect",
      nonInteractive: true,
      projectRoot: "/test-dir",
      cwd: "/test-dir",
    });
    expect(options["user"]).to.deep.equal(fakeUser);
    expect(options["tokens"]).to.deep.equal(fakeTokens);
  });

  it("should filter valid targets when only is provided", async () => {
    const ctx = mockContext();

    await deploy.fn({ only: "hosting,invalid_target,firestore" }, ctx);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(coreDeployStub.calledOnce).to.be.true;
    const [targets] = coreDeployStub.firstCall.args as [string[]];
    expect(targets).to.deep.equal(["hosting", "firestore"]);
  });

  it("should track job failure when coreDeploy fails", async () => {
    coreDeployStub.rejects(new Error("Deploy error"));
    const updateJobSpy = sandbox.spy(jobTracker, "updateJob");
    const ctx = mockContext();

    const result = await deploy.fn({ only: "hosting" }, ctx);
    const jobId = (result.structuredContent as { jobId: string }).jobId;

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(updateJobSpy.calledWith(jobId, { status: "failed", error: "Deploy error" })).to.be.true;
  });

  it("should not create a job if resolveOptions fails", async () => {
    const createJobSpy = sandbox.spy(jobTracker, "createJob");
    const rc = new RC(undefined, { projects: { default: "test-project" } });
    const config = new Config({}, { cwd: "/test-dir" });
    sandbox.stub(server, "resolveOptions").rejects(new Error("Config resolution error"));

    const ctx: McpContext = {
      projectId: "test-project",
      host: server,
      accountEmail: "test@example.com",
      rc,
      config,
      firebaseCliCommand: "firebase",
      isBillingEnabled: true,
    };

    let err: Error | undefined;
    try {
      await deploy.fn({ only: "hosting" }, ctx);
    } catch (e: unknown) {
      err = e instanceof Error ? e : new Error(String(e));
    }

    expect(err).to.exist;
    expect(err?.message).to.equal("Config resolution error");
    expect(createJobSpy.called).to.be.false;
  });
});
