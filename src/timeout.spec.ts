import { expect } from "chai";
import { timeoutFallback, timeoutError } from "./timeout";

describe("timeoutFallback", () => {
  it("should resolve with the promise value when it completes before timeout", async () => {
    const promise = new Promise<string>((resolve) => setTimeout(() => resolve("success"), 10));
    const result = await timeoutFallback(promise, "fallback", 20);
    expect(result).to.equal("success");
  });

  it("should resolve with the fallback value when timeout occurs", async () => {
    const promise = new Promise<string>((resolve) => setTimeout(() => resolve("success"), 30));
    const result = await timeoutFallback(promise, "fallback", 20);
    expect(result).to.equal("fallback");
  });
});

describe("timeoutError", () => {
  it("should resolve with the promise value when it completes before timeout", async () => {
    const promise = new Promise<string>((resolve) => setTimeout(() => resolve("success"), 10));
    const result = await timeoutError(promise, "error", 20);
    expect(result).to.equal("success");
  });

  it("should reject with a default error when timeout occurs", async () => {
    const promise = new Promise<string>((resolve) => setTimeout(() => resolve("success"), 30));
    try {
      await timeoutError(promise, undefined, 20);
      expect.fail("should have thrown");
    } catch (e: any) {
      expect(e.message).to.equal("Operation timed out.");
    }
  });

  it("should reject with a custom error message when timeout occurs", async () => {
    const promise = new Promise<string>((resolve) => setTimeout(() => resolve("success"), 30));
    const errorMessage = "custom error";
    try {
      await timeoutError(promise, errorMessage, 20);
      expect.fail("should have thrown");
    } catch (e: any) {
      expect(e.message).to.equal(errorMessage);
    }
  });

  it("should reject with a custom error object when timeout occurs", async () => {
    const promise = new Promise<string>((resolve) => setTimeout(() => resolve("success"), 30));
    const error = new Error("custom error object");
    try {
      await timeoutError(promise, error, 20);
      expect.fail("should have thrown");
    } catch (e: any) {
      expect(e).to.equal(error);
    }
  });
});
