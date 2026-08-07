import { expect } from "chai";

import * as executor from "./executor";

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

    it("retries on custom specified retry predicates", async () => {
      const handler = (): Promise<void> => {
        const err = new Error("Retryable");
        (err as any).code = 8;
        throw err;
      };
      await expect(
        exec.run(handler, {
          retryPredicates: [executor.isTransientError, executor.hasErrorCode(8)],
        }),
      ).to.eventually.be.rejectedWith("Retryable");
    });

    it("retries on task-level retryPredicates", async () => {
      let attempts = 0;
      const handler = (): Promise<string> => {
        attempts++;
        if (attempts === 1) {
          const err: any = new Error(
            "Service account my-sa@project.iam.gserviceaccount.com does not exist",
          );
          err.status = 404;
          return Promise.reject(err);
        }
        return Promise.resolve("success");
      };

      const result = await exec.run(handler, {
        retryPredicates: [executor.isTransientError, executor.isServiceAccount404],
      });
      expect(result).to.equal("success");
      expect(attempts).to.equal(2);
    });

    it("respects queue-level defaultRetryPredicates", async () => {
      let attempts = 0;
      const customExec = new executor.QueueExecutor({
        retries: 5,
        maxBackoff: 1,
        backoff: 1,
        defaultRetryPredicates: [executor.isServiceAccount404],
      });

      const handler = (): Promise<string> => {
        attempts++;
        if (attempts === 1) {
          const err: any = new Error("Service account not found");
          err.status = 404;
          return Promise.reject(err);
        }
        return Promise.resolve("done");
      };

      const result = await customExec.run(handler);
      expect(result).to.equal("done");
      expect(attempts).to.equal(2);
    });
  });

  describe("isServiceAccount404", () => {
    it("matches 404 errors containing service account references", () => {
      const err1: any = new Error("Service account proj@iam.gserviceaccount.com does not exist");
      err1.status = 404;
      expect(executor.isServiceAccount404(err1)).to.be.true;

      const err2: any = new Error("Resource 'serviceaccount' not found");
      err2.code = 404;
      expect(executor.isServiceAccount404(err2)).to.be.true;

      const err3: any = {
        status: 404,
        context: { body: { error: { message: "service account missing" } } },
      };
      expect(executor.isServiceAccount404(err3)).to.be.true;
    });

    it("does not match non-404 errors or non-service-account 404 errors", () => {
      const err1: any = new Error("Service account missing");
      err1.status = 500;
      expect(executor.isServiceAccount404(err1)).to.be.false;

      const err2: any = new Error("Function region us-central1 not found");
      err2.status = 404;
      expect(executor.isServiceAccount404(err2)).to.be.false;
    });

    it("inspects all error message sources when err.message is generic", () => {
      const genericErr: any = new Error("Generic Request Failed 404");
      genericErr.status = 404;
      genericErr.context = {
        body: {
          error: {
            message: "Service account my-sa@project.iam.gserviceaccount.com missing",
          },
        },
      };
      expect(executor.isServiceAccount404(genericErr)).to.be.true;
    });

    it("safely handles circular error objects without throwing", () => {
      const circularErr: any = new Error(
        "Service account proj@iam.gserviceaccount.com does not exist",
      );
      circularErr.status = 404;
      circularErr.self = circularErr; // Circular reference
      expect(executor.isServiceAccount404(circularErr)).to.be.true;
    });
  });

  describe("predicates", () => {
    it("identifies transient errors correctly", () => {
      expect(executor.isQuotaExhaustion({ status: 429 })).to.be.true;
      expect(executor.isConflict({ status: 409 })).to.be.true;
      expect(executor.isServiceUnavailable({ status: 503 })).to.be.true;
      expect(executor.isTransientError({ status: 429 })).to.be.true;
      expect(executor.isTransientError({ status: 409 })).to.be.true;
      expect(executor.isTransientError({ status: 503 })).to.be.true;
      expect(executor.isTransientError({ status: 500 })).to.be.false;
    });
  });
});
