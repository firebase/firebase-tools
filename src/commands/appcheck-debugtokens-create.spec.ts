import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";

import { command as createCmd } from "./appcheck-debugtokens-create";
import { command as listCmd } from "./appcheck-debugtokens-list";
import { command as deleteCmd } from "./appcheck-debugtokens-delete";
import * as requireAuthModule from "../requireAuth";
import { appCheckOrigin } from "../api";
import { DebugToken } from "../appcheck";

describe("appcheck:debugtokens commands", () => {
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
  let requireAuthStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    requireAuthStub = sandbox.stub(requireAuthModule, "requireAuth");
    requireAuthStub.resolves("a@b.com");
    (createCmd as unknown as { befores: unknown[] }).befores = [];
    (listCmd as unknown as { befores: unknown[] }).befores = [];
    (deleteCmd as unknown as { befores: unknown[] }).befores = [];
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  describe("appcheck:debugtokens:create", () => {
    it("should register a debug token when appId and debugToken are passed", async () => {
      nock(appCheckOrigin())
        .get(/.*debugTokens.*/)
        .reply(200, { debugTokens: [] });

      nock(appCheckOrigin())
        .post(/.*debugTokens.*/, {
          displayName,
          token: tokenValue,
        })
        .reply(200, dummyToken);

      const options = {
        project: "my-ai-project",
        projectNumber,
        displayName,
        app: appId,
        nonInteractive: true,
      };

      const result = (await createCmd.runner()(tokenValue, options)) as DebugToken;
      expect(result).to.deep.equal(dummyToken);
      expect(nock.isDone()).to.be.true;
    });

    it("should overwrite matching tokens if existing token found", async () => {
      const existingToken: DebugToken = {
        ...dummyToken,
        name: `${parent}/debugTokens/old-id`,
      };

      nock(appCheckOrigin())
        .get(/.*debugTokens.*/)
        .reply(200, { debugTokens: [existingToken] });

      nock(appCheckOrigin())
        .delete(/.*debugTokens\/old-id/)
        .reply(200, {});

      nock(appCheckOrigin())
        .post(/.*debugTokens.*/, {
          displayName,
          token: tokenValue,
        })
        .reply(200, dummyToken);

      const options = {
        project: "my-ai-project",
        projectNumber,
        displayName,
        app: appId,
        force: true,
        nonInteractive: true,
      };

      const result = (await createCmd.runner()(tokenValue, options)) as DebugToken;
      expect(result).to.deep.equal(dummyToken);
    });

    it("should throw error if nonInteractive is true and force is false when matching token found", async () => {
      const existingToken: DebugToken = {
        ...dummyToken,
        name: `${parent}/debugTokens/old-id`,
      };

      nock(appCheckOrigin())
        .get(/.*debugTokens.*/)
        .reply(200, { debugTokens: [existingToken] });

      const options = {
        project: "my-ai-project",
        projectNumber,
        displayName,
        app: appId,
        nonInteractive: true,
      };

      await expect(createCmd.runner()(tokenValue, options)).to.be.rejectedWith(
        "Must pass --force to overwrite in non-interactive mode.",
      );
    });
  });

  describe("appcheck:debugtokens:list", () => {
    it("should list debug tokens for an app", async () => {
      nock(appCheckOrigin())
        .get(/.*debugTokens.*/)
        .reply(200, { debugTokens: [dummyToken] });

      const options = {
        project: "my-ai-project",
        projectNumber,
        app: appId,
      };

      const result = (await listCmd.runner()(options)) as DebugToken[];
      expect(result).to.deep.equal([dummyToken]);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("appcheck:debugtokens:delete", () => {
    it("should delete debug token with --force flag", async () => {
      nock(appCheckOrigin())
        .delete(/.*debugTokens.*/)
        .reply(200, {});

      const options = {
        project: "my-ai-project",
        projectNumber,
        app: appId,
        force: true,
      };

      await deleteCmd.runner()(tokenId, options);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw error if full resource name does not match app and project", async () => {
      const mismatchedResource = `projects/${projectNumber}/apps/other-app-id/debugTokens/${tokenId}`;
      const options = {
        project: "my-ai-project",
        projectNumber,
        app: appId,
        force: true,
      };

      await expect(deleteCmd.runner()(mismatchedResource, options)).to.be.rejectedWith(
        "does not belong to app",
      );
    });

    it("should throw error in non-interactive mode if --force is missing", async () => {
      const options = {
        project: "my-ai-project",
        projectNumber,
        app: appId,
        nonInteractive: true,
      };

      await expect(deleteCmd.runner()(tokenId, options)).to.be.rejectedWith(
        "Must pass --force to delete in non-interactive mode.",
      );
    });
  });
});
