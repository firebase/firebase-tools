import { expect } from "chai";
import * as sinon from "sinon";
import { update_user } from "./update_user";
import * as auth from "../../../gcp/auth";
import { McpContext } from "../../types";

describe("updateUser", () => {
  const projectId = "test-project";
  let setCustomUserClaims: sinon.SinonStub;
  let updateUserDisabled: sinon.SinonStub;

  beforeEach(() => {
    setCustomUserClaims = sinon.stub(auth, "setCustomClaim");
    updateUserDisabled = sinon.stub(auth, "disableUser");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should disable a user", async () => {
    updateUserDisabled.resolves({ uid: "123", disabled: true });

    const result = await update_user.fn({ uid: "123", disabled: true }, {
      projectId,
    } as McpContext);

    expect(result).to.deep.equal({
      content: [
        {
          text: "Successfully updated user 123. User disabled.",
          type: "text",
        },
      ],
    });
    expect(updateUserDisabled).to.have.been.calledWith("123", true);
    expect(setCustomUserClaims).to.not.have.been.called;
  });

  it("should enable a user", async () => {
    updateUserDisabled.resolves({ uid: "123", disabled: false });

    const result = await update_user.fn({ uid: "123", disabled: false }, {
      projectId,
    } as McpContext);

    expect(result).to.deep.equal({
      content: [
        {
          text: "Successfully updated user 123. User enabled.",
          type: "text",
        },
      ],
    });
    expect(updateUserDisabled).to.have.been.calledWith("123", false);
    expect(setCustomUserClaims).to.not.have.been.called;
  });

  it("should set a custom claim", async () => {
    setCustomUserClaims.resolves({ uid: "123", customClaims: { admin: true } });

    const result = await update_user.fn(
      {
        uid: "123",
        claim: "admin",
        claimValue: "true",
      },
      {
        projectId,
      } as McpContext,
    );

    expect(result).to.deep.equal({
      content: [
        {
          text: "Successfully updated user 123. Claim 'admin' set",
          type: "text",
        },
      ],
    });
    expect(setCustomUserClaims).to.have.been.calledWith("123", { admin: true });
    expect(updateUserDisabled).to.not.have.been.called;
  });

  it("should set a custom claim and disable a user", async () => {
    setCustomUserClaims.resolves({ uid: "123", customClaims: { admin: true } });
    updateUserDisabled.resolves({ uid: "123", disabled: true });

    const result = await update_user.fn(
      {
        uid: "123",
        claim: "admin",
        claimValue: "true",
        disabled: true,
      },
      {
        projectId,
      } as McpContext,
    );

    expect(result).to.deep.equal({
      content: [
        {
          text: "Successfully updated user 123. User disabled. Claim 'admin' set",
          type: "text",
        },
      ],
    });
    expect(setCustomUserClaims).to.have.been.calledWith("123", { admin: true });
    expect(updateUserDisabled).to.have.been.calledWith("123", true);
  });

  it("should set a custom claim and enable a user", async () => {
    setCustomUserClaims.resolves({ uid: "123", customClaims: { admin: true } });
    updateUserDisabled.resolves({ uid: "123", disabled: false });

    const result = await update_user.fn(
      {
        uid: "123",
        claim: "admin",
        claimValue: "true",
        disabled: false,
      },
      {
        projectId,
      } as McpContext,
    );

    expect(result).to.deep.equal({
      content: [
        {
          text: "Successfully updated user 123. User enabled. Claim 'admin' set",
          type: "text",
        },
      ],
    });
    expect(setCustomUserClaims).to.have.been.calledWith("123", { admin: true });
    expect(updateUserDisabled).to.have.been.calledWith("123", false);
  });
});
