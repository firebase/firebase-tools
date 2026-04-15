import { expect } from "chai";
import * as sinon from "sinon";
import { RC } from "../rc";

import { command } from "./use";
import * as projects from "../management/projects";
import * as studio from "../management/studio";
import * as prompt from "../prompt";
import * as utils from "../utils";
import * as auth from "../requireAuth";
import * as detect from "../detectProjectRoot";
import * as rcModule from "../rc";

describe("use command", () => {
  let getProjectStub: sinon.SinonStub;
  let makeActiveProjectStub: sinon.SinonStub;
  let detectProjectRootStub: sinon.SinonStub;

  beforeEach(() => {
    getProjectStub = sinon.stub(projects, "getProject").resolves({
      projectId: "my-project",
      projectNumber: "123",
      displayName: "My Project",
      resources: {},
    } as unknown as projects.ProjectInfo);
    sinon
      .stub(projects, "listFirebaseProjects")
      .resolves([{ projectId: "my-project" }] as unknown as projects.ProjectInfo[]);
    sinon.stub(studio, "updateStudioFirebaseProject").resolves();
    makeActiveProjectStub = sinon.stub(utils, "makeActiveProject").returns();
    sinon.stub(prompt, "select").resolves("my-project");
    sinon.stub(prompt, "input").resolves("staging");
    sinon.stub(auth, "requireAuth").resolves();
    detectProjectRootStub = sinon.stub(detect, "detectProjectRoot").returns("/path/to/project");
    sinon
      .stub(rcModule, "loadRC")
      .callsFake((options: unknown) => (options as Record<string, unknown>).rc || new RC());
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should throw if not in a project root", async () => {
    detectProjectRootStub.returns(undefined);
    const options = { rc: new RC() };
    await expect(command.runner()("my-project", options)).to.be.rejectedWith(
      /must be run from a Firebase project directory/,
    );
  });

  it("should set active project for existing alias", async () => {
    const rc = new RC(undefined, { projects: { staging: "my-project" } });
    const options = { rc, projectRoot: "/path/to/project" };

    await command.runner()("staging", options);

    expect(makeActiveProjectStub).to.have.been.calledWith("/path/to/project", "staging");
  });

  it("should set active project for project ID directly", async () => {
    const rc = new RC();
    const options = { rc, projectRoot: "/path/to/project" };

    await command.runner()("my-project", options);

    expect(makeActiveProjectStub).to.have.been.calledWith("/path/to/project", "my-project");
  });

  it("should throw if alias not found and not valid project ID", async () => {
    const rc = new RC();
    const options = { rc, projectRoot: "/path/to/project" };
    getProjectStub.rejects(new Error("Not found"));

    await expect(command.runner()("nonexistent", options)).to.be.rejectedWith(
      /Invalid project selection/,
    );
  });

  it("should unalias a project", async () => {
    const rc = new RC(undefined, { projects: { staging: "my-project" } });
    const options = { rc, projectRoot: "/path/to/project", unalias: "staging" };

    await command.runner()(undefined, options);

    expect(rc.hasProjectAlias("staging")).to.be.false;
  });

  it("should add a new alias interactively", async () => {
    const rc = new RC();
    const options = { rc, projectRoot: "/path/to/project", add: true, interactive: true };

    await command.runner()(undefined, options);

    expect(rc.resolveAlias("staging")).to.equal("my-project");
    expect(makeActiveProjectStub).to.have.been.calledWith("/path/to/project", "staging");
  });

  it("should clear the active project", async () => {
    const rc = new RC();
    const options = { rc, projectRoot: "/path/to/project", clear: true, projectAlias: "staging" };

    await command.runner()(undefined, options);

    expect(makeActiveProjectStub).to.have.been.calledWith("/path/to/project", undefined);
  });

  it("should display generic use info if no arguments passed", async () => {
    const rc = new RC(undefined, { projects: { staging: "my-project" } });
    const options = {
      rc,
      projectRoot: "/path/to/project",
      projectAlias: "staging",
      project: "my-project",
    };

    const result = await command.runner()(undefined, options);

    expect(result).to.equal("my-project");
  });
});
