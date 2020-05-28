import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";

import * as api from "../api";
import { configstore } from "../configstore";
import * as defaultCredentials from "../defaultCredentials";

describe("defaultCredentials", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  const tmpDir = fs.mkdtempSync("firebase-tools");

  let oldHome: any;

  beforeEach(() => {
    oldHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = oldHome;
    sandbox.restore();
  });

  it("does not create a credential file when there are no tokens in the config", async () => {
    const configStub = sandbox.stub(configstore, "get");
    configStub.returns(undefined);

    const credPath = await defaultCredentials.getCredentialPathAsync();
    expect(credPath).to.be.undefined;
  });

  it("creates a credential file when there are tokens in the config", async () => {
    const configStub = sandbox.stub(configstore, "get");
    configStub.returns({
      refresh_token: "abc123",
    });

    const credPath = await defaultCredentials.getCredentialPathAsync();
    expect(credPath)
      .to.be.a("string")
      .that.satisfies((x: string) => {
        return x.startsWith(tmpDir);
      });

    const fileContents = JSON.parse(fs.readFileSync(credPath!).toString());
    expect(fileContents).to.eql({
      client_id: api.clientId,
      client_secret: api.clientSecret,
      refresh_token: "abc123",
      type: "authorized_user",
    });
  });
});
