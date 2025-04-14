import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import * as api from "./api";
import { configstore } from "./configstore";
import * as defaultCredentials from "./defaultCredentials";
import { getGlobalDefaultAccount } from "./auth";
import { Account } from "./types/auth";

describe("defaultCredentials", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-tools"));

  const FAKE_TOKEN = {
    refresh_token: "abc123",
  };

  const FAKE_USER = {
    email: "user@domain.com",
  };

  let configStub: sinon.SinonStub;
  let oldHome: any;
  let account: Account;

  beforeEach(() => {
    oldHome = process.env.HOME;
    process.env.HOME = tmpDir;

    // Default configStore mock
    configStub = sandbox.stub(configstore, "get");
    configStub.callsFake((key: string) => {
      if (key === "tokens") {
        return FAKE_TOKEN;
      }

      if (key === "user") {
        return FAKE_USER;
      }
    });

    account = getGlobalDefaultAccount()!;
  });

  afterEach(() => {
    process.env.HOME = oldHome;
    sandbox.restore();
  });

  it("creates a credential file when there are tokens in the config", async () => {
    const credPath = await defaultCredentials.getCredentialPathAsync(account);
    expect(credPath)
      .to.be.a("string")
      .that.satisfies((x: string) => {
        return x.startsWith(tmpDir);
      });

    const fileContents = JSON.parse(fs.readFileSync(credPath!).toString());
    expect(fileContents).to.eql({
      client_id: api.clientId(),
      client_secret: api.clientSecret(),
      refresh_token: FAKE_TOKEN.refresh_token,
      type: "authorized_user",
    });
  });

  it("can clear credentials", async () => {
    const credPath = await defaultCredentials.getCredentialPathAsync(account);
    expect(fs.existsSync(credPath!)).to.be.true;

    defaultCredentials.clearCredentials(account);
    expect(fs.existsSync(credPath!)).to.be.false;
  });

  it("includes the users email in the path", async () => {
    const credPath = await defaultCredentials.getCredentialPathAsync(account);
    const baseName = path.basename(credPath!);

    expect(baseName).to.eq("user_domain_com_application_default_credentials.json");
  });
});
