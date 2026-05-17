import { expect } from "chai";
import * as sinon from "sinon";
import { get_project } from "./get_project";
import * as projects from "../../../management/projects";
import { toContent } from "../../util";
import { ServerToolContext } from "../../tool";

describe("get_project tool", () => {
  const projectId = "test-project";
  const project = { projectId, displayName: "My Project" };

  let getProjectStub: sinon.SinonStub;

  beforeEach(() => {
    getProjectStub = sinon.stub(projects, "getProject");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should return project information", async () => {
    getProjectStub.resolves(project);

    const result = await get_project.fn({}, { projectId } as ServerToolContext);

    expect(getProjectStub).to.be.calledWith(projectId);
    expect(result).to.deep.equal(toContent(project));
  });
});
