import { expect } from "chai";
import * as sinon from "sinon";

import {
  createDebugToken,
  listDebugTokens,
  getDebugToken,
  updateDebugToken,
  deleteDebugToken,
  DebugToken,
  client,
} from "./index";
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
  });

  describe("createDebugToken", () => {
    it("should resolve with created DebugToken on success", async () => {
      const postStub = sandbox.stub(client, "post").resolves({ body: dummyDebugToken } as any);

      const result = await createDebugToken(
        projectNumber,
        appId,
        dummyDebugToken.displayName,
        dummyDebugToken.token,
      );

      expect(result).to.deep.equal(dummyDebugToken);
      expect(postStub.calledOnce).to.be.true;
      expect(postStub.firstCall.args[0]).to.match(/.*debugTokens.*/);
      expect(postStub.firstCall.args[1]).to.deep.equal({
        displayName: dummyDebugToken.displayName,
        token: dummyDebugToken.token,
      });
    });

    it("should throw error on failure", async () => {
      const postStub = sandbox.stub(client, "post").rejects(new FirebaseError("Invalid request"));

      await expect(
        createDebugToken(projectNumber, appId, dummyDebugToken.displayName, dummyDebugToken.token),
      ).to.be.rejectedWith(FirebaseError, "Invalid request");
      expect(postStub.calledOnce).to.be.true;
    });
  });

  describe("listDebugTokens", () => {
    it("should resolve with list of DebugTokens on success", async () => {
      const getStub = sandbox
        .stub(client, "get")
        .resolves({ body: { debugTokens: [dummyDebugToken] } } as any);

      const result = await listDebugTokens(projectNumber, appId);
      expect(result).to.deep.equal([dummyDebugToken]);
      expect(getStub.calledOnce).to.be.true;
      expect(getStub.firstCall.args[0]).to.match(/.*debugTokens.*/);
    });

    it("should handle pagination", async () => {
      const secondToken: DebugToken = {
        ...dummyDebugToken,
        name: `${parent}/debugTokens/token-2`,
      };
      const getStub = sandbox.stub(client, "get");
      getStub
        .onFirstCall()
        .resolves({ body: { debugTokens: [dummyDebugToken], nextPageToken: "page-2" } } as any);
      getStub.onSecondCall().resolves({ body: { debugTokens: [secondToken] } } as any);

      const result = await listDebugTokens(projectNumber, appId);
      expect(result).to.deep.equal([dummyDebugToken, secondToken]);
      expect(getStub.calledTwice).to.be.true;
      expect(getStub.secondCall.args[0]).to.match(/.*debugTokens.*/);
      expect(getStub.secondCall.args[1]).to.deep.equal({ queryParams: { pageToken: "page-2" } });
    });
  });

  describe("getDebugToken", () => {
    it("should resolve with DebugToken on success", async () => {
      const getStub = sandbox.stub(client, "get").resolves({ body: dummyDebugToken } as any);

      const result = await getDebugToken(debugTokenName);
      expect(result).to.deep.equal(dummyDebugToken);
      expect(getStub.calledOnce).to.be.true;
      expect(getStub.firstCall.args[0]).to.match(/.*debugTokens.*/);
    });
  });

  describe("updateDebugToken", () => {
    it("should resolve with updated DebugToken on success", async () => {
      const updatedToken = { ...dummyDebugToken, displayName: "New Name" };
      const patchStub = sandbox.stub(client, "patch").resolves({ body: updatedToken } as any);

      const result = await updateDebugToken(debugTokenName, "New Name");
      expect(result).to.deep.equal(updatedToken);
      expect(patchStub.calledOnce).to.be.true;
      expect(patchStub.firstCall.args[0]).to.match(/.*debugTokens.*/);
      expect(patchStub.firstCall.args[1]).to.deep.equal({ displayName: "New Name" });
      expect(patchStub.firstCall.args[2]).to.deep.equal({
        queryParams: { updateMask: "displayName" },
      });
    });
  });

  describe("deleteDebugToken", () => {
    it("should resolve on success", async () => {
      const deleteStub = sandbox.stub(client, "delete").resolves({ body: {} } as any);

      await expect(deleteDebugToken(debugTokenName)).to.be.eventually.fulfilled;
      expect(deleteStub.calledOnce).to.be.true;
      expect(deleteStub.firstCall.args[0]).to.match(/.*debugTokens.*/);
    });
  });
});
