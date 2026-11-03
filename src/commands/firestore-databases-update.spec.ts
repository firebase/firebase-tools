import * as sinon from "sinon";
import { expect } from "chai";
import { command as firestoreDatabasesUpdate } from "./firestore-databases-update";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { FirebaseError } from "../error";

describe("firestore:databases:update", () => {
  const PROJECT = "test-project";
  const DATABASE = "test-database";

  let firestoreApiStub: sinon.SinonStubbedInstance<fsi.FirestoreApi>;

  beforeEach(() => {
    firestoreApiStub = sinon.createStubInstance(fsi.FirestoreApi);
    sinon.stub(fsi, "FirestoreApi").returns(firestoreApiStub);
    firestoreApiStub.updateDatabase.resolves({
      name: `projects/${PROJECT}/databases/${DATABASE}`,
    } as types.DatabaseResp);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should throw an error naming both flags if no properties are specified", async () => {
    await expect(
      firestoreDatabasesUpdate.runner()(DATABASE, { project: PROJECT }),
    ).to.be.rejectedWith(
      FirebaseError,
      "Specify at least one of --delete-protection or --point-in-time-recovery",
    );
    sinon.assert.notCalled(firestoreApiStub.updateDatabase);
  });

  it("should reject an invalid --delete-protection value", async () => {
    await expect(
      firestoreDatabasesUpdate.runner()(DATABASE, {
        project: PROJECT,
        deleteProtection: "enabled",
      }),
    ).to.be.rejectedWith(FirebaseError, "Invalid value for flag --delete-protection");
    sinon.assert.notCalled(firestoreApiStub.updateDatabase);
  });

  it("should leave point-in-time recovery unchanged when only --delete-protection is set", async () => {
    await firestoreDatabasesUpdate.runner()(DATABASE, {
      project: PROJECT,
      deleteProtection: "ENABLED",
    });
    sinon.assert.calledOnceWithExactly(
      firestoreApiStub.updateDatabase,
      PROJECT,
      DATABASE,
      types.DatabaseDeleteProtectionState.ENABLED,
      undefined,
    );
  });

  it("should leave delete protection unchanged when only --point-in-time-recovery is set", async () => {
    await firestoreDatabasesUpdate.runner()(DATABASE, {
      project: PROJECT,
      pointInTimeRecovery: "DISABLED",
    });
    sinon.assert.calledOnceWithExactly(
      firestoreApiStub.updateDatabase,
      PROJECT,
      DATABASE,
      undefined,
      types.PointInTimeRecoveryEnablement.DISABLED,
    );
  });
});
