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
  const fakeAuthorize = sinon.stub();

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    loginPrototyperStub = sandbox.stub(auth, "loginPrototyper").resolves({
      uri: "https://fake.login.uri/auth",
      sessionId: "FAKE_SESSION_ID",
      authorize: fakeAuthorize,
    });
    server = new FirebaseMcpServer({ projectRoot: "" });
  });

  afterEach(() => {
    sandbox.restore();
    fakeAuthorize.reset();
  });

  it("should return uri and sessionId when no authCode is provided", async () => {
    const result = await login.fn({ authCode: undefined }, { host: server } as any);

    const expectedResult = toContent(
      `Please visit this URL to login: https://fake.login.uri/auth\nYour session ID is: FAKE_SESSION_ID\nInstruct the use to copy the authorization code from that link, and paste it into chat.\nThen, run this tool again with that as the authCode argument to complete the login.`,
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
    expect(result.content[0].text).to.include("Login flow not started");
  });
});
