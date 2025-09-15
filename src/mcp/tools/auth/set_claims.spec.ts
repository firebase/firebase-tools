import { expect } from "chai";
import * as sinon from "sinon";
import { set_claim } from "./set_claims";
import * as auth from "../../../gcp/auth";
import * as util from "../../util";
import { ServerToolContext } from "../../tool";

describe("set_claim tool", () => {
  const projectId = "test-project";
  const uid = "test-uid";
  const claim = "admin";

  let setCustomClaimStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    setCustomClaimStub = sinon.stub(auth, "setCustomClaim");
    mcpErrorStub = sinon.stub(util, "mcpError");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should set a simple claim", async () => {
    const value = true;
    setCustomClaimStub.resolves({ success: true });

    const result = await set_claim.fn({ uid, claim, value }, { projectId } as ServerToolContext);

    expect(setCustomClaimStub).to.be.calledWith(
      projectId,
      uid,
      { [claim]: value },
      { merge: true },
    );
    expect(result).to.deep.equal(util.toContent({ success: true }));
  });

  it("should set a JSON claim", async () => {
    const json_value = '{"role": "editor"}';
    const parsedValue = { role: "editor" };
    setCustomClaimStub.resolves({ success: true });

    const result = await set_claim.fn({ uid, claim, json_value }, {
      projectId,
    } as ServerToolContext);

    expect(setCustomClaimStub).to.be.calledWith(
      projectId,
      uid,
      { [claim]: parsedValue },
      { merge: true },
    );
    expect(result).to.deep.equal(util.toContent({ success: true }));
  });

  it("should return an error for invalid JSON", async () => {
    const json_value = "invalid-json";
    await set_claim.fn({ uid, claim, json_value }, { projectId } as ServerToolContext);
    expect(mcpErrorStub).to.be.calledWith(
      `Provided \`json_value\` was not valid JSON: ${json_value}`,
    );
  });

  it("should return an error if both value and json_value are provided", async () => {
    const value = "simple";
    const json_value = '{"complex": true}';
    await set_claim.fn({ uid, claim, value, json_value }, { projectId } as ServerToolContext);
    expect(mcpErrorStub).to.be.calledWith("Must supply only `value` or `json_value`, not both.");
  });
});
