import { expect } from "chai";
import * as fs from "fs-extra";
import * as nock from "nock";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";

import { appCheckOrigin } from "../api";
import { saveLocalToken } from "../appcheck/localConfig";
import { DebugToken, LocalDebugTokenEntry } from "../appcheck/types";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as appsModule from "../management/apps";
import * as requireAuthModule from "../requireAuth";
import { command as listCmd } from "./appcheck-debugtokens-list";

describe("appcheck:debugtokens:list", () => {
  const project = "my-ai-project";
  const projectNumber = "1234567890";
  const appId = `1:${projectNumber}:ios:0a1b2c3d4e5f6a7b8c9d0e`;
  const webAppId = `1:${projectNumber}:web:9f8e7d6c5b4a3f2e1d0c`;
  const otherProjectAppId = "1:9999999999:android:abcdef123456";
  const token1 = "e3d9b1a0-cf48-4389-8d19-482a177ffec8";
  const token2 = "f4e8c2b1-da59-4490-9e20-593b288ffed9";
  const tokenName = `projects/${projectNumber}/apps/${appId}/debugTokens/tok-1`;

  const serverDebugToken = {
    name: tokenName,
    displayName: "alice@macbook",
    updateTime: "2026-07-06T16:20:00Z",
  };

  let sandbox: sinon.SinonSandbox;
  let tempRoot: string;
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-debugtokens-list-test-"));
    sandbox.stub(os, "homedir").returns(tempRoot);
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

  it("queries server-registered debug tokens when --local is not passed", async () => {
    sandbox.stub(requireAuthModule, "requireAuth").resolves("a@b.com");
    nock(appCheckOrigin())
      .get(`/v1/projects/${projectNumber}/apps/${appId}/debugTokens`)
      .reply(200, { debugTokens: [serverDebugToken] });

    const result = (await listCmd.runner()({
      project,
      projectNumber,
      app: appId,
    })) as DebugToken[];

    expect(result).to.deep.equal([serverDebugToken]);
    expect(nock.isDone()).to.be.true;
  });

  it("requires authentication when --local is omitted", async () => {
    sandbox.stub(requireAuthModule, "requireAuth").rejects(new FirebaseError("Not authenticated"));

    await expect(
      listCmd.runner()({
        project,
        projectNumber,
        app: appId,
      }),
    ).to.be.rejectedWith(FirebaseError, "Not authenticated");
  });

  it("lists masked local tokens offline without requiring auth or an active project when --local is passed", async () => {
    sandbox.stub(requireAuthModule, "requireAuth").rejects(new FirebaseError("Not authenticated"));
    const loggerInfoSpy = sandbox.spy(logger, "info");

    saveLocalToken(appId, token1, tokenName);
    saveLocalToken(webAppId, token2);

    const result = (await listCmd.runner()({ local: true })) as LocalDebugTokenEntry[];
    expect(result).to.deep.equal([
      {
        appId,
        tokenPrefix: "e3d9b1a0-...",
        status: "UNCHECKED",
        name: tokenName,
      },
      {
        appId: webAppId,
        tokenPrefix: "f4e8c2b1-...",
        status: "UNCHECKED",
      },
    ]);

    const loggedOutput = loggerInfoSpy.args.map((a) => a.join(" ")).join("\n");
    expect(loggedOutput).to.include("e3d9b1a0-...");
    // Full secret UUIDs must never be printed by `list --local`.
    expect(loggedOutput).to.not.include(token1);
    expect(loggedOutput).to.not.include(token2);
  });

  it("enriches server status (Active, Revoked, App Deleted, Unchecked) and filters by --app with --local", async () => {
    sandbox.stub(requireAuthModule, "requireAuth").resolves("a@b.com");
    const manualAppId = `1:${projectNumber}:android:manual`;
    const deletedAppId = `1:${projectNumber}:ios:deleted`;
    saveLocalToken(appId, token1, tokenName);
    saveLocalToken(webAppId, token2);
    saveLocalToken(manualAppId, token2);
    saveLocalToken(deletedAppId, token1);
    saveLocalToken(otherProjectAppId, token2);

    sandbox.stub(appsModule, "listFirebaseApps").resolves([
      {
        name: `projects/${project}/iosApps/${appId}`,
        projectId: project,
        appId,
        platform: appsModule.AppPlatform.IOS,
      },
      {
        name: `projects/${project}/webApps/${webAppId}`,
        projectId: project,
        appId: webAppId,
        platform: appsModule.AppPlatform.WEB,
      },
      {
        name: `projects/${project}/androidApps/${manualAppId}`,
        projectId: project,
        appId: manualAppId,
        platform: appsModule.AppPlatform.ANDROID,
      },
    ]);

    nock(appCheckOrigin())
      .get(`/v1/projects/${projectNumber}/apps/${appId}/debugTokens`)
      .reply(200, { debugTokens: [serverDebugToken] });
    nock(appCheckOrigin())
      .get(`/v1/projects/${projectNumber}/apps/${webAppId}/debugTokens`)
      .reply(200, {});
    nock(appCheckOrigin())
      .get(`/v1/projects/${projectNumber}/apps/${manualAppId}/debugTokens`)
      .reply(200, { debugTokens: [serverDebugToken] });

    const allEntries = (await listCmd.runner()({
      local: true,
      project,
      projectNumber,
    })) as LocalDebugTokenEntry[];

    expect(allEntries).to.deep.equal([
      { appId, tokenPrefix: "e3d9b1a0-...", status: "ACTIVE", name: tokenName },
      { appId: webAppId, tokenPrefix: "f4e8c2b1-...", status: "REVOKED" },
      { appId: manualAppId, tokenPrefix: "f4e8c2b1-...", status: "UNCHECKED" },
      { appId: deletedAppId, tokenPrefix: "e3d9b1a0-...", status: "APP_DELETED" },
      { appId: otherProjectAppId, tokenPrefix: "f4e8c2b1-...", status: "UNCHECKED" },
    ]);
    expect(nock.isDone()).to.be.true;

    nock(appCheckOrigin())
      .get(`/v1/projects/${projectNumber}/apps/${appId}/debugTokens`)
      .reply(200, { debugTokens: [serverDebugToken] });

    const filtered = (await listCmd.runner()({
      local: true,
      app: appId,
      project,
      projectNumber,
    })) as LocalDebugTokenEntry[];
    expect(filtered).to.deep.equal([
      { appId, tokenPrefix: "e3d9b1a0-...", status: "ACTIVE", name: tokenName },
    ]);
    expect(nock.isDone()).to.be.true;
  });

  it("returns empty array when no local tokens match", async () => {
    const empty = (await listCmd.runner()({ local: true })) as LocalDebugTokenEntry[];
    expect(empty).to.deep.equal([]);

    saveLocalToken(appId, token1);
    const missing = (await listCmd.runner()({
      local: true,
      app: "1:1234567890:ios:missing",
    })) as LocalDebugTokenEntry[];
    expect(missing).to.deep.equal([]);
  });
});
