import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./apphosting-rollouts-create";
import * as rollout from "../apphosting/rollout";
import * as projectUtils from "../projectUtils";

const PROJECT_ID = "test-project";
const BACKEND_ID = "test-backend";

describe("apphosting:rollouts:create", () => {
  let originalBefores: unknown[];
  let createRolloutStub: sinon.SinonStub;

  beforeEach(() => {
    originalBefores = (command as unknown as { befores: unknown[] }).befores;
    (command as unknown as { befores: unknown[] }).befores = []; // bypass pre-action hooks
    sinon.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    createRolloutStub = sinon.stub(rollout, "createRollout").resolves();
  });

  afterEach(() => {
    (command as unknown as { befores: unknown[] }).befores = originalBefores;
    sinon.restore();
  });

  it("throws if both --git-branch and --git-commit are specified", async () => {
    await expect(
      command.runner()(BACKEND_ID, { gitBranch: "main", gitCommit: "0123456" }),
    ).to.be.rejectedWith(/Cannot specify both a branch and commit/);
    expect(createRolloutStub).to.not.have.been.called;
  });

  it("throws in non-interactive mode if neither --git-branch nor --git-commit is specified", async () => {
    await expect(command.runner()(BACKEND_ID, { nonInteractive: true })).to.be.rejectedWith(
      /--git-branch or --git-commit/,
    );
    expect(createRolloutStub).to.not.have.been.called;
  });

  it("creates a rollout in non-interactive mode when --git-branch is specified", async () => {
    await command.runner()(BACKEND_ID, { nonInteractive: true, gitBranch: "main" });
    expect(createRolloutStub).to.have.been.calledOnceWith(
      BACKEND_ID,
      PROJECT_ID,
      "main",
      undefined,
      undefined,
    );
  });

  it("defers to createRollout (which prompts) in interactive mode without a branch or commit", async () => {
    await command.runner()(BACKEND_ID, { interactive: true });
    expect(createRolloutStub).to.have.been.calledOnceWith(
      BACKEND_ID,
      PROJECT_ID,
      undefined,
      undefined,
      undefined,
    );
  });
});
