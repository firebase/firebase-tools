import { expect } from "chai";

import { SourceTokenScraper } from "./sourceTokenScraper";

describe("SourceTokenScraper", () => {
  it("immediately provides the first result", async () => {
    const scraper = new SourceTokenScraper();
    await expect(scraper.getToken()).to.eventually.be.undefined;
  });

  it("provides results after the first operation completes", async () => {
    const scraper = new SourceTokenScraper();
    // First result comes right away;
    await expect(scraper.getToken()).to.eventually.be.undefined;

    let gotResult = false;
    const timeout = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error("Timeout")), 10);
    });
    const getResult = (async () => {
      await scraper.getToken();
      gotResult = true;
    })();
    await expect(Promise.race([getResult, timeout])).to.be.rejectedWith("Timeout");
    expect(gotResult).to.be.false;

    scraper.poller({ done: true });
    await expect(getResult).to.eventually.be.undefined;
  });

  it("provides tokens from an operation", async () => {
    const scraper = new SourceTokenScraper();
    // First result comes right away
    await expect(scraper.getToken()).to.eventually.be.undefined;

    scraper.poller({
      metadata: {
        sourceToken: "magic token",
        target: "projects/p/locations/l/functions/f",
      },
    });
    await expect(scraper.getToken()).to.eventually.equal("magic token");
  });

  it("refreshes token after timer expires", async () => {
    const scraper = new SourceTokenScraper(10);
    await expect(scraper.getToken()).to.eventually.be.undefined;
    scraper.poller({
      metadata: {
        sourceToken: "magic token",
        target: "projects/p/locations/l/functions/f",
      },
    });
    await expect(scraper.getToken()).to.eventually.equal("magic token");
    const timeout = (duration: number): Promise<void> => {
      return new Promise<void>((resolve) => setTimeout(resolve, duration));
    };
    await timeout(50);
    await expect(scraper.getToken()).to.eventually.be.undefined;
    scraper.poller({
      metadata: {
        sourceToken: "magic token #2",
        target: "projects/p/locations/l/functions/f",
      },
    });
    await expect(scraper.getToken()).to.eventually.equal("magic token #2");
  });

  it("tries to fetch a new source token upon abort", async () => {
    const scraper = new SourceTokenScraper();
    await expect(scraper.getToken()).to.eventually.be.undefined;
    scraper.abort();
    await expect(scraper.getToken()).to.eventually.be.undefined;
    scraper.poller({
      metadata: {
        sourceToken: "magic token",
        target: "projects/p/locations/l/functions/f",
      },
    });
    await expect(scraper.getToken()).to.eventually.equal("magic token");
  });

  it("concurrent requests for source token", async () => {
    const scraper = new SourceTokenScraper();

    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(scraper.getToken());
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
});
