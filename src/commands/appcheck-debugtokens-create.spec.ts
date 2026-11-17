import { expect } from "chai";
import * as fs from "fs-extra";
import * as nock from "nock";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";

import { appCheckOrigin } from "../api";
import { getDefaultDisplayName } from "../appcheck/debugTokens";
import { getLocalToken, getLocalTokenName, saveLocalToken } from "../appcheck/localConfig";
import { DebugToken } from "../appcheck/types";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as promptModule from "../prompt";
import * as requireAuthModule from "../requireAuth";
import { command as createCmd } from "./appcheck-debugtokens-create";

describe("appcheck:debugtokens:create", () => {
  const project = "my-ai-project";
  const projectNumber = "1234567890";
  const appId = "1:1234567890:ios:0a1b2c3d4e5f6a7b8c9d0e";
  const webAppId = "1:1234567890:web:9f8e7d6c5b4a3f2e1d0c";
  const parent = `projects/${projectNumber}/apps/${appId}`;
  const tokenId = "7890-abcd";
  const tokenName = `${parent}/debugTokens/${tokenId}`;
  const tokenValue = "e3d9b1a0-cf48-4389-8d19-482a177ffec8";
  const displayName = "CI Runner Token";

  // Matches real App Check v1 CreateDebugToken wire response, where `token` is cleared/omitted.
  const serverResponseToken = {
    name: tokenName,
    displayName,
    updateTime: "2026-07-06T16:20:00Z",
  };

  let sandbox: sinon.SinonSandbox;
  let tempRoot: string;
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-debugtokens-create-test-"));
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

  it("registers a debug token, returns the token string, and saves token + resource name locally", async () => {
    nock(appCheckOrigin()).get(`/v1/${parent}/debugTokens`).reply(200, { debugTokens: [] });

    nock(appCheckOrigin())
      .post(`/v1/${parent}/debugTokens`, {
        displayName,
        token: tokenValue,
      })
      .reply(200, serverResponseToken);

    const result = (await createCmd.runner()(tokenValue, {
      project,
      projectNumber,
      displayName,
      app: appId,
      nonInteractive: true,
    })) as string;

    expect(result).to.equal(tokenValue);
    expect(getLocalToken(appId)).to.equal(tokenValue);
    expect(getLocalTokenName(appId)).to.equal(tokenName);
    expect(nock.isDone()).to.be.true;
  });

  it("does not save locally or collide with host <username>@<hostname> when --no-save-local is passed", async () => {
    const hostDisplayName = getDefaultDisplayName(true);
    const ciDefaultDisplayName = getDefaultDisplayName(false);
    expect(ciDefaultDisplayName).to.not.equal(hostDisplayName);

    const activeLocalToken = "a1b2c3d4-e5f6-4789-89ab-cdef01234567";
    const activeLocalResource = `${parent}/debugTokens/host-id`;
    saveLocalToken(appId, activeLocalToken, activeLocalResource);

    // Host machine's active token exists on the server; --no-save-local must NOT delete it!
    nock(appCheckOrigin())
      .get(`/v1/${parent}/debugTokens`)
      .reply(200, {
        debugTokens: [{ name: activeLocalResource, displayName: hostDisplayName }],
      });

    nock(appCheckOrigin())
      .post(`/v1/${parent}/debugTokens`, {
        displayName: ciDefaultDisplayName,
        token: tokenValue,
      })
      .reply(200, {
        name: tokenName,
        displayName: ciDefaultDisplayName,
      });

    const result = (await createCmd.runner()(tokenValue, {
      project,
      projectNumber,
      app: appId,
      saveLocal: false,
      force: true,
      nonInteractive: true,
    })) as string;

    expect(result).to.equal(tokenValue);
    expect(getLocalToken(appId)).to.equal(activeLocalToken);
    expect(getLocalTokenName(appId)).to.equal(activeLocalResource);
    expect(nock.isDone()).to.be.true;
  });

  it("validates UUID v4 and displayName length upfront before making any network requests", async () => {
    await expect(
      createCmd.runner()(appId, {
        project,
        projectNumber,
        app: appId,
        nonInteractive: true,
      }),
    ).to.be.rejectedWith(FirebaseError, /Expected a UUID v4 string/);

    await expect(
      createCmd.runner()(tokenValue, {
        project,
        projectNumber,
        app: appId,
        displayName: "x".repeat(51),
        nonInteractive: true,
      }),
    ).to.be.rejectedWith(FirebaseError, /maximum length of 50 characters/);
  });

  it("logs Web framework env instructions (.env.local and shell env var + self.FIREBASE_APPCHECK_DEBUG_TOKEN) for Web apps", async () => {
    const loggerInfoSpy = sandbox.spy(logger, "info");

    nock(appCheckOrigin())
      .get(`/v1/projects/${projectNumber}/apps/${webAppId}/debugTokens`)
      .reply(200, { debugTokens: [] });

    nock(appCheckOrigin())
      .post(`/v1/projects/${projectNumber}/apps/${webAppId}/debugTokens`, {
        displayName,
        token: tokenValue,
      })
      .reply(200, {
        ...serverResponseToken,
        name: `projects/${projectNumber}/apps/${webAppId}/debugTokens/${tokenId}`,
      });

    await createCmd.runner()(tokenValue, {
      project,
      projectNumber,
      displayName,
      app: webAppId,
      nonInteractive: true,
    });

    const loggedText = loggerInfoSpy.args.map((a) => a.join(" ")).join("\n");
    expect(loggedText).to.include(`VITE_FIREBASE_APPCHECK_DEBUG_TOKEN=${tokenValue}`);
    expect(loggedText).to.include(`NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN=${tokenValue}`);
    expect(loggedText).to.include(`REACT_APP_FIREBASE_APPCHECK_DEBUG_TOKEN=${tokenValue}`);
    expect(loggedText).to.include("shell environment variable");
    expect(loggedText).to.include("self.FIREBASE_APPCHECK_DEBUG_TOKEN");
    expect(loggedText).to.include(".gitignore");
    expect(nock.isDone()).to.be.true;
  });

  it("replaces matching tokens when --force is passed and errors in non-interactive mode without --force", async () => {
    const existingToken: DebugToken = {
      name: `${parent}/debugTokens/old-id`,
      displayName,
      token: "",
    };

    nock(appCheckOrigin())
      .get(`/v1/${parent}/debugTokens`)
      .reply(200, { debugTokens: [existingToken] });

    await expect(
      createCmd.runner()(tokenValue, {
        project,
        projectNumber,
        displayName,
        app: appId,
        nonInteractive: true,
      }),
    ).to.be.rejectedWith(FirebaseError, /Must pass --force to overwrite in non-interactive mode/);
    expect(nock.isDone()).to.be.true;

    nock(appCheckOrigin())
      .get(`/v1/${parent}/debugTokens`)
      .reply(200, { debugTokens: [existingToken] });
    nock(appCheckOrigin())
      .post(`/v1/${parent}/debugTokens`, { displayName, token: tokenValue })
      .reply(200, serverResponseToken);
    nock(appCheckOrigin()).delete(`/v1/${parent}/debugTokens/old-id`).reply(200, {});

    const result = (await createCmd.runner()(tokenValue, {
      project,
      projectNumber,
      displayName,
      app: appId,
      force: true,
      nonInteractive: true,
    })) as string;

    expect(result).to.equal(tokenValue);
    expect(getLocalToken(appId)).to.equal(tokenValue);
    expect(nock.isDone()).to.be.true;
  });

  it("supports interactive SDK token and display name prompts", async () => {
    sandbox.stub(promptModule, "select").resolves("sdk");
    sandbox.stub(promptModule, "password").resolves(`  ${tokenValue}  `);
    sandbox.stub(promptModule, "input").resolves("  Interactive Token  ");

    nock(appCheckOrigin()).get(`/v1/${parent}/debugTokens`).reply(200, { debugTokens: [] });

    nock(appCheckOrigin())
      .post(`/v1/${parent}/debugTokens`, {
        displayName: "Interactive Token",
        token: tokenValue,
      })
      .reply(200, {
        name: tokenName,
        displayName: "Interactive Token",
      });

    const result = (await createCmd.runner()(undefined, {
      project,
      projectNumber,
      app: appId,
      interactive: true,
    })) as string;

    expect(result).to.equal(tokenValue);
    expect(nock.isDone()).to.be.true;
  });
});
