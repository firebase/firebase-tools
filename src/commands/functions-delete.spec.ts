import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./functions-delete";
import * as backend from "../deploy/functions/backend";
import { FirebaseError } from "../error";

describe("functions:delete", () => {
  let originalBefores: unknown[];
  let existingBackendStub: sinon.SinonStub;

  beforeEach(() => {
    originalBefores = (command as unknown as { befores: unknown[] }).befores;
    (command as unknown as { befores: unknown[] }).befores = [];
    existingBackendStub = sinon.stub(backend, "existingBackend").resolves(backend.empty());
  });

  afterEach(() => {
    (command as unknown as { befores: unknown[] }).befores = originalBefores;
    sinon.restore();
  });

  it("declares filters as a required variadic argument in --help usage", () => {
    expect((command as unknown as { cmd: string }).cmd).to.equal("functions:delete <filters...>");
  });

  it("rejects with a remediation hint when no filters are supplied", async () => {
    await expect(command.runner()([], { project: "test-project" })).to.be.rejectedWith(
      FirebaseError,
      /Must supply at least one function name, group name, or codebase to delete/,
    );
    expect(existingBackendStub).to.not.have.been.called;
  });
});
