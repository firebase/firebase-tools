import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";

import { command as debugCmd } from "./appcheck-debug";
import { command as createCmd } from "./appcheck-debugtokens-create";
import { command as listCmd } from "./appcheck-debugtokens-list";
import { command as deleteCmd } from "./appcheck-debugtokens-delete";
import { appCheckOrigin } from "../api";
import { DebugToken } from "../appcheck";

describe("appcheck:debugtoken commands", () => {
  const projectNumber = "1234567890";
  const appId = "1:1234567890:ios:0a1b2c3d4e5f6a7b8c9d0e";
  const parent = `projects/${projectNumber}/apps/${appId}`;
  const tokenId = "7890-abcd";
  const tokenName = `${parent}/debugTokens/${tokenId}`;
  const tokenValue = "e3d9b1a0-cf48-4389-8d19-482a177ffec8";
  const displayName = "CI Runner Token";

  const dummyToken: DebugToken = {
    name: tokenName,
    displayName,
    token: tokenValue,
    updateTime: "2026-07-06T16:20:00Z",
  };

  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  describe("appcheck:debugtoken", () => {
    it("should register a debug token when appId and debugToken are passed", async () => {
      nock(appCheckOrigin())
        .get(`/v1/${parent}/debugTokens`)
        .reply(200, { debugTokens: [] });

      nock(appCheckOrigin())
        .post(`/v1/${parent}/debugTokens`, {
          displayName,
          token: tokenValue,
        })
        .reply(200, dummyToken);

      const options = {
        project: "my-ai-project",
        projectNumber,
        displayName,
        nonInteractive: true,
      };

      const result = await debugCmd.runner()(appId, tokenValue, options);
      expect(result).to.deep.equal(dummyToken);
      expect(nock.isDone()).to.be.true;
    });

    it("should overwrite matching tokens if existing token found", async () => {
      const existingToken: DebugToken = {
        ...dummyToken,
        name: `${parent}/debugTokens/old-id`,
      };

      nock(appCheckOrigin())
        .get(`/v1/${parent}/debugTokens`)
        .reply(200, { debugTokens: [existingToken] });

      nock(appCheckOrigin())
        .post(`/v1/${parent}/debugTokens`, {
          displayName,
          token: tokenValue,
        })
        .reply(200, dummyToken);

      const options = {
        project: "my-ai-project",
        projectNumber,
        displayName,
        nonInteractive: true,
      };

      const result = await debugCmd.runner()(appId, tokenValue, options);
      expect(result).to.deep.equal(dummyToken);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("appcheck:debugtoken:create", () => {
    it("should create debug token non-interactively with display-name option", async () => {
      nock(appCheckOrigin())
        .post(`/v1/${parent}/debugTokens`, {
          displayName,
          token: tokenValue,
        })
        .reply(200, dummyToken);

      const options = {
        project: "my-ai-project",
        projectNumber,
        displayName,
        nonInteractive: true,
      };

      const result = await createCmd.runner()(appId, tokenValue, options);
      expect(result).to.deep.equal(dummyToken);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("appcheck:debugtoken:list", () => {
    it("should list debug tokens for an app", async () => {
      nock(appCheckOrigin())
        .get(`/v1/${parent}/debugTokens`)
        .reply(200, { debugTokens: [dummyToken] });

      const options = {
        project: "my-ai-project",
        projectNumber,
      };

      const result = await listCmd.runner()(appId, options);
      expect(result).to.deep.equal([dummyToken]);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("appcheck:debugtoken:delete", () => {
    it("should delete debug token with --force flag", async () => {
      nock(appCheckOrigin())
        .delete(`/v1/${tokenName}`)
        .reply(200, {});

      const options = {
        project: "my-ai-project",
        projectNumber,
        force: true,
      };

      await deleteCmd.runner()(appId, tokenId, options);
      expect(nock.isDone()).to.be.true;
    });
  });
});
