import { expect } from "chai";
import * as sinon from "sinon";
import { get_user } from "./get_user";
import * as auth from "../../../gcp/auth";
import * as util from "../../util";

describe("get_user tool", () => {
  const projectId = "test-project";
  const email = "test@example.com";
  const phoneNumber = "+11234567890";
  const uid = "test-uid";
  const user = { uid, email, phoneNumber };

  let findUserStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    findUserStub = sinon.stub(auth, "findUser");
    mcpErrorStub = sinon.stub(util, "mcpError");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should return an error if no identifier is provided", async () => {
    await (get_user as any)._fn({}, { projectId });
    expect(mcpErrorStub).to.be.calledWith("No user identifier supplied in auth_get_user tool");
  });

  it("should get a user by email", async () => {
    findUserStub.resolves(user);
    const result = await (get_user as any)._fn({ email }, { projectId });
    expect(findUserStub).to.be.calledWith(projectId, email, undefined, undefined);
    expect(result).to.deep.equal(util.toContent(user));
  });

  it("should get a user by phone number", async () => {
    findUserStub.resolves(user);
    const result = await (get_user as any)._fn({ phone_number: phoneNumber }, { projectId });
    expect(findUserStub).to.be.calledWith(projectId, undefined, phoneNumber, undefined);
    expect(result).to.deep.equal(util.toContent(user));
  });

  it("should get a user by UID", async () => {
    findUserStub.resolves(user);
    const result = await (get_user as any)._fn({ uid }, { projectId });
    expect(findUserStub).to.be.calledWith(projectId, undefined, undefined, uid);
    expect(result).to.deep.equal(util.toContent(user));
  });
});
