import { expect } from "chai";
import * as sinon from "sinon";
import { update_user } from "./update_user";
import * as auth from "../../../gcp/auth";
import { McpContext } from "../../types";
import * as util from "../../util";

describe("updateUser", () => {
  const projectId = "test-project";
  let setCustomClaimsStub: sinon.SinonStub;
  let toggleuserEnablementStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    setCustomClaimsStub = sinon.stub(auth, "setCustomClaim");
    toggleuserEnablementStub = sinon.stub(auth, "toggleUserEnablement");
    mcpErrorStub = sinon.stub(util, "mcpError");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should disable a user", async () => {
    toggleuserEnablementStub.resolves(true);

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
    expect(toggleuserEnablementStub).to.have.been.calledWith(projectId, "123", true);
    expect(setCustomClaimsStub).to.not.have.been.called;
  });

  it("should enable a user", async () => {
    toggleuserEnablementStub.resolves(true);

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
    expect(toggleuserEnablementStub).to.have.been.calledWith(projectId, "123", false);
    expect(setCustomClaimsStub).to.not.have.been.called;
  });

  it("should set a custom claim", async () => {
    setCustomClaimsStub.resolves({ uid: "123", customClaims: { admin: true } });

    const result = await update_user.fn(
      {
        uid: "123",
        claim: { key: "admin", value: true },
      },
      {
        projectId,
      } as McpContext,
    );

    expect(result).to.deep.equal({
      content: [
        {
          text: "Successfully updated user 123. Claim 'admin' set.",
          type: "text",
        },
      ],
    });
    expect(setCustomClaimsStub).to.have.been.calledWith(projectId, "123", { admin: true });
    expect(toggleuserEnablementStub).to.not.have.been.called;
  });

  it("should fail to set a custom claim and disable a user", async () => {
    setCustomClaimsStub.resolves({ uid: "123", customClaims: { admin: true } });
    toggleuserEnablementStub.resolves(true);

    await update_user.fn(
      {
        uid: "123",
        claim: { key: "admin", value: true },
        disabled: true,
      },
      {
        projectId,
      } as McpContext,
    );

    expect(mcpErrorStub).to.be.calledWith(
      "Can only enable/disable a user or set a claim, not both.",
    );
  });
});
