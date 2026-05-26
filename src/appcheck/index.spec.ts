import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";

import {
  createDebugToken,
  listDebugTokens,
  getDebugToken,
  updateDebugToken,
  deleteDebugToken,
  DebugToken,
} from "./index";
import { appCheckOrigin } from "../api";
import { FirebaseError } from "../error";

describe("appcheck", () => {
  const projectNumber = "123456789";
  const appId = "1:123456789:web:abc123def456";
  const parent = `projects/${projectNumber}/apps/${appId}`;
  const debugTokenId = "debug-token-id-123";
  const debugTokenName = `${parent}/debugTokens/${debugTokenId}`;
  const dummyDebugToken: DebugToken = {
    name: debugTokenName,
    displayName: "My Debug Token",
    token: "00000000-0000-0000-0000-000000000000",
    updateTime: "2023-01-01T00:00:00Z",
  };

  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  describe("createDebugToken", () => {
    it("should resolve with created DebugToken on success", async () => {
      nock(appCheckOrigin())
        .post(`/v1/${parent}/debugTokens`, {
          displayName: dummyDebugToken.displayName,
          token: dummyDebugToken.token,
        })
        .reply(200, dummyDebugToken);

      const result = await createDebugToken(
        projectNumber,
        appId,
        dummyDebugToken.displayName,
        dummyDebugToken.token,
      );
      expect(result).to.deep.equal(dummyDebugToken);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw error on failure", async () => {
      nock(appCheckOrigin())
        .post(`/v1/${parent}/debugTokens`)
        .reply(400, { error: { message: "Invalid request" } });

      await expect(
        createDebugToken(projectNumber, appId, dummyDebugToken.displayName, dummyDebugToken.token),
      ).to.be.rejectedWith(FirebaseError, "Invalid request");
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("listDebugTokens", () => {
    it("should resolve with list of DebugTokens on success", async () => {
      nock(appCheckOrigin())
        .get(`/v1/${parent}/debugTokens`)
        .reply(200, { debugTokens: [dummyDebugToken] });

      const result = await listDebugTokens(projectNumber, appId);
      expect(result).to.deep.equal([dummyDebugToken]);
      expect(nock.isDone()).to.be.true;
    });

    it("should handle pagination", async () => {
      const secondToken: DebugToken = {
        ...dummyDebugToken,
        name: `${parent}/debugTokens/token-2`,
      };
      nock(appCheckOrigin())
        .get(`/v1/${parent}/debugTokens`)
        .reply(200, { debugTokens: [dummyDebugToken], nextPageToken: "page-2" });
      nock(appCheckOrigin())
        .get(`/v1/${parent}/debugTokens`)
        .query({ pageToken: "page-2" })
        .reply(200, { debugTokens: [secondToken] });

      const result = await listDebugTokens(projectNumber, appId);
      expect(result).to.deep.equal([dummyDebugToken, secondToken]);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("getDebugToken", () => {
    it("should resolve with DebugToken on success", async () => {
      nock(appCheckOrigin()).get(`/v1/${debugTokenName}`).reply(200, dummyDebugToken);

      const result = await getDebugToken(debugTokenName);
      expect(result).to.deep.equal(dummyDebugToken);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("updateDebugToken", () => {
    it("should resolve with updated DebugToken on success", async () => {
      const updatedToken = { ...dummyDebugToken, displayName: "New Name" };
      nock(appCheckOrigin())
        .patch(`/v1/${debugTokenName}`, { displayName: "New Name" })
        .query({ updateMask: "displayName" })
        .reply(200, updatedToken);

      const result = await updateDebugToken(debugTokenName, "New Name");
      expect(result).to.deep.equal(updatedToken);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("deleteDebugToken", () => {
    it("should resolve on success", async () => {
      nock(appCheckOrigin()).delete(`/v1/${debugTokenName}`).reply(200, {});

      await expect(deleteDebugToken(debugTokenName)).to.be.eventually.fulfilled;
      expect(nock.isDone()).to.be.true;
    });
  });
});
