import { expect } from "chai";

import { SourceTokenScraper } from "./sourceTokenScraper";

describe("SourceTokenScraper", () => {
  it("immediately provides the first result", async () => {
    const scraper = new SourceTokenScraper();
    await expect(scraper.withToken(async (t) => t)).to.eventually.be.undefined;
  });

  it("provides results after the first operation completes", async () => {
    const scraper = new SourceTokenScraper();
    // First result comes right away;
    await expect(scraper.withToken(async (t) => t)).to.eventually.be.undefined;

    let gotResult = false;
    const timeout = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error("Timeout")), 10);
    });
    const getResult = scraper.withToken(async (t) => {
      gotResult = true;
      return t;
    });
    await expect(Promise.race([getResult, timeout])).to.be.rejectedWith("Timeout");
    expect(gotResult).to.be.false;

    scraper.poller({ done: true });
    await expect(getResult).to.eventually.be.undefined;
  });

  it("provides tokens from an operation", async () => {
    const scraper = new SourceTokenScraper();
    // First result comes right away
    await expect(scraper.withToken(async (t) => t)).to.eventually.be.undefined;

    scraper.poller({
      metadata: {
        sourceToken: "magic token",
        target: "projects/p/locations/l/functions/f",
      },
    });
    await expect(scraper.withToken(async (t) => t)).to.eventually.equal("magic token");
  });

  it("refreshes token after timer expires", async () => {
    const scraper = new SourceTokenScraper(10);
    await expect(scraper.withToken(async (t) => t)).to.eventually.be.undefined;
    scraper.poller({
      metadata: {
        sourceToken: "magic token",
        target: "projects/p/locations/l/functions/f",
      },
    });
    await expect(scraper.withToken(async (t) => t)).to.eventually.equal("magic token");
    const timeout = (duration: number): Promise<void> => {
      return new Promise<void>((resolve) => setTimeout(resolve, duration));
    };
    await timeout(50);
    await expect(scraper.withToken(async (t) => t)).to.eventually.be.undefined;
    scraper.poller({
      metadata: {
        sourceToken: "magic token #2",
        target: "projects/p/locations/l/functions/f",
      },
    });
    await expect(scraper.withToken(async (t) => t)).to.eventually.equal("magic token #2");
  });

  it("tries to fetch a new source token upon abort", async () => {
    const scraper = new SourceTokenScraper();
    await expect(
      scraper.withToken(async () => {
        throw new Error("Failed deploy");
      }),
    ).to.be.rejectedWith("Failed deploy");

    await expect(scraper.withToken(async (t) => t)).to.eventually.be.undefined;
    scraper.poller({
      metadata: {
        sourceToken: "magic token",
        target: "projects/p/locations/l/functions/f",
      },
    });
    await expect(scraper.withToken(async (t) => t)).to.eventually.equal("magic token");
  });

  it("concurrent requests for source token", async () => {
    const scraper = new SourceTokenScraper();

    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(scraper.withToken(async (t) => t));
    }
    scraper.poller({
      metadata: {
        sourceToken: "magic token",
        target: "projects/p/locations/l/functions/f",
      },
    });

    let successes = 0;
    const tokens = await Promise.all(promises);
    for (const tok of tokens) {
      if (tok === "magic token") {
        successes++;
      }
    }
    expect(tokens.includes(undefined)).to.be.true;
    expect(successes).to.equal(2);
  });

  it("unblocks waiting callers on abort and allows subsequent fetches", async () => {
    const scraper = new SourceTokenScraper();

    // First caller starts fetching and will fail asynchronously
    let failFirst!: (err: Error) => void;
    let firstOp!: Promise<unknown>;
    const firstOpStarted = new Promise<void>((ready) => {
      firstOp = scraper.withToken(
        () =>
          new Promise((_, reject) => {
            failFirst = reject;
            ready();
          }),
      );
    });
    await firstOpStarted;

    // Two callers start waiting for the token
    const waiting1 = scraper.withToken(async (t) => t);
    const waiting2 = scraper.withToken(async (t) => t);

    // Fail the ongoing operation, triggering abort
    failFirst(new Error("Deploy failed"));
    await expect(firstOp).to.be.rejectedWith("Deploy failed");

    // Both waiting callers should receive undefined and not hang
    const [res1, res2] = await Promise.all([waiting1, waiting2]);
    expect(res1).to.be.undefined;
    expect(res2).to.be.undefined;

    // A subsequent caller (or retrying task) should be able to initiate a new fetch
    const retryToken = await scraper.withToken(async (t) => t);
    expect(retryToken).to.be.undefined;

    // And subsequent waiters get the token once poller completes
    const waiterAfterRetry = scraper.withToken(async (t) => t);
    scraper.poller({
      metadata: {
        sourceToken: "new token",
        target: "projects/p/locations/l/functions/f",
      },
    });
    expect(await waiterAfterRetry).to.equal("new token");
  });

  it("withToken returns operation result on success", async () => {
    const scraper = new SourceTokenScraper();
    const result = await scraper.withToken(async (token) => {
      expect(token).to.be.undefined;
      return "success";
    });
    expect(result).to.equal("success");
  });

  it("withToken automatically aborts when operation throws", async () => {
    const scraper = new SourceTokenScraper();

    // First caller starts withToken and fails
    const failedOp = scraper.withToken(async () => {
      throw new Error("Deploy failed");
    });

    await expect(failedOp).to.be.rejectedWith("Deploy failed");

    // A subsequent caller should be able to initiate a new fetch without deadlock
    const nextResult = await scraper.withToken(async (token) => {
      expect(token).to.be.undefined;
      return "recovered";
    });
    expect(nextResult).to.equal("recovered");
  });
});
