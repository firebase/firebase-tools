/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { expect } from "chai";
import * as sinon from "sinon";

import { needProjectNumber, needProjectId, getAliases, getProjectId } from "../projectUtils";
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

describe("getAliases", () => {
  it("should return the aliases for a projectId", () => {
    const testProjectId = "my-project";
    const testOptions = {
      rc: {
        hasProjects: true,
        projects: {
          prod: testProjectId,
          prod2: testProjectId,
          staging: "other-project",
        },
      },
    };

    expect(getAliases(testOptions, testProjectId).sort()).to.deep.equal(["prod", "prod2"]);
  });

  it("should return an empty array if there are no aliases in rc", () => {
    const testProjectId = "my-project";
    const testOptions = {
      rc: {
        hasProjects: false,
      },
    };

    expect(getAliases(testOptions, testProjectId)).to.deep.equal([]);
  });
});
