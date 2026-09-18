import { expect } from "chai";
import { waitForCondition, TriggerEndToEndTest } from "./framework";

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

  describe("TriggerEndToEndTest instance method", () => {
    let test: TriggerEndToEndTest;

    beforeEach(() => {
      test = new TriggerEndToEndTest("test-project", "/tmp", {});
    });

    it("should return a Promise that resolves when condition is true", async () => {
      let count = 0;
      setTimeout(() => {
        count = 3;
      }, 50);

      await test.waitForCondition(() => count >= 3, 1000, 20);
      expect(count).to.equal(3);
    });

    it("should reject the Promise on timeout", async () => {
      let error: Error | undefined;
      try {
        await test.waitForCondition(() => false, 100, 20);
      } catch (err) {
        error = err as Error;
      }

      expect(error).to.exist;
      expect(error?.message).to.include("Timed out waiting for condition after 100ms");
    });

    it("should support legacy callback on success", (done) => {
      let count = 0;
      setTimeout(() => {
        count = 1;
      }, 30);

      test.waitForCondition(
        () => count === 1,
        1000,
        (err) => {
          try {
            expect(err).to.be.undefined;
            expect(count).to.equal(1);
            done();
          } catch (assertErr) {
            done(assertErr);
          }
        },
      );
    });

    it("should support legacy callback on timeout", (done) => {
      test.waitForCondition(
        () => false,
        100,
        (err) => {
          try {
            expect(err).to.exist;
            expect(err?.message).to.include("Timed out waiting for condition");
            done();
          } catch (assertErr) {
            done(assertErr);
          }
        },
      );
    });
  });
});
