import * as sinon from "sinon";
import { expect } from "chai";
import { command } from "./firestore-databases-delete";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import * as prompt from "../prompt";
import * as requireAuthModule from "../requireAuth";

describe("firestore:databases:delete", () => {
  const PROJECT = "test-project";
  const DATABASE = "test-database";
  const DATABASE_PATH = `projects/${PROJECT}/databases/${DATABASE}`;

  let firestoreApiStub: sinon.SinonStubbedInstance<fsi.FirestoreApi>;
  let confirmStub: sinon.SinonStub;

  beforeEach(() => {
    firestoreApiStub = sinon.createStubInstance(fsi.FirestoreApi);
    sinon.stub(fsi, "FirestoreApi").returns(firestoreApiStub);
    sinon.stub(requireAuthModule, "requireAuth").resolves("a@b.com");
    confirmStub = sinon.stub(prompt, "confirm");
    firestoreApiStub.deleteDatabase.resolves({ name: DATABASE_PATH } as types.DatabaseResp);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should fail with remediation in non-interactive mode without --force", async () => {
    await expect(
      command.runner()(DATABASE, { project: PROJECT, nonInteractive: true }),
    ).to.be.rejectedWith(`Deleting ${DATABASE_PATH} requires confirmation. Pass --force`);
    sinon.assert.notCalled(confirmStub);
    sinon.assert.notCalled(firestoreApiStub.deleteDatabase);
  });

  it("should delete without prompting when --force is passed in non-interactive mode", async () => {
    confirmStub.callThrough();

    await command.runner()(DATABASE, { project: PROJECT, nonInteractive: true, force: true });

    sinon.assert.calledOnceWithExactly(firestoreApiStub.deleteDatabase, PROJECT, DATABASE);
  });

  it("should pass force and nonInteractive through to confirm", async () => {
    confirmStub.resolves(true);

    await command.runner()(DATABASE, { project: PROJECT, interactive: true });

    sinon.assert.calledOnceWithMatch(confirmStub, {
      default: false,
      nonInteractive: false,
      force: undefined,
    });
    sinon.assert.calledOnceWithExactly(firestoreApiStub.deleteDatabase, PROJECT, DATABASE);
  });

  it("should throw when the user declines the prompt", async () => {
    confirmStub.resolves(false);

    await expect(
      command.runner()(DATABASE, { project: PROJECT, interactive: true }),
    ).to.be.rejectedWith("Delete database canceled.");
    sinon.assert.notCalled(firestoreApiStub.deleteDatabase);
  });
});
