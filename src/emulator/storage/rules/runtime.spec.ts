import { expect } from "chai";
import { createAuthExpressionValue, StorageRulesRuntime } from "./runtime";
import { RulesetOperationMethod, RuntimeActionResponse } from "./types";

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
});
