import { expect } from "chai";
import * as sinon from "sinon";
import { createAuthExpressionValue, fetchFirestoreDocument, StorageRulesRuntime } from "./runtime";
import { DataLoadStatus, RulesetOperationMethod, RuntimeActionResponse } from "./types";
import { EmulatorRegistry } from "../../registry";

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

  describe("fetchFirestoreDocument", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    function stubFirestoreClient(get: sinon.SinonStub) {
      sandbox.stub(EmulatorRegistry, "client").returns({ get } as any);
    }

    function fakeRequest(path = "/documents/jobs/job1") {
      return {
        action: "fetch_firestore_document" as const,
        context: { path },
        warnings: [],
        errors: [],
      };
    }

    it("returns the document immediately on a successful first attempt", async () => {
      const get = sandbox.stub().resolves({ body: { name: "jobs/job1", fields: {} } });
      stubFirestoreClient(get);

      const response = await fetchFirestoreDocument("proj", fakeRequest());

      expect(response.status).to.equal(DataLoadStatus.OK);
      expect(get.callCount).to.equal(1);
    });

    it("returns not_found immediately on a confirmed 404, without retrying", async () => {
      // A 404 from a server that's actually up is a real answer — it must
      // not be retried, both to keep the common "does this exist yet"
      // check fast and to prove the fix doesn't change that fast path.
      const notFound = Object.assign(new Error("Not Found"), { status: 404 });
      const get = sandbox.stub().rejects(notFound);
      stubFirestoreClient(get);

      const response = await fetchFirestoreDocument("proj", fakeRequest());

      expect(response.status).to.equal(DataLoadStatus.NOT_FOUND);
      expect(get.callCount).to.equal(1);
    });

    it("retries past a transient connection failure and succeeds once the server is reachable", async () => {
      // A request that fails to reach the server says nothing about whether
      // the document exists; previously any such failure was reported as an
      // immediate, permanent "not found".
      const connectionRefused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8080"), {
        code: "ECONNREFUSED",
      });
      const get = sandbox.stub();
      get.onCall(0).rejects(connectionRefused);
      get.onCall(1).rejects(connectionRefused);
      get.onCall(2).resolves({ body: { name: "jobs/job1", fields: {} } });
      stubFirestoreClient(get);

      const response = await fetchFirestoreDocument("proj", fakeRequest());

      expect(response.status).to.equal(DataLoadStatus.OK);
      expect(get.callCount).to.equal(3);
    });

    it("returns not_found without retrying when the response body is malformed", async () => {
      // A bad payload is a schema/programming problem, not a transient network
      // one — retrying it would waste time and disguise the real cause.
      const get = sandbox.stub().resolves({ body: undefined });
      stubFirestoreClient(get);

      const response = await fetchFirestoreDocument("proj", fakeRequest());

      expect(response.status).to.equal(DataLoadStatus.NOT_FOUND);
      expect(get.callCount).to.equal(1);
    });

    it("gives up and returns not_found after exhausting retries on a persistent non-404 failure", async () => {
      const timeout = new Error("timeout");
      const get = sandbox.stub().rejects(timeout);
      stubFirestoreClient(get);

      const response = await fetchFirestoreDocument("proj", fakeRequest());

      expect(response.status).to.equal(DataLoadStatus.NOT_FOUND);
      expect(get.callCount).to.equal(3);
    });
  });
});
