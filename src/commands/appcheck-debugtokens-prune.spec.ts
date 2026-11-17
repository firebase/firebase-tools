import { expect } from "chai";
import * as fs from "fs-extra";
import * as nock from "nock";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";

import { appCheckOrigin } from "../api";
import { getAllLocalTokens, saveLocalToken } from "../appcheck/localConfig";
import { PruneDebugTokensResult } from "../appcheck/types";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as appsModule from "../management/apps";
import * as promptModule from "../prompt";
import * as requireAuthModule from "../requireAuth";
import { command as pruneCmd } from "./appcheck-debugtokens-prune";

describe("appcheck:debugtokens:prune", () => {
  const project = "my-ai-project";
  const projectNumber = "1234567890";
  const activeAppId = `1:${projectNumber}:ios:0a1b2c3d4e5f6a7b8c9d0e`;
  const revokedAppId = `1:${projectNumber}:android:revoked`;
  const deletedAppId = `1:${projectNumber}:ios:deleted`;
  const otherProjectV1AppId = "1:9999999999:ios:otherproject";
  const otherProjectV2AppId = "2:8888888888:android:otherv2";
  const token1 = "e3d9b1a0-cf48-4389-8d19-482a177ffec8";
  const token2 = "f4e8c2b1-da59-4490-9e20-593b288ffed9";
  const activeTokenName = `projects/${projectNumber}/apps/${activeAppId}/debugTokens/tok-active`;

  let sandbox: sinon.SinonSandbox;
  let tempRoot: string;
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-debugtokens-prune-test-"));
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

  it("prunes deleted apps and revoked tokens with --force while preserving active and other-project apps", async () => {
    const loggerInfoSpy = sandbox.spy(logger, "info");
    saveLocalToken(activeAppId, token1, activeTokenName);
    saveLocalToken(
      revokedAppId,
      token2,
      `projects/${projectNumber}/apps/${revokedAppId}/debugTokens/revoked-id`,
    );
    saveLocalToken(deletedAppId, token1);
    saveLocalToken(otherProjectV1AppId, token2);
    saveLocalToken(otherProjectV2AppId, token2);

    sandbox.stub(appsModule, "listFirebaseApps").resolves([
      {
        name: `projects/${project}/iosApps/${activeAppId}`,
        projectId: project,
        appId: activeAppId,
        platform: appsModule.AppPlatform.IOS,
      },
      {
        name: `projects/${project}/androidApps/${revokedAppId}`,
        projectId: project,
        appId: revokedAppId,
        platform: appsModule.AppPlatform.ANDROID,
      },
    ]);

    nock(appCheckOrigin())
      .get(`/v1/projects/${projectNumber}/apps/${activeAppId}/debugTokens`)
      .reply(200, {
        debugTokens: [{ name: activeTokenName, displayName: "alice@macbook" }],
      });

    // Teammate still has a token on revokedAppId, while this machine's token was revoked!
    nock(appCheckOrigin())
      .get(`/v1/projects/${projectNumber}/apps/${revokedAppId}/debugTokens`)
      .reply(200, {
        debugTokens: [
          {
            name: `projects/${projectNumber}/apps/${revokedAppId}/debugTokens/teammate-id`,
            displayName: "teammate@laptop",
          },
        ],
      });

    const result = (await pruneCmd.runner()({
      project,
      projectNumber,
      force: true,
    })) as PruneDebugTokensResult;

    expect(result.prunedAppIds).to.deep.equal([revokedAppId, deletedAppId]);
    expect(getAllLocalTokens()).to.deep.equal({
      [activeAppId]: token1,
      [otherProjectV1AppId]: token2,
      [otherProjectV2AppId]: token2,
    });

    const loggedOutput = loggerInfoSpy.args.map((a) => a.join(" ")).join("\n");
    expect(loggedOutput).to.include("Server-registered debug tokens are untouched");
    expect(nock.isDone()).to.be.true;
  });

  it("prompts for confirmation interactively and throws in non-interactive mode without --force", async () => {
    saveLocalToken(deletedAppId, token1);
    sandbox.stub(appsModule, "listFirebaseApps").resolves([]);

    await expect(
      pruneCmd.runner()({
        project,
        projectNumber,
        nonInteractive: true,
      }),
    ).to.be.rejectedWith(
      FirebaseError,
      /Must pass --force to prune stale local debug tokens in non-interactive mode/,
    );
    expect(getAllLocalTokens()).to.deep.equal({ [deletedAppId]: token1 });

    const confirmStub = sandbox.stub(promptModule, "confirm").resolves(false);
    await expect(
      pruneCmd.runner()({
        project,
        projectNumber,
        interactive: true,
      }),
    ).to.be.rejectedWith(FirebaseError, /canceled/);
    expect(confirmStub.calledOnce).to.be.true;
    expect(getAllLocalTokens()).to.deep.equal({ [deletedAppId]: token1 });

    confirmStub.resolves(true);
    const result = (await pruneCmd.runner()({
      project,
      projectNumber,
      interactive: true,
    })) as PruneDebugTokensResult;
    expect(result.prunedAppIds).to.deep.equal([deletedAppId]);
    expect(getAllLocalTokens()).to.deep.equal({});
  });

  it("returns empty prunedAppIds without calling APIs when no local tokens exist", async () => {
    const listAppsStub = sandbox.stub(appsModule, "listFirebaseApps");

    const result = (await pruneCmd.runner()({
      project,
      projectNumber,
    })) as PruneDebugTokensResult;

    expect(result).to.deep.equal({ prunedAppIds: [] });
    expect(listAppsStub.called).to.be.false;
  });
});
