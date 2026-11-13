import { expect } from "chai";
import * as sinon from "sinon";

import * as auth from "../../../auth";
import * as hostingApi from "../../../hosting/api";
import { Setup } from "../..";
import { initGitHub } from "./github";

describe("hosting github init", () => {
  let sandbox: sinon.SinonSandbox;
  let ensureApiEnabledStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    ensureApiEnabledStub = sandbox.stub(hostingApi, "ensureApiEnabled").resolves();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should reject without ensuring Hosting API when projectId is missing", async () => {
    const setup: Setup = {
      config: { hosting: { public: "public" } },
      rcfile: { projects: {}, targets: {}, etags: {} },
      instructions: [],
    };

    await expect(initGitHub(setup)).to.be.rejectedWith(
      /Could not determine Project ID, can't set up GitHub workflow/,
    );
    expect(ensureApiEnabledStub.called).to.be.false;
  });

  it("should reject without ensuring Hosting API when Hosting config is missing", async () => {
    const setup: Setup = {
      config: {},
      rcfile: { projects: {}, targets: {}, etags: {} },
      projectId: "test-project",
      instructions: [],
    };

    await expect(initGitHub(setup)).to.be.rejectedWith(
      /Didn't find a Hosting config in firebase\.json/,
    );
    expect(ensureApiEnabledStub.called).to.be.false;
  });

  it("should ensure Hosting API is enabled before authenticating when firebase.json has hosting", async () => {
    const setup: Setup = {
      config: { hosting: { public: "public" } },
      rcfile: { projects: {}, targets: {}, etags: {} },
      projectId: "test-project",
      instructions: [],
    };
    const stopError = new Error("stop-after-api-check");
    const loginGithubStub = sandbox.stub(auth, "loginGithub").rejects(stopError);

    await expect(initGitHub(setup)).to.be.rejectedWith(stopError);
    expect(ensureApiEnabledStub).to.have.been.calledOnceWith("test-project");
    expect(ensureApiEnabledStub.calledBefore(loginGithubStub)).to.be.true;
  });

  it("should ensure Hosting API is enabled when hosting config comes from featureInfo", async () => {
    const setup: Setup = {
      config: {},
      rcfile: { projects: {}, targets: {}, etags: {} },
      projectId: "test-project",
      featureInfo: { hosting: { public: "public", spa: false } },
      instructions: [],
    };
    const stopError = new Error("stop-after-api-check");
    const loginGithubStub = sandbox.stub(auth, "loginGithub").rejects(stopError);

    await expect(initGitHub(setup)).to.be.rejectedWith(stopError);
    expect(ensureApiEnabledStub).to.have.been.calledOnceWith("test-project");
    expect(ensureApiEnabledStub.calledBefore(loginGithubStub)).to.be.true;
  });
});
