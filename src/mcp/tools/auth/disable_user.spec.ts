import { expect } from "chai";
import * as sinon from "sinon";
import { disable_user } from "./disable_user";
import * as auth from "../../../gcp/auth";
import { toContent } from "../../util";

describe("disable_user tool", () => {
  const projectId = "test-project";
  const uid = "test-uid";

  let disableUserStub: sinon.SinonStub;

  beforeEach(() => {
    disableUserStub = sinon.stub(auth, "disableUser");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should disable a user successfully", async () => {
    disableUserStub.resolves({ uid });

    const result = await disable_user.fn({ uid, disabled: true }, { projectId } as any);

    expect(disableUserStub).to.be.calledWith(projectId, uid, true);
    expect(result).to.deep.equal(toContent(`User ${uid} as been disabled`));
  });

  it("should enable a user successfully", async () => {
    disableUserStub.resolves({ uid });

    const result = await disable_user.fn({ uid, disabled: false }, { projectId } as any);

    expect(disableUserStub).to.be.calledWith(projectId, uid, false);
    expect(result).to.deep.equal(toContent(`User ${uid} as been enabled`));
  });

  it("should handle failure to disable a user", async () => {
    disableUserStub.resolves(undefined);

    const result = await disable_user.fn({ uid, disabled: true }, { projectId } as any);

    expect(result).to.deep.equal(toContent(`Failed to disable user ${uid}`));
  });

  it("should handle failure to enable a user", async () => {
    disableUserStub.resolves(undefined);

    const result = await disable_user.fn({ uid, disabled: false }, { projectId } as any);

    expect(result).to.deep.equal(toContent(`Failed to enable user ${uid}`));
  });
});
