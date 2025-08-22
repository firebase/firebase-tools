import { expect } from "chai";
import * as sinon from "sinon";
import { validate_rules } from "./validate_rules";
import * as util from "../../util";
import * as rtdb from "../../../rtdb";
import * as apiv2 from "../../../apiv2";
import * as error from "../../../error";

describe("validate_rules tool", () => {
  const projectId = "test-project";
  const rules = '{"rules": {".read": true}}';
  const databaseUrl = "http://localhost:9000";

  let updateRulesStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;
  let getErrMsgStub: sinon.SinonStub;
  let clientConstructorStub: sinon.SinonStub;
  let loggerDebugStub: sinon.SinonStub;
  let mockHost: any;

  beforeEach(() => {
    updateRulesStub = sinon.stub(rtdb, "updateRulesWithClient");
    mcpErrorStub = sinon.stub(util, "mcpError");
    getErrMsgStub = sinon.stub(error, "getErrMsg");
    // We don't want to call the real constructor, so we stub the whole class.
    clientConstructorStub = sinon.stub(apiv2, "Client");
    loggerDebugStub = sinon.stub();
    mockHost = { logger: { debug: loggerDebugStub } };
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should return a success message for valid rules", async () => {
    updateRulesStub.resolves();
    const result = await (validate_rules as any)._fn(
      { rules, databaseUrl },
      { projectId, host: mockHost },
    );

    expect(clientConstructorStub).to.be.calledWith({ urlPrefix: databaseUrl });
    const clientInstance = clientConstructorStub.getCall(0).returnValue;
    expect(updateRulesStub).to.be.calledWith(clientInstance, rules, { dryRun: true });
    expect(result).to.deep.equal(util.toContent("the inputted rules are valid!"));
  });

  it("should use the default database URL if not provided", async () => {
    updateRulesStub.resolves();
    await (validate_rules as any)._fn({ rules }, { projectId, host: mockHost });

    expect(clientConstructorStub).to.be.calledWith({
      urlPrefix: `https://${projectId}-default-rtdb.us-central1.firebasedatabase.app`,
    });
  });

  it("should return an error for invalid rules", async () => {
    const thrownError = new Error("Invalid rules");
    const errorMessage = "Parsed error";
    updateRulesStub.rejects(thrownError);
    getErrMsgStub.returns(errorMessage);

    await (validate_rules as any)._fn({ rules, databaseUrl }, { projectId, host: mockHost });

    expect(getErrMsgStub).to.be.calledWith(thrownError);
    expect(mcpErrorStub).to.be.calledWith(errorMessage);
  });
});
