import { expect } from "chai";
import * as fs from "fs-extra";
import * as nock from "nock";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";

import { appCheckOrigin } from "../api";
import { FirebaseError } from "../error";
import * as appsModule from "../management/apps";
import * as requireAuthModule from "../requireAuth";
import {
  ensureCanCreateOrOverwriteDebugToken,
  getDefaultDisplayName,
  inspectLocalDebugTokens,
  isWebAppId,
  provisionDebugToken,
  validateDebugTokenUuid,
  validateDisplayName,
} from "./debugTokens";
import { getLocalToken, getLocalTokenName, saveLocalToken } from "./localConfig";
import { DebugToken } from "./types";

describe("appcheck debugTokens helpers", () => {
  const projectId = "my-ai-project";
  const projectNumber = "1234567890";
  const iosAppId = `1:${projectNumber}:ios:0a1b2c3d4e5f6a7b8c9d0e`;
  const webAppId = `1:${projectNumber}:web:9f8e7d6c5b4a3f2e1d0c`;
  const validUuid = "e3d9b1a0-cf48-4389-8d19-482a177ffec8";

  let sandbox: sinon.SinonSandbox;
  let tempRoot: string;
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-debugtokens-helper-test-"));
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

  describe("validation & display names", () => {
    it("trims and accepts valid UUID v4 tokens case-insensitively", () => {
      const upper = `  ${validUuid.toUpperCase()}  `;
      expect(validateDebugTokenUuid(upper)).to.equal(validUuid.toUpperCase());
    });

    it("rejects empty, non-UUID, or non-v4 UUID strings with actionable guidance", () => {
      expect(() => validateDebugTokenUuid("   ")).to.throw(FirebaseError, /cannot be empty/);
      expect(() => validateDebugTokenUuid(iosAppId)).to.throw(FirebaseError, /pass --app <appId>/);
      // Version 1 UUID (13th hex char is 1 instead of 4)
      expect(() => validateDebugTokenUuid("e3d9b1a0-cf48-1389-8d19-482a177ffec8")).to.throw(
        FirebaseError,
        /UUID v4/,
      );
    });

    it("enforces 1..50 character display names", () => {
      expect(validateDisplayName("  alice@macbook  ")).to.equal("alice@macbook");
      expect(() => validateDisplayName("   ")).to.throw(FirebaseError, /cannot be empty/);
      expect(() => validateDisplayName("a".repeat(51))).to.throw(
        FirebaseError,
        /maximum length of 50 characters/,
      );
    });

    it("bounds getDefaultDisplayName to <= 50 chars and avoids host collision when saveLocal is false", () => {
      sandbox.stub(os, "userInfo").returns({
        username: "austinbenoit",
        uid: 1000,
        gid: 1000,
        shell: "/bin/bash",
        homedir: tempRoot,
      });
      sandbox.stub(os, "hostname").returns("austinbenoit-long-cloudtop-instance.c.googlers.com");

      const localDefault = getDefaultDisplayName(true);
      expect(localDefault).to.equal("austinbenoit@austinbenoit-long-cloudtop-instance");
      expect(localDefault.length).to.be.at.most(50);

      const remoteDefault = getDefaultDisplayName(false);
      expect(remoteDefault).to.equal(
        "CLI Debug Token (austinbenoit-long-cloudtop-instance)".slice(0, 50),
      );
      expect(remoteDefault).to.not.equal(localDefault);
      expect(remoteDefault.length).to.be.at.most(50);
    });

    it("falls back to user@<host> when os.userInfo throws", () => {
      sandbox.stub(os, "userInfo").throws(new Error("ENOENT"));
      sandbox.stub(os, "hostname").returns("dev-box");

      expect(getDefaultDisplayName(true)).to.equal("user@dev-box");
    });

    it("detects Web App IDs accurately", () => {
      expect(isWebAppId(webAppId)).to.be.true;
      expect(isWebAppId(iosAppId)).to.be.false;
    });
  });

  describe("provisionDebugToken", () => {
    it("creates replacement token BEFORE deleting matching token when below 20-token quota", async () => {
      const callOrder: string[] = [];
      const oldResourceName = `projects/${projectNumber}/apps/${iosAppId}/debugTokens/old-id`;
      const newResourceName = `projects/${projectNumber}/apps/${iosAppId}/debugTokens/new-id`;
      const existing: DebugToken = { name: oldResourceName, displayName: "alice@mac", token: "" };

      nock(appCheckOrigin())
        .post(`/v1/projects/${projectNumber}/apps/${iosAppId}/debugTokens`, {
          displayName: "alice@mac",
          token: validUuid,
        })
        .reply(200, () => {
          callOrder.push("create");
          // Real backend omits/clears `token` in CreateDebugToken response.
          return { name: newResourceName, displayName: "alice@mac" };
        });

      nock(appCheckOrigin())
        .delete(`/v1/${oldResourceName}`)
        .reply(200, () => {
          callOrder.push("delete");
          return {};
        });

      const hydrated = await provisionDebugToken({
        projectNumber,
        appId: iosAppId,
        displayName: "alice@mac",
        token: validUuid,
        existingTokens: [existing],
        matchingTokens: [existing],
        saveLocal: true,
      });

      expect(callOrder).to.deep.equal(["create", "delete"]);
      expect(hydrated).to.deep.equal({
        name: newResourceName,
        displayName: "alice@mac",
        token: validUuid,
      });
      expect(getLocalToken(iosAppId)).to.equal(validUuid);
      expect(getLocalTokenName(iosAppId)).to.equal(newResourceName);
      expect(nock.isDone()).to.be.true;
    });

    it("preserves existing server token if createDebugToken fails when below 20-token quota", async () => {
      const oldResourceName = `projects/${projectNumber}/apps/${iosAppId}/debugTokens/old-id`;
      const existing: DebugToken = { name: oldResourceName, displayName: "alice@mac", token: "" };
      const deleteScope = nock(appCheckOrigin()).delete(`/v1/${oldResourceName}`).reply(200, {});

      nock(appCheckOrigin())
        .post(`/v1/projects/${projectNumber}/apps/${iosAppId}/debugTokens`)
        .reply(500, { error: { message: "Internal backend failure" } });

      await expect(
        provisionDebugToken({
          projectNumber,
          appId: iosAppId,
          displayName: "alice@mac",
          token: validUuid,
          existingTokens: [existing],
          matchingTokens: [existing],
          saveLocal: true,
        }),
      ).to.be.rejectedWith(FirebaseError);

      expect(deleteScope.isDone()).to.be.false;
    });

    it("deletes matching token before creating when app is at the 20-token limit, and throws when 20 unrelated tokens exist", async () => {
      const twentyTokens: DebugToken[] = Array.from({ length: 20 }, (_, idx) => ({
        name: `projects/${projectNumber}/apps/${iosAppId}/debugTokens/tok-${idx}`,
        displayName: `token-${idx}`,
        token: "",
      }));

      expect(() =>
        ensureCanCreateOrOverwriteDebugToken({
          appId: iosAppId,
          existingTokens: twentyTokens,
          matchingTokens: [],
        }),
      ).to.throw(FirebaseError, /maximum of 20 debug tokens/);

      const callOrder: string[] = [];
      nock(appCheckOrigin())
        .delete(`/v1/${twentyTokens[0].name}`)
        .reply(200, () => {
          callOrder.push("delete");
          return {};
        });
      nock(appCheckOrigin())
        .post(`/v1/projects/${projectNumber}/apps/${iosAppId}/debugTokens`)
        .reply(200, () => {
          callOrder.push("create");
          return {
            name: `projects/${projectNumber}/apps/${iosAppId}/debugTokens/new-id`,
            displayName: "token-0",
          };
        });

      await provisionDebugToken({
        projectNumber,
        appId: iosAppId,
        displayName: "token-0",
        token: validUuid,
        existingTokens: twentyTokens,
        matchingTokens: [twentyTokens[0]],
        saveLocal: false,
      });

      expect(callOrder).to.deep.equal(["delete", "create"]);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("inspectLocalDebugTokens", () => {
    it("treats HTTP 409 (hidden/pending-deletion app in App Check) as APP_DELETED and degrades gracefully to UNCHECKED when offline", async () => {
      saveLocalToken(iosAppId, validUuid);

      sandbox.stub(requireAuthModule, "requireAuth").rejects(new FirebaseError("Not logged in"));
      const offlineEntries = await inspectLocalDebugTokens({ project: projectId });
      expect(offlineEntries).to.deep.equal([
        {
          appId: iosAppId,
          tokenPrefix: "e3d9b1a0-...",
          status: "UNCHECKED",
        },
      ]);

      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(os, "homedir").returns(tempRoot);
      sandbox.stub(requireAuthModule, "requireAuth").resolves("a@b.com");
      sandbox.stub(appsModule, "listFirebaseApps").resolves([
        {
          name: `projects/${projectId}/iosApps/${iosAppId}`,
          projectId,
          appId: iosAppId,
          platform: appsModule.AppPlatform.IOS,
        },
        {
          name: `projects/${projectId}/webApps/${webAppId}`,
          projectId,
          appId: webAppId,
          platform: appsModule.AppPlatform.WEB,
        },
      ]);

      saveLocalToken(webAppId, "f4e8c2b1-da59-4490-9e20-593b288ffed9");

      nock(appCheckOrigin())
        .get(`/v1/projects/${projectNumber}/apps/${iosAppId}/debugTokens`)
        .reply(409, { error: { message: "The app is not active" } });
      nock(appCheckOrigin())
        .get(`/v1/projects/${projectNumber}/apps/${webAppId}/debugTokens`)
        .reply(500, { error: { message: "Internal backend failure" } });

      const checkedEntries = await inspectLocalDebugTokens({
        project: projectId,
        projectNumber,
      });
      expect(checkedEntries).to.deep.equal([
        {
          appId: iosAppId,
          tokenPrefix: "e3d9b1a0-...",
          status: "APP_DELETED",
        },
        {
          appId: webAppId,
          tokenPrefix: "f4e8c2b1-...",
          status: "UNCHECKED",
        },
      ]);
      expect(nock.isDone()).to.be.true;
    });
  });
});
