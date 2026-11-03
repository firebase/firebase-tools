import * as sinon from "sinon";
import { expect } from "chai";
import { command as firestoreDelete } from "./firestore-delete";
import { FirebaseError } from "../error";
import * as requireAuthModule from "../requireAuth";

describe("firestore:delete", () => {
  beforeEach(() => {
    sinon.stub(requireAuthModule, "requireAuth").resolves("a@b.com");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should require a path unless --all-collections is passed", async () => {
    await expect(firestoreDelete.runner()(undefined, {})).to.be.rejectedWith(
      FirebaseError,
      "Must specify a document or collection path, or pass --all-collections to delete the entire database.",
    );
  });

  it("should require -r or --shallow when deleting a collection", async () => {
    await expect(firestoreDelete.runner()("users", { force: true })).to.be.rejectedWith(
      FirebaseError,
      "Must pass recursive (-r, --recursive) or shallow (--shallow) option when deleting a collection.",
    );
  });

  it("should reject passing both -r and --shallow", async () => {
    await expect(
      firestoreDelete.runner()("users", { recursive: true, shallow: true, force: true }),
    ).to.be.rejectedWith(
      FirebaseError,
      "Cannot pass recursive (-r, --recursive) and shallow (--shallow) options together.",
    );
  });
});
