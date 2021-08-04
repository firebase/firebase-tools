import { expect } from "chai";
import * as sinon from "sinon";

import { needProjectNumber, needProjectId, getProjectId } from "../projectUtils";
import * as projects from "../management/projects";
import { RC } from "../rc";

describe("getProjectId", () => {
  it("should prefer projectId, falling back to project", () => {
    expect(getProjectId({ projectId: "this", project: "not_that" })).to.eq("this");
    expect(getProjectId({ project: "this" })).to.eq("this");
  });
});

describe("needProjectId", () => {
  let options: { rc: RC; projectId?: string; project?: string };
  beforeEach(() => {
    options = { rc: new RC(undefined, {}) };
  });

  it("should throw when no project provided and no aliases available", () => {
    expect(() => needProjectId(options)).to.throw("No currently active project");
  });

  it("should throw and mention aliases when they are available", () => {
    options.rc = new RC(undefined, { projects: { "example-alias": "example-project" } });
    expect(() => needProjectId(options)).to.throw("aliases are available");
  });

  it("should return projectId, falling back to project", () => {
    expect(needProjectId({ ...options, projectId: "this", project: "not_that" })).to.eq("this");
    expect(needProjectId({ ...options, project: "this" })).to.eq("this");
  });
});

describe("needProjectNumber", () => {
  let getProjectStub: sinon.SinonStub;

  beforeEach(() => {
    getProjectStub = sinon.stub(projects, "getFirebaseProject").throws(new Error("stubbed"));
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should return the project number from options, if present", async () => {
    const n = await needProjectNumber({ projectNumber: 1 });

    expect(n).to.equal(1);
    expect(getProjectStub).to.not.have.been.called;
  });

  it("should fetch the project number if necessary", async () => {
    getProjectStub.returns({ projectNumber: 2 });

    const n = await needProjectNumber({ project: "foo" });

    expect(n).to.equal(2);
    expect(getProjectStub).to.have.been.calledOnceWithExactly("foo");
  });

  it("should reject with an error on an error", async () => {
    getProjectStub.rejects(new Error("oh no"));

    await expect(needProjectNumber({ project: "foo" })).to.eventually.be.rejectedWith(
      Error,
      "oh no"
    );
  });
});
