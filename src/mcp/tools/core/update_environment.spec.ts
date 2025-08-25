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
  let host: any;
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
    const result = await update_environment.fn({ project_dir: projectDir }, {
      config,
      rc,
      host,
    } as any);
    expect(existsSyncStub).to.be.calledWith(projectDir);
    expect(host.setProjectRoot).to.be.calledWith(projectDir);
    expect(result).to.deep.equal(toContent(`- Updated project directory to '${projectDir}'\n`));
  });

  it("should return an error for a non-existent project directory", async () => {
    existsSyncStub.returns(false);
    await update_environment.fn({ project_dir: projectDir }, { config, rc, host } as any);
    expect(mcpErrorStub).to.be.calledWith(
      `Cannot update project directory to '${projectDir}' as it does not exist.`,
    );
  });

  it("should update active project", async () => {
    const result = await update_environment.fn({ active_project: activeProject }, {
      config,
      rc,
      host,
    } as any);
    expect(setNewActiveStub).to.be.calledWith(activeProject, undefined, rc, config.projectDir);
    expect(result).to.deep.equal(toContent(`- Updated active project to '${activeProject}'\n`));
  });

  it("should update active user account", async () => {
    const result = await update_environment.fn({ active_user_account: activeUserAccount }, {
      config,
      rc,
      host,
    } as any);
    expect(assertAccountStub).to.be.calledWith(activeUserAccount, { mcp: true });
    expect(setProjectAccountStub).to.be.calledWith(host.cachedProjectRoot, activeUserAccount);
    expect(result).to.deep.equal(toContent(`- Updated active account to '${activeUserAccount}'\n`));
  });

  it("should handle multiple updates", async () => {
    existsSyncStub.returns(true);
    const result = await update_environment.fn(
      { project_dir: projectDir, active_project: activeProject },
      { config, rc, host } as any,
    );
    expect(host.setProjectRoot).to.be.called;
    expect(setNewActiveStub).to.be.called;
    expect(result).to.deep.equal(
      toContent(
        `- Updated project directory to '${projectDir}'\n- Updated active project to '${activeProject}'\n`,
      ),
    );
  });

  it('should return "No changes were made." if no options are provided', async () => {
    const result = await update_environment.fn({}, { config, rc, host } as any);
    expect(result).to.deep.equal(toContent("No changes were made."));
  });
});
