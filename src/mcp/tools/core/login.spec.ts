import { expect } from "chai";
import * as sinon from "sinon";
import { login, ServerWithLoginState } from "./login";
import * as auth from "../../../auth";
import { FirebaseMcpServer } from "../../../mcp";
import { toContent } from "../../util";

describe("login tool", () => {
  let sandbox: sinon.SinonSandbox;
  let loginPrototyperStub: sinon.SinonStub;
  let server: FirebaseMcpServer;
  let getProjectDefaultAccountStub: sinon.SinonStub;
  const fakeAuthorize = sinon.stub();

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    loginPrototyperStub = sandbox.stub(auth, "loginPrototyper").resolves({
      uri: "https://fake.login.uri/auth",
      sessionId: "FAKE_SESSION_ID",
      authorize: fakeAuthorize,
    });
    getProjectDefaultAccountStub = sandbox
      .stub(auth, "getProjectDefaultAccount")
      .returns(undefined);
    server = new FirebaseMcpServer({ projectRoot: "" });
  });

  afterEach(() => {
    sandbox.restore();
    fakeAuthorize.reset();
  });

  it("should return uri and sessionId when no authCode is provided", async () => {
    const result = await login.fn({ authCode: undefined }, { host: server } as any);

    const expectedResult = toContent(
      `Please visit this URL to login: https://fake.login.uri/auth\nYour session ID is: FAKE_SESSION_ID\n\nCRITICAL SECURITY REQUIREMENT:\nAs the agent, you MUST explicitly display BOTH the login URL and the Session ID to the user in your response.\nInstruct the user to verify that the Session ID displayed on the browser matches the Session ID above to prevent phishing attacks before they grant access.\n\nOnce the user has completed the login, instruct them to copy the authorization code and paste it back into the chat.\nThen, call this tool again with the authorization code passed as the 'authCode' parameter to complete the login.`,
    );
    expect(loginPrototyperStub.calledOnce).to.be.true;
    expect(result).to.deep.equal(expectedResult);
    expect((server as ServerWithLoginState).authorize).to.exist;
  });

  it("should call authorize when authCode is provided", async () => {
    (server as ServerWithLoginState).authorize = fakeAuthorize;
    fakeAuthorize.resolves({ user: { email: "test@example.com" } });

    const result = await login.fn({ authCode: "fake_auth_code" }, { host: server } as any);

    expect(fakeAuthorize.calledOnceWith("fake_auth_code")).to.be.true;
    expect(result).to.deep.equal(toContent(`Successfully logged in as test@example.com`));
    expect((server as ServerWithLoginState).authorize).to.not.exist;
  });

  it("should return an error if authCode is provided without starting the flow", async () => {
    const result = await login.fn({ authCode: "fake_auth_code" }, { host: server } as any);

    expect(result.isError).to.be.true;
    expect((result.content[0] as { text: string }).text).to.include("Login flow not started");
  });

  it("should return already logged in message if account exists and reauth is not true", async () => {
    getProjectDefaultAccountStub.returns({ user: { email: "test@example.com" } });

    const result = await login.fn({ authCode: undefined }, { host: server } as any);

    expect(result).to.deep.equal(toContent("Already logged in as test@example.com"));
    expect(loginPrototyperStub.called).to.be.false;
  });

  it("should start login flow if account exists but reauth is true", async () => {
    getProjectDefaultAccountStub.returns({ user: { email: "test@example.com" } });

    const result = await login.fn({ authCode: undefined, reauth: true }, { host: server } as any);

    expect(loginPrototyperStub.calledOnce).to.be.true;
    expect((result.content[0] as { text: string }).text).to.include(
      "Please visit this URL to login",
    );
  });
});
