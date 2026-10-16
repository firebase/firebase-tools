import { expect } from "chai";
import { waitForCondition } from "./waitForCondition";

describe("waitForCondition", () => {
  it("should resolve immediately if condition is already true", async () => {
    let callCount = 0;
    const start = Date.now();
    await waitForCondition(
      () => {
        callCount++;
        return true;
      },
      1000,
      50,
    );
    const duration = Date.now() - start;

    expect(callCount).to.equal(1);
    expect(duration).to.be.lessThan(100);
  });

  it("should poll and resolve when condition becomes true", async () => {
    let count = 0;
    setTimeout(() => {
      count = 5;
    }, 60);

    const start = Date.now();
    await waitForCondition(() => count >= 5, 2000, 20);
    const duration = Date.now() - start;

    expect(count).to.be.at.least(5);
    expect(duration).to.be.at.least(40);
    expect(duration).to.be.lessThan(1500);
  });

  it("should support async predicates", async () => {
    let asyncFlag = false;
    setTimeout(() => {
      asyncFlag = true;
    }, 50);

    await waitForCondition(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return asyncFlag;
      },
      2000,
      20,
    );

    expect(asyncFlag).to.be.true;
  });

  it("should reject with timeout error if condition never becomes true", async () => {
    let error: Error | undefined;
    try {
      await waitForCondition(() => false, 100, 20);
    } catch (err) {
      error = err as Error;
    }

    expect(error).to.exist;
    expect(error?.message).to.include("Timed out waiting for condition after 100ms");
  });

  it("should reject if predicate throws an error", async () => {
    let error: Error | undefined;
    try {
      await waitForCondition(
        () => {
          throw new Error("Predicate failure");
        },
        500,
        20,
      );
    } catch (err) {
      error = err as Error;
    }

    expect(error).to.exist;
    expect(error?.message).to.equal("Predicate failure");
  });
});
