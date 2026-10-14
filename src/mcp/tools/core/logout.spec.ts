import { expect } from "chai";
import * as sinon from "sinon";
import { logout } from "./logout";
import * as auth from "../../../auth";
import { toContent } from "../../util";
import { Account } from "../../../types/auth";

describe("logout tool", () => {
  let sandbox: sinon.SinonSandbox;
  let getAllAccountsStub: sinon.SinonStub;
  let getGlobalDefaultAccountStub: sinon.SinonStub;
  let getAdditionalAccountsStub: sinon.SinonStub;
  let setGlobalDefaultAccountStub: sinon.SinonStub;
  let logoutStub: sinon.SinonStub;

  const fakeAccount1: Account = {
    user: { email: "test1@example.com" },
    tokens: {
      refresh_token: "token1",
      access_token: "atok1",
      id_token: "idtok1",
      expires_at: 3600,
    },
  };
  const fakeAccount2: Account = {
    user: { email: "test2@example.com" },
    tokens: {
      refresh_token: "token2",
      access_token: "atok2",
      id_token: "idtok2",
      expires_at: 3600,
    },
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    getAllAccountsStub = sandbox.stub(auth, "getAllAccounts");
    getGlobalDefaultAccountStub = sandbox.stub(auth, "getGlobalDefaultAccount");
    getAdditionalAccountsStub = sandbox.stub(auth, "getAdditionalAccounts");
    setGlobalDefaultAccountStub = sandbox.stub(auth, "setGlobalDefaultAccount");
    logoutStub = sandbox.stub(auth, "logout").resolves();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should inform if no user is logged in", async () => {
    getAllAccountsStub.returns([]);
    const result = await logout.fn({ email: undefined }, {} as any);
    expect(result).to.deep.equal(toContent("No need to log out, not logged in"));
  });

  it("should log out a single user", async () => {
    getAllAccountsStub.returns([fakeAccount1]);
    getGlobalDefaultAccountStub.returns(fakeAccount1);
    getAdditionalAccountsStub.returns([]);

    const result = await logout.fn({ email: undefined }, {} as any);

    expect(logoutStub.calledOnceWith("token1")).to.be.true;
    expect((result.content[0] as { text: string }).text).to.include(
      "Logged out from test1@example.com",
    );
  });

  it("should log out a specific user by email", async () => {
    getAllAccountsStub.returns([fakeAccount1, fakeAccount2]);
    getGlobalDefaultAccountStub.returns(fakeAccount1);
    getAdditionalAccountsStub.returns([fakeAccount2]);

    const result = await logout.fn({ email: "test2@example.com" }, {} as any);

    expect(logoutStub.calledOnceWith("token2")).to.be.true;
    expect(logoutStub.callCount).to.equal(1);
    expect((result.content[0] as { text: string }).text).to.include(
      "Logged out from test2@example.com",
    );
  });

  it("should log out all users if no email is provided", async () => {
    getAllAccountsStub.returns([fakeAccount1, fakeAccount2]);
    getGlobalDefaultAccountStub.returns(fakeAccount1);
    getAdditionalAccountsStub.returns([fakeAccount2]);

    await logout.fn({ email: undefined }, {} as any);

    expect(logoutStub.calledTwice).to.be.true;
    expect(logoutStub.calledWith("token1")).to.be.true;
    expect(logoutStub.calledWith("token2")).to.be.true;
  });

  it("should set a new default user when logging out the default", async () => {
    getAllAccountsStub.returns([fakeAccount1, fakeAccount2]);
    getGlobalDefaultAccountStub.returns(fakeAccount1);
    getAdditionalAccountsStub.returns([fakeAccount2]);

    await logout.fn({ email: "test1@example.com" }, {} as any);

    expect(setGlobalDefaultAccountStub.calledOnceWith(fakeAccount2)).to.be.true;
  });
});
