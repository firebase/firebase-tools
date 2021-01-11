import { expect } from "chai";
import * as sinon from "sinon";

import { getProjectNumber } from "../getProjectNumber";
import * as projects from "../management/projects";

describe("getProjectNumber", () => {
  let getProjectStub: sinon.SinonStub;

  beforeEach(() => {
    getProjectStub = sinon.stub(projects, "getFirebaseProject").throws(new Error("stubbed"));
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should return the project number from options, if present", async () => {
    const n = await getProjectNumber({ projectNumber: 1 });

    expect(n).to.equal(1);
    expect(getProjectStub).to.not.have.been.called;
  });

  it("should fetch the project number if necessary", async () => {
    getProjectStub.returns({ projectNumber: 2 });

    const n = await getProjectNumber({ project: "foo" });

    expect(n).to.equal(2);
    expect(getProjectStub).to.have.been.calledOnceWithExactly("foo");
  });

  it("should reject with an error on an error", async () => {
    getProjectStub.rejects(new Error("oh no"));

    await expect(getProjectNumber({ project: "foo" })).to.eventually.be.rejectedWith(
      Error,
      "oh no"
    );
  });
});
