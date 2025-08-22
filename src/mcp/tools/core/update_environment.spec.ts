import { expect } from "chai";
import * as sinon from "sinon";
import { update_environment } from "./update_environment";
import * as use from "../../../commands/use";
import * as auth from "../../../auth";
import * as fs from "node:fs";
import * as util from "../../util";
import { toContent } from "../../util";

describe("update_environment tool", () => {
  const projectDir = "/test/dir";
  const activeProject = "new-project";
  const activeUserAccount = "user@example.com";

  let setNewActiveStub: sinon.SinonStub;
  let assertAccountStub: sinon.SinonStub;
  let setProjectAccountStub: sinon.SinonStub;
  let existsSyncStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;
  let host: { cachedProjectRoot: string; setProjectRoot: sinon.SinonStub };
  let config: any;
  let rc: any;

  beforeEach(() => {
    setNewActiveStub = sinon.stub(use, "setNewActive");
    assertAccountStub = sinon.stub(auth, "assertAccount");
    setProjectAccountStub = sinon.stub(auth, "setProjectAccount");
    existsSyncStub = sinon.stub(fs, "existsSync");
    mcpErrorStub = sinon.stub(util, "mcpError");
    host = {
      cachedProjectRoot: "/current/dir",
      setProjectRoot: sinon.stub(),
    };
    config = { projectDir: "/current/dir" };
    rc = {};
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should update project directory", async () => {
    existsSyncStub.returns(true);
    const result = await (update_environment as any)._fn(
      { project_dir: projectDir },
      { config, rc, host },
    );
    expect(existsSyncStub).to.be.calledWith(projectDir);
    expect(host.setProjectRoot).to.be.calledWith(projectDir);
    expect(result).to.deep.equal(toContent(`- Updated project directory to '${projectDir}'\n`));
  });

  it("should return an error for a non-existent project directory", async () => {
    existsSyncStub.returns(false);
    await (update_environment as any)._fn({ project_dir: projectDir }, { config, rc, host });
    expect(mcpErrorStub).to.be.calledWith(
      `Cannot update project directory to '${projectDir}' as it does not exist.`,
    );
  });

  it("should update active project", async () => {
    const result = await (update_environment as any)._fn(
      { active_project: activeProject },
      { config, rc, host },
    );
    expect(setNewActiveStub).to.be.calledWith(activeProject, undefined, rc, config.projectDir);
    expect(result).to.deep.equal(toContent(`- Updated active project to '${activeProject}'\n`));
  });

  it("should update active user account", async () => {
    const result = await (update_environment as any)._fn(
      { active_user_account: activeUserAccount },
      { config, rc, host },
    );
    expect(assertAccountStub).to.be.calledWith(activeUserAccount, { mcp: true });
    expect(setProjectAccountStub).to.be.calledWith(host.cachedProjectRoot, activeUserAccount);
    expect(result).to.deep.equal(toContent(`- Updated active account to '${activeUserAccount}'\n`));
  });

  it("should handle multiple updates", async () => {
    existsSyncStub.returns(true);
    const result = await (update_environment as any)._fn(
      { project_dir: projectDir, active_project: activeProject },
      { config, rc, host },
    );
    expect(host.setProjectRoot).to.be.called;
    expect(setNewActiveStub).to.be.called;
    expect(result.content).to.include(`- Updated project directory to '${projectDir}'\n`);
    expect(result.content).to.include(`- Updated active project to '${activeProject}'\n`);
  });

  it('should return "No changes were made." if no options are provided', async () => {
    const result = await (update_environment as any)._fn({}, { config, rc, host });
    expect(result).to.deep.equal(toContent("No changes were made."));
  });
});
