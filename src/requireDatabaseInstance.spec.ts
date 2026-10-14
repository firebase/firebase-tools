import { expect } from "chai";
import * as sinon from "sinon";
import {
  requireDatabaseInstance,
  MISSING_DEFAULT_INSTANCE_ERROR_MESSAGE,
} from "./requireDatabaseInstance";
import * as db from "./getDefaultDatabaseInstance";
import { FirebaseError } from "./error";

describe("requireDatabaseInstance", () => {
  let getDefaultDatabaseInstanceStub: sinon.SinonStub;

  beforeEach(() => {
    getDefaultDatabaseInstanceStub = sinon.stub(db, "getDefaultDatabaseInstance");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should do nothing if options.instance is already set", async () => {
    const options = { instance: "my-instance" };
    await requireDatabaseInstance(options);
    expect(options.instance).to.equal("my-instance");
    expect(getDefaultDatabaseInstanceStub).to.not.have.been.called;
  });

  it("should call getDefaultDatabaseInstance if options.instance is not set", async () => {
    const options = {};
    getDefaultDatabaseInstanceStub.resolves("default-instance");
    await requireDatabaseInstance(options);
    expect(getDefaultDatabaseInstanceStub).to.have.been.calledOnce;
  });

  it("should set options.instance to the value returned by getDefaultDatabaseInstance", async () => {
    const options: { instance?: string } = {};
    getDefaultDatabaseInstanceStub.resolves("default-instance");
    await requireDatabaseInstance(options);
    expect(options.instance).to.equal("default-instance");
  });

  it("should throw a FirebaseError if getDefaultDatabaseInstance returns an empty string", async () => {
    const options = {};
    getDefaultDatabaseInstanceStub.resolves("");
    await expect(requireDatabaseInstance(options)).to.be.rejectedWith(
      FirebaseError,
      MISSING_DEFAULT_INSTANCE_ERROR_MESSAGE,
    );
  });

  it("should throw a FirebaseError if getDefaultDatabaseInstance throws an error", async () => {
    const options = { project: "my-project" };
    const error = new Error("Something went wrong");
    getDefaultDatabaseInstanceStub.rejects(error);
    await expect(requireDatabaseInstance(options)).to.be.rejectedWith(
      FirebaseError,
      "Failed to get details for project: my-project.",
    );
  });
});
