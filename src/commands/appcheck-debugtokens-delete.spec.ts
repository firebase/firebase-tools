import { expect } from "chai";
import * as fs from "fs-extra";
import * as nock from "nock";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";

import { appCheckOrigin } from "../api";
import { getLocalToken, saveLocalToken } from "../appcheck/localConfig";
import { FirebaseError } from "../error";
import * as requireAuthModule from "../requireAuth";
import { command as deleteCmd } from "./appcheck-debugtokens-delete";

describe("appcheck:debugtokens:delete", () => {
  const project = "my-ai-project";
  const projectNumber = "1234567890";
  const appId = `1:${projectNumber}:ios:0a1b2c3d4e5f6a7b8c9d0e`;
  const tokenId = "7890-abcd";
  const tokenName = `projects/${projectNumber}/apps/${appId}/debugTokens/${tokenId}`;
  const tokenValue = "e3d9b1a0-cf48-4389-8d19-482a177ffec8";

  let sandbox: sinon.SinonSandbox;
  let tempRoot: string;
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-debugtokens-delete-test-"));
    sandbox.stub(os, "homedir").returns(tempRoot);
    sandbox.stub(requireAuthModule, "requireAuth").resolves("a@b.com");
  });

  afterEach(() => {
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }
    sandbox.restore();
    nock.cleanAll();
    fs.removeSync(tempRoot);
  });

  it("deletes server debug token and removes matching local config entry when --force is passed", async () => {
    saveLocalToken(appId, tokenValue, tokenName);

    nock(appCheckOrigin()).delete(`/v1/${tokenName}`).reply(200, {});

    await deleteCmd.runner()(tokenId, {
      project,
      projectNumber,
      app: appId,
      force: true,
    });

    expect(getLocalToken(appId)).to.be.undefined;
    expect(nock.isDone()).to.be.true;
  });

  it("keeps local config entry intact when deleting a different server token on the same app", async () => {
    saveLocalToken(appId, tokenValue, tokenName);

    nock(appCheckOrigin())
      .delete(`/v1/projects/${projectNumber}/apps/${appId}/debugTokens/ci-token-id`)
      .reply(200, {});

    await deleteCmd.runner()("ci-token-id", {
      project,
      projectNumber,
      app: appId,
      force: true,
    });

    expect(getLocalToken(appId)).to.equal(tokenValue);
    expect(nock.isDone()).to.be.true;
  });

  it("infers appId from full resource name when --app is omitted", async () => {
    saveLocalToken(appId, tokenValue, tokenName);

    nock(appCheckOrigin()).delete(`/v1/${tokenName}`).reply(200, {});

    await deleteCmd.runner()(tokenName, {
      project,
      projectNumber,
      force: true,
    });

    expect(getLocalToken(appId)).to.be.undefined;
    expect(nock.isDone()).to.be.true;
  });

  it("throws error if full resource name does not match app and project", async () => {
    const mismatchedResource = `projects/${projectNumber}/apps/other-app-id/debugTokens/${tokenId}`;

    await expect(
      deleteCmd.runner()(mismatchedResource, {
        project,
        projectNumber,
        app: appId,
        force: true,
      }),
    ).to.be.rejectedWith(FirebaseError, /does not belong to app/);
  });

  it("throws error in non-interactive mode if --force is missing", async () => {
    await expect(
      deleteCmd.runner()(tokenId, {
        project,
        projectNumber,
        app: appId,
        nonInteractive: true,
      }),
    ).to.be.rejectedWith(FirebaseError, "Must pass --force to delete in non-interactive mode.");
  });
});
