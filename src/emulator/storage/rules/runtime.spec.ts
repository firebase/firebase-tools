import { expect } from "chai";
import * as sinon from "sinon";
import { createAuthExpressionValue, StorageRulesRuntime } from "./runtime";
import { EmulatorRegistry } from "../../registry";
import { DataLoadStatus, RulesetOperationMethod, RuntimeActionResponse } from "./types";
import { Client } from "../../../apiv2";

// Reaches the private stdout handler and pending-request map so we can drive the
// framing logic directly, without spawning the Java rules runtime.
type RuntimeInternals = {
  _requests: Record<number, { request: unknown; handler: (rap: RuntimeActionResponse) => void }>;
  handleRuntimeStdout(chunk: string): void;
};

function runtimeWithPendingIds(ids: number[]): {
  internals: RuntimeInternals;
  received: number[];
} {
  const internals = new StorageRulesRuntime() as unknown as RuntimeInternals;
  const received: number[] = [];
  internals._requests = {};
  for (const id of ids) {
    internals._requests[id] = {
      request: { id },
      handler: (rap) => received.push(rap.id ?? -1),
    };
  }
  return { internals, received };
}

describe("Storage Rules Runtime", () => {
  describe("Firestore document read limit", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    function mockFirestoreDocumentReads(runtime: StorageRulesRuntime, evaluations: string[][]) {
      const mockClient = sandbox.createStubInstance(Client);
      mockClient.get.resolves({
        status: 200,
        response: {} as Response,
        body: { name: "projects/test/databases/(default)/documents/test/doc", fields: {} },
      });
      sandbox.stub(EmulatorRegistry, "client").returns(mockClient as unknown as Client);

      const sendRequest = sandbox.stub(runtime as any, "_sendRequest");
      let evaluationIndex = -1;
      let pathIndex = 0;
      let serverRequestId = 0;
      sendRequest.callsFake((request: RuntimeActionResponse) => {
        if (request.action === "verify") {
          evaluationIndex++;
          pathIndex = 0;
        } else if (request.status === DataLoadStatus.INVALID_STATE) {
          return Promise.resolve({ errors: ["Rules evaluation failed"], warnings: [] });
        }

        const path = evaluations[evaluationIndex][pathIndex++];
        if (path) {
          return Promise.resolve({
            action: "fetch_firestore_document",
            context: { path },
            server_request_id: ++serverRequestId,
            warnings: [],
            errors: [],
          } as RuntimeActionResponse);
        }
        return Promise.resolve({ result: { permit: true }, errors: [], warnings: [] });
      });

      return { mockClient, sendRequest };
    }

    async function verifyDocumentReads(paths: string[]) {
      const runtime = new StorageRulesRuntime();
      const { mockClient, sendRequest } = mockFirestoreDocumentReads(runtime, [paths]);

      const result = await runtime.verifyWithRuleset("test-ruleset", {
        file: {},
        method: RulesetOperationMethod.GET,
        path: "/b/test/o/file",
        projectId: "test-project",
      });

      return { result, mockClient, sendRequest };
    }

    it("allows one unique Firestore document", async () => {
      const { result } = await verifyDocumentReads(["/documents/one"]);

      expect(result.permitted).to.be.true;
    });

    it("allows two unique Firestore documents", async () => {
      const { result } = await verifyDocumentReads(["/documents/one", "/documents/two"]);

      expect(result.permitted).to.be.true;
    });

    it("denies access to a third unique Firestore document", async () => {
      const { result, mockClient, sendRequest } = await verifyDocumentReads([
        "/documents/one",
        "/documents/two",
        "/documents/three",
      ]);

      expect(result.permitted).to.be.undefined;
      expect(result.issues.errors).to.deep.equal(["Rules evaluation failed"]);
      expect(mockClient.get.callCount).to.equal(2);
      expect(mockClient.get.calledWith("projects/test-project/documents/three")).to.be.false;
      expect(sendRequest.getCall(3).args[0].status).to.equal(DataLoadStatus.INVALID_STATE);
    });

    it("counts repeated reads of the same document only once", async () => {
      const { result, mockClient } = await verifyDocumentReads([
        "/documents/one",
        "/documents/one",
        "/documents/one",
      ]);

      expect(result.permitted).to.be.true;
      expect(mockClient.get.callCount).to.equal(3);
    });

    it("allows repeated reads among two unique Firestore documents", async () => {
      const { result, mockClient } = await verifyDocumentReads([
        "/documents/one",
        "/documents/two",
        "/documents/one",
      ]);

      expect(result.permitted).to.be.true;
      expect(mockClient.get.callCount).to.equal(3);
    });

    it("tracks Firestore documents independently for each Rules evaluation", async () => {
      const runtime = new StorageRulesRuntime();
      const { mockClient } = mockFirestoreDocumentReads(runtime, [
        ["/documents/one", "/documents/two"],
        ["/documents/three", "/documents/four"],
      ]);

      const opts = {
        file: {},
        method: RulesetOperationMethod.GET,
        path: "/b/test/o/file",
        projectId: "test-project",
      };
      const first = await runtime.verifyWithRuleset("test-ruleset", opts);
      const second = await runtime.verifyWithRuleset("test-ruleset", opts);

      expect(first.permitted).to.be.true;
      expect(second.permitted).to.be.true;
      expect(mockClient.get.callCount).to.equal(4);
    });
  });

  describe("createAuthExpressionValue", () => {
    it("should return null if token is missing", () => {
      const opts = {
        file: {},
        method: RulesetOperationMethod.GET,
        path: "test/path",
        projectId: "test-project",
      };

      const result = createAuthExpressionValue(opts);
      expect(result).to.deep.equal({ null_value: null });
    });

    it("should return null if token is invalid", () => {
      const opts = {
        file: {},
        token: "invalid-token",
        method: RulesetOperationMethod.GET,
        path: "test/path",
        projectId: "test-project",
      };

      const result = createAuthExpressionValue(opts);
      expect(result).to.deep.equal({ null_value: null });
    });

    it("should return auth value if token is valid (or at least decodable)", () => {
      // Dummy token with payload: {"user_id": "test_user"}
      const token = "eyJhbGciOiJub25lIn0.eyJ1c2VyX2lkIjoidGVzdF91c2VyIn0.";
      const opts = {
        file: {},
        token: token,
        method: RulesetOperationMethod.GET,
        path: "test/path",
        projectId: "test-project",
      };

      const result = createAuthExpressionValue(opts);
      expect(result.map_value?.fields.uid).to.deep.equal({ string_value: "test_user" });
      expect(result.map_value?.fields.token).to.exist;
    });
  });

  describe("handleRuntimeStdout", () => {
    it("dispatches every response when several arrive in a single chunk", () => {
      // Regression test for #6194 / #6865. Reverting to a per-chunk JSON.parse
      // makes this fail: the concatenated responses throw, are swallowed, and
      // every request in the batch is dropped (and hangs).
      const { internals, received } = runtimeWithPendingIds([1, 2, 3]);

      const chunk = [1, 2, 3].map((id) => `{"id":${id},"status":"ok"}`).join("\n") + "\n";
      internals.handleRuntimeStdout(chunk);

      expect(received).to.deep.equal([1, 2, 3]);
    });

    it("reassembles a response split across two chunks", () => {
      const { internals, received } = runtimeWithPendingIds([7]);

      internals.handleRuntimeStdout(`{"id":7,"stat`);
      expect(received).to.deep.equal([]);

      internals.handleRuntimeStdout(`us":"ok"}\n`);
      expect(received).to.deep.equal([7]);
    });

    it("ignores blank lines and buffers the trailing partial line", () => {
      const { internals, received } = runtimeWithPendingIds([1, 2]);

      internals.handleRuntimeStdout(`\n{"id":1,"status":"ok"}\n{"id":2,"stat`);
      expect(received).to.deep.equal([1]);

      internals.handleRuntimeStdout(`us":"ok"}\n`);
      expect(received).to.deep.equal([1, 2]);
    });
  });
});
