import { expect } from "chai";
import * as sinon from "sinon";
import { set_sms_region_policy } from "./set_sms_region_policy";
import * as auth from "../../../gcp/auth";
import { toContent } from "../../util";
import { ServerToolContext } from "../../tool";

describe("set_sms_region_policy tool", () => {
  const projectId = "test-project";
  const country_codes = ["us", "ca"];
  const upperCaseCountryCodes = ["US", "CA"];

  let setAllowSmsRegionPolicyStub: sinon.SinonStub;
  let setDenySmsRegionPolicyStub: sinon.SinonStub;

  beforeEach(() => {
    setAllowSmsRegionPolicyStub = sinon.stub(auth, "setAllowSmsRegionPolicy");
    setDenySmsRegionPolicyStub = sinon.stub(auth, "setDenySmsRegionPolicy");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should set an ALLOW policy", async () => {
    setAllowSmsRegionPolicyStub.resolves(true);

    const result = await set_sms_region_policy.fn({ policy_type: "ALLOW", country_codes }, {
      projectId,
    } as ServerToolContext);

    expect(setAllowSmsRegionPolicyStub).to.be.calledWith(projectId, upperCaseCountryCodes);
    expect(setDenySmsRegionPolicyStub).to.not.be.called;
    expect(result).to.deep.equal(toContent(true));
  });

  it("should set a DENY policy", async () => {
    setDenySmsRegionPolicyStub.resolves(true);

    const result = await set_sms_region_policy.fn({ policy_type: "DENY", country_codes }, {
      projectId,
    } as ServerToolContext);

    expect(setDenySmsRegionPolicyStub).to.be.calledWith(projectId, upperCaseCountryCodes);
    expect(setAllowSmsRegionPolicyStub).to.not.be.called;
    expect(result).to.deep.equal(toContent(true));
  });
});
