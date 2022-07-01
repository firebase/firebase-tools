/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
  });
});
