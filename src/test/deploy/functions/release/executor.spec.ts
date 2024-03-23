import { expect } from "chai";

import * as executor from "../../../../deploy/functions/release/executor";

describe("Executor", () => {
  describe("QueueExecutor", () => {
    const exec = new executor.QueueExecutor({
      retries: 20,
      maxBackoff: 1,
      backoff: 1,
    });

    it("supports arbitrary return types", async () => {
      await expect(exec.run(() => Promise.resolve(42))).to.eventually.equal(42);
      await expect(exec.run(() => Promise.resolve({ hello: "world" }))).to.eventually.deep.equal({
        hello: "world",
      });
    });

    it("throws errors", async () => {
      const handler = (): Promise<void> => Promise.reject(new Error("Fatal"));
      await expect(exec.run(handler)).to.eventually.be.rejectedWith("Fatal");
    });

    it("retries temporary errors", async () => {
      let throwCount = 0;
      const handler = (): Promise<number> => {
        if (throwCount < 2) {
          throwCount++;
          const err = new Error("Retryable");
          (err as any).code = 429;
          return Promise.reject(err);
        }
        return Promise.resolve(42);
      };

      await expect(exec.run(handler)).to.eventually.equal(42);
    });

    it("eventually gives up on retryable errors", async () => {
      const handler = (): Promise<void> => {
        const err = new Error("Retryable");
        (err as any).code = 429;
        throw err;
      };
      await expect(exec.run(handler)).to.eventually.be.rejectedWith("Retryable");
    });

    it("retries on custom specified retry codes", async () => {
      const handler = (): Promise<void> => {
        const err = new Error("Retryable");
        (err as any).code = 8;
        throw err;
      };
      await expect(
        exec.run(handler, { retryCodes: [...executor.DEFAULT_RETRY_CODES, 8] }),
      ).to.eventually.be.rejectedWith("Retryable");
    });
  });
});
